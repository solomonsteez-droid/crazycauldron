import { Client, Room } from "colyseus";
import {
  BALANCE_CACHE_TTL_MS,
  HUB_SPAWN,
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  MAX_PATH_TILES,
  MOVE_STEP_MS,
  MSG_KICK,
  MSG_MOVE,
  PATCH_RATE_MS,
  facingFor,
  findPath,
  isWalkable,
  type MoveIntent,
  type TilePos,
} from "@crazycauldron/shared";
import { config } from "../config.js";
import { players as playerRepo } from "../db/index.js";
import { log } from "../logger.js";
import { checkHold, invalidateHold } from "../tokengate/index.js";
import { authenticateJoin, CLOSE_INSUFFICIENT_HOLD, type JoinAuth } from "./auth.js";
import { HubState, Player } from "./schema.js";

/**
 * The hub. One instance holds up to HUB_MAX_PLAYERS; matchmaking creates more
 * as they fill.
 *
 * Movement is server-authoritative in the strict sense: clients send a
 * destination tile and nothing else. The server pathfinds, then walks the
 * player one tile per MOVE_STEP_MS. A client that lies about its position has
 * nothing to lie with.
 */
export class HubRoom extends Room<HubState> {
  override maxClients = config.hubMaxPlayers;

  /** Remaining route per player, server-side only - never replicated. */
  private readonly routes = new Map<string, TilePos[]>();
  /** JWT expiry (epoch seconds) per player, so a stale session gets dropped. */
  private readonly expiries = new Map<string, number>();

  override onCreate() {
    this.setState(new HubState());
    this.setPatchRate(PATCH_RATE_MS);

    this.onMessage(MSG_MOVE, (client, message: MoveIntent) => this.onMoveIntent(client, message));

    // One tick = one tile of progress for everyone currently walking.
    this.setSimulationInterval(() => this.stepMovement(), MOVE_STEP_MS);

    // Holding $COOK is a condition of staying, not just of entering.
    this.clock.setInterval(() => void this.revalidateHolders(), BALANCE_CACHE_TTL_MS);

    log.info("hub.created", { roomId: this.roomId, maxClients: this.maxClients });
  }

  override async onAuth(_client: Client, options: unknown): Promise<JoinAuth> {
    return authenticateJoin(options);
  }

  override onJoin(client: Client) {
    const { claims } = client.auth as JoinAuth;

    const player = new Player();
    player.sessionId = client.sessionId;
    player.wallet = claims.wallet;
    player.displayName = claims.displayName;
    // Everyone lands on the same tile; spreading spawns out is a gameplay
    // concern the skeleton leaves open.
    player.tileX = HUB_SPAWN.tileX;
    player.tileY = HUB_SPAWN.tileY;
    player.facing = "s";

    this.state.players.set(client.sessionId, player);
    this.expiries.set(client.sessionId, claims.exp);
    playerRepo.touchLastSeen(claims.wallet);

    log.info("hub.join", {
      roomId: this.roomId,
      wallet: claims.wallet,
      clients: this.clients.length,
    });
  }

  override onLeave(client: Client, consented?: boolean) {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.routes.delete(client.sessionId);
    this.expiries.delete(client.sessionId);
    log.info("hub.leave", { roomId: this.roomId, wallet: player?.wallet, consented });
  }

  override onDispose() {
    log.info("hub.disposed", { roomId: this.roomId });
  }

  /**
   * A move intent is a destination, validated three ways: it must be a real
   * walkable tile, it must be reachable, and the route must be short enough.
   * Anything else is dropped silently - the client simply does not move.
   */
  private onMoveIntent(client: Client, message: MoveIntent) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const tileX = Math.floor(Number(message?.tileX));
    const tileY = Math.floor(Number(message?.tileY));
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
    if (!isWalkable(tileX, tileY)) return;

    const path = findPath({ tileX: player.tileX, tileY: player.tileY }, { tileX, tileY });
    if (path.length === 0 || path.length > MAX_PATH_TILES) {
      this.routes.delete(client.sessionId);
      player.moving = false;
      return;
    }

    // A new intent replaces the old route outright; there is no queueing.
    this.routes.set(client.sessionId, path);
    player.moving = true;
  }

  private stepMovement() {
    for (const [sessionId, route] of this.routes) {
      const player = this.state.players.get(sessionId);
      if (!player) {
        this.routes.delete(sessionId);
        continue;
      }

      const next = route.shift();
      if (!next) {
        this.routes.delete(sessionId);
        player.moving = false;
        continue;
      }

      // Re-check on arrival: the map is static today, but this is the one place
      // a future door or barrier would need to stop a walk already in progress.
      if (!isWalkable(next.tileX, next.tileY)) {
        this.routes.delete(sessionId);
        player.moving = false;
        continue;
      }

      player.facing = facingFor({ tileX: player.tileX, tileY: player.tileY }, next, player.facing);
      player.tileX = next.tileX;
      player.tileY = next.tileY;
      player.moving = route.length > 0;
    }
  }

  /**
   * Periodic re-check while connected: an expired session or a wallet that has
   * sold below MIN_HOLD is disconnected with a reason the UI can explain.
   */
  private async revalidateHolders() {
    const nowSeconds = Math.floor(Date.now() / 1000);

    for (const client of [...this.clients]) {
      const player = this.state.players.get(client.sessionId);
      if (!player) continue;

      const exp = this.expiries.get(client.sessionId);
      if (exp !== undefined && exp <= nowSeconds) {
        this.kick(client, KICK_AUTH_EXPIRED);
        continue;
      }

      try {
        invalidateHold(player.wallet);
        const hold = await checkHold(player.wallet, true);
        if (!hold.ok) {
          log.info("hub.hold_lost", { wallet: player.wallet, balance: hold.balance });
          this.kick(client, KICK_INSUFFICIENT_HOLD);
        }
      } catch (err) {
        // RPC trouble is not the player's fault - leave them seated and retry
        // on the next sweep rather than evicting on an infrastructure blip.
        log.warn("hub.revalidate_failed", {
          wallet: player.wallet,
          message: (err as Error).message,
        });
      }
    }
  }

  private kick(client: Client, reason: string) {
    client.send(MSG_KICK, { reason });
    // Give the message a tick to flush before the socket closes.
    this.clock.setTimeout(() => client.leave(CLOSE_INSUFFICIENT_HOLD), 100);
  }
}
