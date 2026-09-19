import { Room, matchMaker, type Client } from "@colyseus/core";
import {
  MSG_ADMIT,
  MSG_QUEUE,
  PATCH_RATE_MS,
  ROOM_HUB,
  type EnterResponse,
} from "@crazycauldron/shared";
import { config } from "../config.js";
import { log } from "../logger.js";
import { capacity } from "../matchmaking/index.js";
import { authenticateJoin, type JoinAuth } from "./auth.js";
import { QueuedPlayer, WaitingState } from "./schema.js";

/** How often the queue looks for a freed hub seat. */
const PROMOTE_INTERVAL_MS = 2_000;

/**
 * Overflow queue. Players land here when the world is at GLOBAL_MAX_PLAYERS and
 * are promoted first-come-first-served as hub seats free up.
 *
 * Promotion is a fresh seat reservation pushed over the socket, so the client
 * never has to poll /play/enter again - it just consumes what it is handed.
 */
export class WaitingRoom extends Room<WaitingState> {
  /** Everyone waiting, oldest first. */
  private readonly order: string[] = [];
  /** Per-seat join options, needed to mint the hub reservation on promotion. */
  private readonly auths = new Map<string, JoinAuth>();

  override onCreate() {
    this.setState(new WaitingState());
    this.setPatchRate(PATCH_RATE_MS);
    this.state.globalMax = config.globalMaxPlayers;

    // maxClients is left at Colyseus's default of Infinity on purpose: the
    // queue is never "full", it is where people go when the hub is.
    this.autoDispose = true;

    this.clock.setInterval(() => void this.drain(), PROMOTE_INTERVAL_MS);
    log.info("waiting.created", { roomId: this.roomId });
  }

  override async onAuth(_client: Client, options: unknown): Promise<JoinAuth> {
    return authenticateJoin(options);
  }

  override onJoin(client: Client) {
    const auth = client.auth as JoinAuth;

    const queued = new QueuedPlayer();
    queued.wallet = auth.claims.wallet;
    queued.displayName = auth.claims.displayName;

    this.state.queue.set(client.sessionId, queued);
    this.auths.set(client.sessionId, auth);
    this.order.push(client.sessionId);
    this.renumber();

    log.info("waiting.join", { wallet: auth.claims.wallet, queued: this.order.length });
    // Tell them where they stand immediately rather than after the first tick.
    client.send(MSG_QUEUE, { place: queued.place, waiting: this.order.length });
  }

  override onLeave(client: Client) {
    this.state.queue.delete(client.sessionId);
    this.auths.delete(client.sessionId);
    const index = this.order.indexOf(client.sessionId);
    if (index >= 0) this.order.splice(index, 1);
    this.renumber();
  }

  override onDispose() {
    log.info("waiting.disposed", { roomId: this.roomId });
  }

  /** Move as many people into the hub as there is now room for. */
  private async drain() {
    const snapshot = await capacity();
    this.state.hubPlayers = snapshot.hubPlayers;

    let free = config.globalMaxPlayers - snapshot.hubPlayers;
    if (free <= 0) {
      this.broadcastPlaces();
      return;
    }

    while (free > 0 && this.order.length > 0) {
      const sessionId = this.order[0];
      if (sessionId === undefined) break;

      const client = this.clients.find((c) => c.sessionId === sessionId);
      const auth = this.auths.get(sessionId);
      if (!client || !auth) {
        // Vanished between ticks; onLeave will have tidied the rest.
        this.order.shift();
        continue;
      }

      try {
        const reservation = await matchMaker.joinOrCreate(ROOM_HUB, {
          token: auth.token,
          wallet: auth.claims.wallet,
          displayName: auth.claims.displayName,
        });
        const payload: EnterResponse = { room: ROOM_HUB, reservation };
        client.send(MSG_ADMIT, payload);
        log.info("waiting.promoted", { wallet: auth.claims.wallet });
      } catch (err) {
        // Could not seat them this round - stop draining and try again later,
        // keeping their place at the front of the queue.
        log.warn("waiting.promote_failed", {
          wallet: auth.claims.wallet,
          message: (err as Error).message,
        });
        break;
      }

      this.order.shift();
      free -= 1;
      // The client leaves of its own accord once it has consumed the seat; the
      // schema entry goes now so those behind them see the queue shorten.
      this.state.queue.delete(sessionId);
      this.auths.delete(sessionId);
    }

    this.renumber();
    this.broadcastPlaces();
  }

  private renumber() {
    this.order.forEach((sessionId, index) => {
      const queued = this.state.queue.get(sessionId);
      if (queued) queued.place = index + 1;
    });
  }

  private broadcastPlaces() {
    for (const client of this.clients) {
      const queued = this.state.queue.get(client.sessionId);
      if (!queued) continue;
      client.send(MSG_QUEUE, { place: queued.place, waiting: this.order.length });
    }
  }
}
