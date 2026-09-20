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
import { maintenanceOn } from "../maintenance.js";

export const publicRouter = Router();

publicRouter.get("/config", async (_req, res) => {
  // A minute of caching: enough that a page refresh is free, short enough that
  // a corrected address reaches everyone within the minute.
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({
    domain: config.publicDomain,
    cookMint: config.cookMint,
    /*
     * The site shows the address only when both are true. Sending the flag as
     * well as the value keeps the decision on the server, where the mint is,
     * rather than asking a bundle to guess whether an address is real.
     */
    showMint: config.showMint,
    treasuryWallet: config.treasuryWallet,
    minHold: config.minHold,
    social: {
      x: config.socialX,
      telegram: config.socialTelegram,
    },
    shopEnabled: config.shopEnabled,
    // So the login screen can say the door is shut before somebody connects a
    // wallet and is turned away by it.
    maintenance: await maintenanceOn(),
  });
});
