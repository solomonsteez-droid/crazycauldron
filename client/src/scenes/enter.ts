import type Phaser from "phaser";
import {
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  ROOM_HUB,
} from "@crazycauldron/shared";
import { ApiError, enterWorld } from "../net/api.js";
import { consumeReservation } from "../net/room.js";
import { clearSession, type Session } from "../net/session.js";
import { SCENE_HUB, SCENE_LOGIN, SCENE_WAITING } from "./keys.js";

/**
 * The single path from "holding a session" to "in a room". The server decides
 * hub vs waiting; this only redeems the reservation and starts the matching
 * scene, so neither scene has to know the capacity rules.
 */
export async function enterAndRoute(scene: Phaser.Scene, session: Session): Promise<void> {
  const { room, reservation } = await enterWorld(session.token);
  const joined = await consumeReservation(reservation);
  const next = room === ROOM_HUB ? SCENE_HUB : SCENE_WAITING;
  scene.scene.start(next, { room: joined, session });
}

/**
 * Turns whatever went wrong into a sentence and, when the session is the
 * problem, drops it so the player is asked to sign in again rather than
 * retrying with a token the server has already rejected.
 */
export function describeEnterFailure(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      clearSession();
      return "Your session expired. Connect your wallet again.";
    }
    return err.message;
  }

  // A room can refuse the seat after /matchmake said yes - the gate is
  // re-checked on join - and it rejects with the bare KICK_* code.
  const message = (err as Error)?.message ?? "";
  if (message === KICK_INSUFFICIENT_HOLD) {
    clearSession();
    return "Your $COOK balance no longer meets the amount the hub requires.";
  }
  if (message === KICK_AUTH_EXPIRED) {
    clearSession();
    return "Your session expired. Connect your wallet again.";
  }
  return message || "Could not reach the cauldron.";
}

/** Sends the player back to the login screen with the reason shown. */
export function bounceToLogin(scene: Phaser.Scene, error: string) {
  scene.scene.start(SCENE_LOGIN, { error });
}
