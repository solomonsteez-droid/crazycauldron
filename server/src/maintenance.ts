/**
 * The switch that closes the door without a redeploy.
 *
 * Something is wrong and you want players out of the way while you look at it.
 * Redeploying to change a flag takes minutes and a build; this takes one
 * request. MAINTENANCE=true is the same switch set at boot, for the case where
 * the thing that is wrong is that the server will not stay up.
 *
 * What it closes is entry, not the server. /health keeps answering, because
 * whatever is watching the deployment must not be told the process is dead
 * when it is deliberately quiet. Players already in a room are left alone:
 * kicking everybody out is a different, harsher decision, and it is available
 * by restarting once nobody new can get in.
 *
 * The flag lives in the database rather than in memory. On Cloud there is one
 * process per core, and a switch in one process is a switch half the players
 * never see.
 */

import { gameStore } from "./db/index.js";
import { log } from "./logger.js";

const FLAG = "maintenance";

/** What a player is told. Not an error - they have done nothing wrong. */
export const MAINTENANCE_MESSAGE =
  "The cauldron is closed for a few minutes while we fix something. Please try again shortly.";

interface Cached {
  on: boolean;
  readAt: number;
}

/*
 * Two seconds of cache. Entry is not hot enough for this to matter much, but
 * it is on the join path and there is no reason to ask the database the same
 * question thirty times a second. Two seconds is also how long somebody has to
 * wait for the switch to take effect, which is nothing.
 */
const CACHE_MS = 2_000;
let cached: Cached | null = null;

/**
 * The boot-time setting, which seeds the flag the first time it is read.
 *
 * Deliberately only a seed: once somebody has flipped the switch by hand, the
 * stored value is the answer, and a restart does not quietly reopen a hub
 * that was closed for a reason.
 */
const fromEnv = (process.env.MAINTENANCE ?? "").trim().toLowerCase();
const envSaysClosed = fromEnv === "true" || fromEnv === "1";

let seeded = false;

export async function maintenanceOn(): Promise<boolean> {
  if (cached && Date.now() - cached.readAt < CACHE_MS) return cached.on;

  try {
    let stored = await gameStore.readFlag(FLAG);

    if (stored === null && !seeded) {
      seeded = true;
      stored = envSaysClosed ? "on" : "off";
      await gameStore.writeFlag(FLAG, stored);
      if (envSaysClosed) log.warn("maintenance.from_env", { message: "MAINTENANCE=true at boot" });
    }

    const on = stored === "on";
    cached = { on, readAt: Date.now() };
    return on;
  } catch (err) {
    /*
     * A database that will not answer is exactly when maintenance is likely
     * to be wanted, and exactly when it cannot be read. Fall back to whatever
     * was last known, or to the boot setting - never to "open", which would
     * let players into a server whose database has gone away.
     */
    log.error("maintenance.read_failed", { message: (err as Error).message });
    return cached?.on ?? envSaysClosed;
  }
}

/** Flips the switch, for everybody, now. */
export async function setMaintenance(on: boolean, by: string): Promise<void> {
  await gameStore.writeFlag(FLAG, on ? "on" : "off");
  cached = { on, readAt: Date.now() };
  log.warn("maintenance.set", { on, by });
}

/** Forgets the cached value, so the next read goes to the database. */
export function forgetMaintenance(): void {
  cached = null;
}
