import bs58 from "bs58";
import nacl from "tweetnacl";
import { NONCE_TTL_MS, buildSiwsMessage, parseSiwsMessage } from "@crazycauldron/shared";
import { config } from "../config.js";
import { consumeNonce } from "./nonceStore.js";

export type SiwsFailure =
  | "malformed_message"
  | "address_mismatch"
  | "unknown_or_used_nonce"
  | "stale_message"
  | "message_tampered"
  | "bad_signature";

export type SiwsResult = { ok: true } | { ok: false; reason: SiwsFailure };

/**
 * Verifies a wallet-signed sign-in message.
 *
 * The nonce is consumed before the signature is checked, so a replayed message
 * fails on the second attempt regardless of how good its signature is.
 */
export function verifySiws(address: string, message: string, signature: string): SiwsResult {
  const parsed = parseSiwsMessage(message);
  if (!parsed.address || !parsed.nonce || !parsed.issuedAt) {
    return { ok: false, reason: "malformed_message" };
  }
  if (parsed.address !== address) {
    return { ok: false, reason: "address_mismatch" };
  }

  // Single-use, and gone whether or not the rest of this function succeeds.
  if (!consumeNonce(parsed.nonce)) {
    return { ok: false, reason: "unknown_or_used_nonce" };
  }

  const issuedAt = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > NONCE_TTL_MS) {
    return { ok: false, reason: "stale_message" };
  }

  // Re-render the message from our own domain/URI and require a byte-for-byte
  // match. Without this a wallet could be talked into signing any text at all
  // that happens to carry a live nonce.
  const expected = buildSiwsMessage({
    domain: config.siwsDomain,
    address,
    uri: config.siwsUri,
    nonce: parsed.nonce,
    issuedAt: parsed.issuedAt,
  });
  if (expected !== message) {
    return { ok: false, reason: "message_tampered" };
  }

  let publicKey: Uint8Array;
  let sig: Uint8Array;
  try {
    publicKey = bs58.decode(address);
    sig = bs58.decode(signature);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (publicKey.length !== 32 || sig.length !== 64) {
    return { ok: false, reason: "bad_signature" };
  }

  const verified = nacl.sign.detached.verify(new TextEncoder().encode(message), sig, publicKey);
  return verified ? { ok: true } : { ok: false, reason: "bad_signature" };
}
