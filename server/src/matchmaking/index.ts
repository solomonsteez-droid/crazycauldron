import { matchMaker } from "@colyseus/core";
import { ROOM_HUB, ROOM_WAITING, type EnterResponse, type SessionClaims } from "@crazycauldron/shared";
import { config } from "../config.js";
import { log } from "../logger.js";

/** Live player count across every hub instance on this node. */
export async function countHubPlayers(): Promise<number> {
  const rooms = await matchMaker.query({ name: ROOM_HUB });
  return rooms.reduce((total, room) => total + room.clients, 0);
}

export interface CapacitySnapshot {
  hubPlayers: number;
  hubRooms: number;
  globalMax: number;
  hubMax: number;
  full: boolean;
}

export async function capacity(): Promise<CapacitySnapshot> {
  const rooms = await matchMaker.query({ name: ROOM_HUB });
  const hubPlayers = rooms.reduce((total, room) => total + room.clients, 0);
  return {
    hubPlayers,
    hubRooms: rooms.length,
    globalMax: config.globalMaxPlayers,
    hubMax: config.hubMaxPlayers,
    full: hubPlayers >= config.globalMaxPlayers,
  };
}

/**
 * Decides which room a verified player belongs in and reserves them a seat.
 *
 * Hub rooms fill to HUB_MAX_PLAYERS before Colyseus spins up another, so the
 * world grows in ~30-player shards. Once GLOBAL_MAX_PLAYERS is reached the next
 * joiner is parked in the waiting room instead of being turned away; the
 * waiting room promotes them when a hub seat frees up.
 */
export async function reserveSeat(claims: SessionClaims, token: string): Promise<EnterResponse> {
  const options = { token, wallet: claims.wallet, displayName: claims.displayName };
  const snapshot = await capacity();

  if (snapshot.full) {
    log.info("matchmake.queued", { wallet: claims.wallet, hubPlayers: snapshot.hubPlayers });
    return { room: ROOM_WAITING, reservation: await matchMaker.joinOrCreate(ROOM_WAITING, options) };
  }

  log.info("matchmake.admit", { wallet: claims.wallet, hubPlayers: snapshot.hubPlayers });
  return { room: ROOM_HUB, reservation: await matchMaker.joinOrCreate(ROOM_HUB, options) };
}
