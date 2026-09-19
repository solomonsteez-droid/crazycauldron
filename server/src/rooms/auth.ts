import { ServerError } from "@colyseus/core";
import {
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  KICK_MAINTENANCE,
  type SessionClaims,
} from "@crazycauldron/shared";
import { verifyToken } from "../auth/jwt.js";
import { log } from "../logger.js";
import { maintenanceOn } from "../maintenance.js";
import { checkHold } from "../tokengate/index.js";

/** Colyseus close codes. 4000+ is the application-defined range. */
export const CLOSE_UNAUTHORIZED = 4001;
export const CLOSE_INSUFFICIENT_HOLD = 4003;
export const CLOSE_MAINTENANCE = 4004;

export interface JoinAuth {
  claims: SessionClaims;
  /** Kept so the waiting room can mint a fresh hub reservation on promotion. */
  token: string;
  balance: number;
}

/**
 * Room-level gate, run for every seat in every room. The HTTP layer already
 * checked both of these at sign-in, but a reservation can be consumed minutes
 * later and a JWT lives an hour, so the room re-checks rather than trusting it.
 */
export async function authenticateJoin(options: unknown): Promise<JoinAuth> {
  const token = typeof (options as { token?: unknown })?.token === "string"
    ? (options as { token: string }).token
    : "";

  /*
   * A reservation handed out a minute ago can still be redeemed a minute
   * later, so the switch is checked here too. Otherwise closing the door
   * leaves it ajar for everyone who had already knocked.
   */
  if (await maintenanceOn()) {
    throw new ServerError(CLOSE_MAINTENANCE, KICK_MAINTENANCE);
  }

  const claims = verifyToken(token);
  if (!claims) {
    log.authFailure("room_join_invalid_token");
    throw new ServerError(CLOSE_UNAUTHORIZED, KICK_AUTH_EXPIRED);
  }

  const hold = await checkHold(claims.wallet);
  if (!hold.ok) {
    log.authFailure("room_join_insufficient_hold", {
      wallet: claims.wallet,
      balance: hold.balance,
    });
    throw new ServerError(CLOSE_INSUFFICIENT_HOLD, KICK_INSUFFICIENT_HOLD);
  }

  return { claims, token, balance: hold.balance };
}
