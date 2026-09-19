import { Client, type Room } from "@colyseus/sdk";
import { env } from "./env.js";

/**
 * A live room, named by the state it carries.
 *
 * The SDK's Room takes the room definition first and infers the state from it.
 * We never hand it a definition - the server does the matchmaking and we only
 * redeem a reservation - so the state is stated outright instead.
 */
export type GameRoom<TState> = Room<any, TState>;

/** One Colyseus client for the tab's lifetime. */
export const gameClient = new Client(env.wsUrl);

/**
 * Turns a server-issued seat reservation into a live room.
 *
 * The client never calls joinOrCreate: /play/enter decides between hub and
 * waiting room, and this only redeems what it was handed. That is also what
 * lets the waiting room promote a player by pushing a reservation down the
 * socket - the same call consumes it.
 */
export async function consumeReservation<TState>(reservation: unknown): Promise<GameRoom<TState>> {
  // Colyseus types this as its internal SeatReservation; it crosses our HTTP
  // boundary as JSON, so it arrives as unknown and is cast back here.
  return gameClient.consumeSeatReservation<TState>(reservation as never);
}
