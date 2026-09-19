import { Router } from "express";
import {
  buildSiwsMessage,
  shortenAddress,
  type NonceResponse,
  type VerifyRequest,
  type VerifyResponse,
} from "@crazycauldron/shared";
import { config } from "../config.js";
import { players } from "../db/index.js";
import { log } from "../logger.js";
import { checkHold } from "../tokengate/index.js";
import { issueToken } from "./jwt.js";
import { issueNonce } from "./nonceStore.js";
import { rateLimit } from "./rateLimit.js";
import { verifySiws } from "./siwsVerify.js";

export const authRouter = Router();

// Both endpoints share one limiter instance so nonce-farming and signature
// guessing draw down the same per-IP budget.
const limiter = rateLimit(config.authRateLimit, config.authRateWindowMs);

/**
 * Hands out a single-use nonce plus the exact message the wallet should sign.
 * The client must not build the message itself - /auth/verify compares against
 * a server-rendered copy and rejects anything that differs.
 */
authRouter.get("/nonce", limiter, (req, res) => {
  const address = typeof req.query.address === "string" ? req.query.address.trim() : "";
  if (!address) {
    return res
      .status(400)
      .json({ error: "bad_request", message: "An ?address= query parameter is required." });
  }

  const { nonce, issuedAt, expiresAt } = issueNonce();
  const body: NonceResponse = {
    nonce,
    message: buildSiwsMessage({
      domain: config.siwsDomain,
      address,
      uri: config.siwsUri,
      nonce,
      issuedAt: issuedAt.toISOString(),
    }),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  return res.json(body);
});

/**
 * Signature -> session. Order matters: prove the wallet first, then ask whether
 * it holds enough $COOK. A wallet that fails the gate still proved ownership,
 * which is why the 403 carries real numbers for the UI to display.
 */
authRouter.post("/verify", limiter, async (req, res) => {
  const { address, message, signature } = (req.body ?? {}) as Partial<VerifyRequest>;
  if (typeof address !== "string" || typeof message !== "string" || typeof signature !== "string") {
    return res.status(400).json({
      error: "bad_request",
      message: "address, message and signature are all required.",
    });
  }

  const result = verifySiws(address, message, signature);
  if (!result.ok) {
    log.authFailure(result.reason, { address });
    return res
      .status(401)
      .json({ error: "unauthorized", message: "Sign-in could not be verified. Please try again." });
  }

  let hold;
  try {
    hold = await checkHold(address);
  } catch (err) {
    log.error("auth.hold_check_failed", { address, message: (err as Error).message });
    return res.status(503).json({ error: "gate_unavailable", message: (err as Error).message });
  }

  if (!hold.ok) {
    log.authFailure("insufficient_hold", { address, balance: hold.balance });
    return res.status(403).json({
      error: "insufficient_hold",
      message: `The hub is open to holders of at least ${hold.minHold} $COOK.`,
      balance: hold.balance,
      minHold: hold.minHold,
    });
  }

  const player = await players.upsertOnLogin(address, shortenAddress(address));
  const body: VerifyResponse = {
    token: issueToken(player.wallet, player.displayName),
    wallet: player.wallet,
    displayName: player.displayName,
    balance: hold.balance,
    minHold: hold.minHold,
  };
  log.info("auth.success", { wallet: player.wallet, bypassed: hold.bypassed });
  return res.json(body);
});
