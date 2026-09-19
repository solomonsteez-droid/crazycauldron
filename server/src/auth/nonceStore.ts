import { randomBytes } from "node:crypto";
import { NONCE_TTL_MS } from "@crazycauldron/shared";

interface NonceEntry {
  issuedAt: number;
  expiresAt: number;
}

const nonces = new Map<string, NonceEntry>();

export function issueNonce(): { nonce: string; issuedAt: Date; expiresAt: Date } {
  sweep();
  const nonce = randomBytes(16).toString("hex");
  const now = Date.now();
  const entry: NonceEntry = { issuedAt: now, expiresAt: now + NONCE_TTL_MS };
  nonces.set(nonce, entry);
  return { nonce, issuedAt: new Date(entry.issuedAt), expiresAt: new Date(entry.expiresAt) };
}

/** Single use: a nonce that verifies is consumed, valid or not. */
export function consumeNonce(nonce: string): boolean {
  const entry = nonces.get(nonce);
  if (!entry) return false;
  nonces.delete(nonce);
  return entry.expiresAt > Date.now();
}

function sweep() {
  const now = Date.now();
  for (const [nonce, entry] of nonces) {
    if (entry.expiresAt <= now) nonces.delete(nonce);
  }
}

/** Test/diagnostics only. */
export function pendingNonceCount(): number {
  return nonces.size;
}
