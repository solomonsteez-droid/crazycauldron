/**
 * The three things a shop needs: what is for sale, a transaction to sign, and
 * a way to prove it was signed.
 *
 * Nothing here is reachable while SHOP_ENABLED is false, which is the default.
 * The check is on every route rather than on the one that builds the payment,
 * because "the button is hidden" has never been a security boundary.
 */

import { Router } from "express";
import { SHOP_ITEMS, WARDROBE_ITEMS } from "@crazycauldron/shared";
import { requireAuth } from "../auth/middleware.js";
import { config } from "../config.js";
import { gameStore } from "../db/index.js";
import { log } from "../logger.js";
import { checkHold } from "../tokengate/index.js";
import { quote, ShopError, verifyPayment } from "./purchase.js";

export const shopRouter = Router();

/** Turns a ShopError into its status code; anything else is a 500. */
function fail(res: import("express").Response, err: unknown): void {
  if (err instanceof ShopError) {
    const status =
      err.code === "shop_disabled"
        ? 404
        : err.code === "not_finalized"
          ? 202
          : err.code === "unknown_item"
            ? 404
            : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return;
  }
  log.error("shop.failed", { message: (err as Error).message });
  res.status(502).json({
    error: "chain_unreachable",
    message: "Could not reach the chain just now. Please try again.",
  });
}

/**
 * The catalogue, and whether the shop is open.
 *
 * Unauthenticated, and answers even when the shop is closed - a client that
 * can see "closed" renders an honest panel instead of an empty one.
 */
shopRouter.get("/items", (_req, res) => {
  const named = SHOP_ITEMS.map((item) => ({
    ...item,
    name: WARDROBE_ITEMS.find((w) => w.id === item.itemId)?.name ?? item.itemId,
  }));
  res.json({
    enabled: config.shopEnabled,
    mint: config.cookMint,
    treasuryWallet: config.shopEnabled ? config.treasuryWallet : null,
    items: config.shopEnabled ? named : [],
  });
});

/**
 * Builds the unsigned transaction for one item.
 *
 * The response also carries what the purchase would do to the buyer's balance.
 * Spending down through MIN_HOLD does not block anything - it is their money -
 * but being told afterwards that you can no longer get into the hub you just
 * bought a hat for would be a genuinely terrible experience.
 */
shopRouter.post("/quote", requireAuth, async (req, res) => {
  const wallet = req.claims!.wallet;
  const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";

  try {
    const hold = await checkHold(wallet, true);
    const built = await quote(wallet, itemId, hold.balance);

    if (built.dropsBelowMinHold) {
      log.info("shop.quote_below_min_hold", {
        wallet,
        itemId,
        balance: built.balance,
        after: built.balanceAfter,
        minHold: built.minHold,
      });
    }
    res.json(built);
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Grants the item, if the chain says it was paid for.
 *
 * The signature is checked against the chain and then recorded; recording it
 * is what stops the same payment being claimed twice, so the two happen in one
 * write rather than as a check followed by a grant.
 */
shopRouter.post("/claim", requireAuth, async (req, res) => {
  const wallet = req.claims!.wallet;
  const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
  const signature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";

  if (!signature) {
    res.status(400).json({ error: "bad_request", message: "A transaction signature is required." });
    return;
  }

  try {
    const settled = await verifyPayment(wallet, itemId, signature);
    const { granted } = await gameStore.claimPurchase({
      ...settled,
      wallet,
      at: new Date().toISOString(),
    });

    if (!granted) {
      log.warn("shop.replay", { wallet, itemId, signature });
      res.status(409).json({
        error: "already_claimed",
        message: "That payment has already been claimed.",
      });
      return;
    }

    log.info("shop.granted", { wallet, itemId, signature, cook: settled.cook });
    /*
     * The unlock is written to the wardrobe table, which a session reads when
     * it loads. A player already in a room gets it on their next join rather
     * than instantly - acceptable while the shop is dormant, and the note is
     * here so that whoever turns it on knows it is the thing to fix.
     */
    res.json({ granted: true, itemId, cook: settled.cook, appliesOnNextJoin: true });
  } catch (err) {
    fail(res, err);
  }
});

/** What this wallet has already bought. Also how a client avoids double-paying. */
shopRouter.get("/purchases", requireAuth, async (req, res) => {
  try {
    res.json({ purchases: await gameStore.purchasesOf(req.claims!.wallet) });
  } catch (err) {
    fail(res, err);
  }
});
