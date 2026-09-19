/**
 * The one administrative endpoint: open or close the door.
 *
 * Guarded by a token compared in constant time, because a check that returns
 * early on the first wrong character leaks how much of the token was right.
 * With no ADMIN_TOKEN set the route does not exist at all - an admin endpoint
 * secured by an empty string is worse than no admin endpoint.
 */

import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { log } from "../logger.js";
import { maintenanceOn, setMaintenance } from "../maintenance.js";

export const adminRouter = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() ?? "";

/** Compares two strings without telling the caller where they diverged. */
function sameToken(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(ADMIN_TOKEN);
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // signal, so the lengths are compared first and the result folded in.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_TOKEN) {
    res.status(404).json({ error: "not_found", message: "Not found." });
    return;
  }

  const header = req.header("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();

  if (!given || !sameToken(given)) {
    log.warn("admin.refused", { path: req.path, ip: req.ip });
    res.status(401).json({ error: "unauthorized", message: "Not authorised." });
    return;
  }
  next();
}

/**
 * Closes or opens entry.
 *
 *   POST /admin/maintenance  { "on": true }
 *
 * Takes effect everywhere within a couple of seconds - the flag is in the
 * database and every process rereads it - and survives a restart, so a hub
 * closed for a reason does not quietly reopen when the process bounces.
 */
adminRouter.post("/maintenance", requireAdmin, async (req, res) => {
  const on = req.body?.on;
  if (typeof on !== "boolean") {
    res.status(400).json({ error: "bad_request", message: 'Send { "on": true } or { "on": false }.' });
    return;
  }

  try {
    await setMaintenance(on, req.ip ?? "unknown");
    res.json({ maintenance: on });
  } catch (err) {
    log.error("admin.maintenance_failed", { message: (err as Error).message });
    res.status(503).json({
      error: "flag_write_failed",
      message: "Could not write the switch. The database may be the problem.",
    });
  }
});

/** What the switch currently says. Same guard: this is not public information. */
adminRouter.get("/maintenance", requireAdmin, async (_req, res) => {
  res.json({ maintenance: await maintenanceOn() });
});
