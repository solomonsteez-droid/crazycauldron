import { Router } from "express";
import {
  LEADERBOARD_SIZE,
  chefLevelForXp,
  levelsFromXp,
  titlesEarned,
  type LeaderboardPayload,
} from "@crazycauldron/shared";
import { requireAuth } from "../auth/middleware.js";
import { MAINTENANCE_MESSAGE, maintenanceOn } from "../maintenance.js";
import { gameStore } from "../db/index.js";
import { log } from "../logger.js";
import { capacity, reserveSeat } from "./index.js";

export const matchmakeRouter = Router();

/**
 * The only way into a room. The client consumes the returned reservation with
 * `client.consumeSeatReservation(...)` rather than calling joinOrCreate itself,
 * which keeps the hub/waiting decision on the server.
 */
matchmakeRouter.post("/enter", requireAuth, async (req, res) => {
  /*
   * The door, not the server. /health stays up and anyone already playing
   * stays playing; this only stops new arrivals walking into whatever is
   * being fixed.
   */
  if (await maintenanceOn()) {
    return res.status(503).json({ error: "maintenance", message: MAINTENANCE_MESSAGE });
  }

  const claims = req.claims!;
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;

  try {
    return res.json(await reserveSeat(claims, token));
  } catch (err) {
    log.error("matchmake.failed", { wallet: claims.wallet, message: (err as Error).message });
    return res
      .status(503)
      .json({ error: "matchmake_failed", message: "Could not find you a seat. Please retry." });
  }
});

/** Unauthenticated, for the login screen's "N players in the cauldron" line. */
matchmakeRouter.get("/capacity", async (_req, res) => {
  const snapshot = await capacity();
  return res.json(snapshot);
});

/**
 * Top chefs. Unauthenticated and cheap - the client polls it once a minute and
 * it is one indexed read plus a single batched lookup for the titles.
 *
 * Wallets are already public in the room state, so naming them here leaks
 * nothing new; coins, inventories and balances are not included.
 */
matchmakeRouter.get("/leaderboard", async (_req, res) => {
  const rows = (await gameStore.topByChefXp(LEADERBOARD_SIZE)).map((entry, index) => ({
    rank: index + 1,
    wallet: entry.wallet,
    displayName: entry.displayName,
    chefLevel: chefLevelForXp(entry.chefXp),
    chefXp: entry.chefXp,
    titles: titlesEarned(levelsFromXp(entry.skillXp)),
  }));

  const payload: LeaderboardPayload = { rows, serverNow: Date.now() };
  return res.json(payload);
});
