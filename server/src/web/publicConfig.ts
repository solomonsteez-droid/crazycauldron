/**
 * The handful of facts the public pages need.
 *
 * Served rather than compiled in, for one reason that matters: the $COOK
 * contract address. A player copying it from /official is copying it to decide
 * where to send money, and it has to be the address the running deployment
 * actually gates on - not whatever was in a .env on the day the bundle was
 * built. One source, read at request time.
 *
 * Everything here is already public. Nothing that is not belongs in it.
 */

import { Router } from "express";
import { config } from "../config.js";

export const publicRouter = Router();

publicRouter.get("/config", (_req, res) => {
  // A minute of caching: enough that a page refresh is free, short enough that
  // a corrected address reaches everyone within the minute.
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({
    domain: config.publicDomain,
    cookMint: config.cookMint,
    minHold: config.minHold,
    social: {
      x: config.socialX,
      telegram: config.socialTelegram,
    },
    shopEnabled: config.shopEnabled,
    maintenance: false,
  });
});
