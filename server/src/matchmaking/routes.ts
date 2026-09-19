import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { log } from "../logger.js";
import { capacity, reserveSeat } from "./index.js";

export const matchmakeRouter = Router();

/**
 * The only way into a room. The client consumes the returned reservation with
 * `client.consumeSeatReservation(...)` rather than calling joinOrCreate itself,
 * which keeps the hub/waiting decision on the server.
 */
matchmakeRouter.post("/enter", requireAuth, async (req, res) => {
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
