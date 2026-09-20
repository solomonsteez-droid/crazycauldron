/**
 * GET /stats - how much cooking is going on, for the front page.
 *
 * Its own route rather than a member of /public, because it is the one public
 * endpoint whose answer changes minute to minute: /public/config is a handful
 * of settings cached for a minute, and mixing a live counter into it would
 * mean either caching the counter for too long or the settings for too little.
 */

import { Router } from "express";
import { gameStore } from "../db/index.js";
import { log } from "../logger.js";
import { capacity } from "../matchmaking/index.js";
import { utcDay } from "../time.js";

export const statsRouter = Router();

/**
 * The four numbers the marketing site's live line and ticker read.
 *
 * Counts only, and by design: no wallet, no name, no balance, nothing that is
 * about a person. This is served to anyone who asks and is cached for anyone
 * who asks again, so the safest version is the one with nowhere to put an
 * identity in the first place.
 *
 * Cached for thirty seconds in this process. Three of the four are database
 * reads and one of them sums a table, and a front page that is linked
 * somewhere busy would otherwise turn "how many people are playing" into a
 * load test. Thirty seconds is short enough that the number still reads as
 * live - and the cache is per-process, which on Cloud means a handful of
 * copies rather than one, which is fine for a number nobody is auditing.
 */
const STATS_CACHE_MS = 30_000;

interface CachedStats {
  at: number;
  payload: {
    playersOnline: number;
    chefsRegistered: number;
    dishesCooked: number;
    superbsToday: number;
  };
}

let cached: CachedStats | null = null;

statsRouter.get("/", async (_req, res) => {
  res.setHeader("Cache-Control", `public, max-age=${STATS_CACHE_MS / 1000}`);

  if (cached && Date.now() - cached.at < STATS_CACHE_MS) {
    return res.json(cached.payload);
  }

  try {
    const [rooms, tally] = await Promise.all([capacity(), gameStore.publicTally(utcDay())]);
    cached = {
      at: Date.now(),
      payload: {
        playersOnline: rooms.hubPlayers,
        chefsRegistered: tally.chefsRegistered,
        dishesCooked: tally.dishesCooked,
        superbsToday: tally.superbsToday,
      },
    };
    return res.json(cached.payload);
  } catch (err) {
    /*
     * A stale answer beats an error. The page shows a dash when this fails,
     * and a dash on a marketing page that is otherwise fine is a worse trade
     * than a number that is a minute old.
     */
    log.warn("stats.failed", { message: (err as Error).message });
    if (cached) return res.json(cached.payload);
    return res.status(503).json({ error: "stats_unavailable" });
  }
});
