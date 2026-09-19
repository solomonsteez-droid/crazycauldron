import { Client, type Room } from "colyseus.js";
import { env } from "./env.js";

/** One Colyseus client for the tab's lifetime. */
export const gameClient = new Client(env.wsUrl);

/**
 * Turns a server-issued seat reservation into a live room.
 *
 * The client never calls joinOrCreate: /matchmake/enter decides between hub and
 * waiting room, and this only redeems what it was handed. That is also what
 * lets the waiting room promote a player by pushing a reservation down the
 * socket - the same call consumes it.
 */
export async function consumeReservation<TState>(reservation: unknown): Promise<Room<TState>> {
  // Colyseus types this as its internal SeatReservation; it crosses our HTTP
  // boundary as JSON, so it arrives as unknown and is cast back here.
  return gameClient.consumeSeatReservation<TState>(reservation as never);
}
