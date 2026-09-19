import { Connection, PublicKey } from "@solana/web3.js";
import { BALANCE_CACHE_TTL_MS } from "@crazycauldron/shared";
import { config } from "../config.js";
import { log } from "../logger.js";

export interface HoldCheck {
  ok: boolean;
  balance: number;
  minHold: number;
  /** True when the number came from cache rather than a fresh RPC call. */
  cached: boolean;
  bypassed: boolean;
}

interface CacheEntry {
  balance: number;
  checkedAt: number;
}

const cache = new Map<string, CacheEntry>();

// Lazily constructed so that importing this module never dials out.
let connection: Connection | null = null;
function rpc(): Connection {
  if (!connection) connection = new Connection(config.rpcUrl, "confirmed");
  return connection;
}

/**
 * Sum the UI amount of every $COOK token account owned by `wallet`.
 * A wallet can hold the same mint across several accounts, so they all count.
 */
async function fetchBalance(wallet: string): Promise<number> {
  const owner = new PublicKey(wallet);
  const mint = new PublicKey(config.cookMint);
  const res = await rpc().getParsedTokenAccountsByOwner(owner, { mint });
  let total = 0;
  for (const { account } of res.value) {
    const parsed = account.data as unknown as {
      parsed?: { info?: { tokenAmount?: { uiAmount?: number | null } } };
    };
    total += parsed.parsed?.info?.tokenAmount?.uiAmount ?? 0;
  }
  return total;
}

/**
 * @param force skip the cache (used by the periodic re-check while connected).
 */
export async function checkHold(wallet: string, force = false): Promise<HoldCheck> {
  const minHold = config.minHold;

  if (config.testBypassHold) {
    return { ok: true, balance: 0, minHold, cached: false, bypassed: true };
  }

  const hit = cache.get(wallet);
  if (!force && hit && Date.now() - hit.checkedAt < BALANCE_CACHE_TTL_MS) {
    return { ok: hit.balance >= minHold, balance: hit.balance, minHold, cached: true, bypassed: false };
  }

  try {
    const balance = await fetchBalance(wallet);
    cache.set(wallet, { balance, checkedAt: Date.now() });
    return { ok: balance >= minHold, balance, minHold, cached: false, bypassed: false };
  } catch (err) {
    log.error("tokengate.rpc_error", { wallet, message: (err as Error).message });
    // Fail closed: an unreachable RPC must not become a free pass. A cached
    // value that is merely stale is still better evidence than nothing.
    if (hit) {
      return { ok: hit.balance >= minHold, balance: hit.balance, minHold, cached: true, bypassed: false };
    }
    throw new Error("Could not verify your $COOK balance right now. Please try again.");
  }
}

export function invalidateHold(wallet: string) {
  cache.delete(wallet);
}
