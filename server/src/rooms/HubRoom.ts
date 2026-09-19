import { Room, type Client } from "@colyseus/core";
import {
  BALANCE_CACHE_TTL_MS,
  CONFIG,
  HUB_MAP,
  HUB_PORTALS,
  HUB_SPAWN,
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  MAX_PATH_TILES,
  MOVE_STEP_MS,
  MSG_COOK_CANCEL,
  MSG_COOK_PREP,
  MSG_COOK_PREPARED,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_COOK_STOP,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_HEAT_BAR,
  MSG_KICK,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_TRAVEL,
  PATCH_RATE_MS,
  facingFor,
  findPath,
  findSection,
  isAdjacentOrOn,
  isWalkableOn,
  spawnFor,
  type CookPrepIntent,
  type CookPreparedPayload,
  type CookResultPayload,
  type CookStartIntent,
  type CookStopIntent,
  type GatherIntent,
  type GatherResultPayload,
  type HeatBarPayload,
  type MoveIntent,
  type NodesPayload,
  type RejectedPayload,
  type TilePos,
  type TravelIntent,
} from "@crazycauldron/shared";
import { config } from "../config.js";
import { players as playerRepo } from "../db/index.js";
import { makeHeatBar, planCook, resolveCook, validateClick } from "../game/cooking.js";
import { completeGather, nodeStates, planGather } from "../game/gathering.js";
import { loadSession, type Session } from "../game/session.js";
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
  /** Progress, rate-limit guard and in-flight action, per connection. */
  private readonly sessions = new Map<string, Session>();

  override onCreate() {
    this.setState(new HubState());
    this.setPatchRate(PATCH_RATE_MS);

    this.onMessage(MSG_MOVE, (client, message: MoveIntent) => this.onMoveIntent(client, message));
    this.onMessage(MSG_TRAVEL, (client, message: TravelIntent) => this.onTravel(client, message));
    this.onMessage(MSG_GATHER, (client, message: GatherIntent) => this.onGather(client, message));
    this.onMessage(MSG_COOK_START, (client, message: CookStartIntent) =>
      this.onCookStart(client, message),
    );
    this.onMessage(MSG_COOK_PREP, (client, message: CookPrepIntent) =>
      this.onCookPrepped(client, message),
    );
    this.onMessage(MSG_COOK_STOP, (client, message: CookStopIntent) =>
      this.onCookStop(client, message),
    );
    this.onMessage(MSG_COOK_CANCEL, (client) => this.onCookCancel(client));

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

    const session = loadSession(client, claims.wallet, claims.displayName);
    player.chefLevel = session.state.chefLevel;
    player.section = HUB_MAP;

    this.state.players.set(client.sessionId, player);
    this.expiries.set(client.sessionId, claims.exp);
    this.sessions.set(client.sessionId, session);
    playerRepo.touchLastSeen(claims.wallet);

    // Perishables rot while offline; sweep before the first profile is sent so
    // the player is never shown a stack that is already gone.
    const dropped = session.state.sweepExpired(Date.now());
    if (dropped.length > 0) {
      log.info("game.expired", { wallet: claims.wallet, dropped });
      session.save();
    }
    this.sendProfile(session);

    log.info("hub.join", {
      roomId: this.roomId,
      wallet: claims.wallet,
      clients: this.clients.length,
    });
  }

  override onLeave(client: Client, consented?: boolean) {
    const player = this.state.players.get(client.sessionId);

    // Last write wins: an action still in flight is abandoned rather than paid
    // out, so leaving mid-gather can never be used to bank a reward twice.
    const session = this.sessions.get(client.sessionId);
    if (session) {
      session.dispose();
      session.save();
    }

    this.state.players.delete(client.sessionId);
    this.routes.delete(client.sessionId);
    this.expiries.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
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

    // Walkability is per-map now: the same coordinates mean different things in
    // the hub and in a section.
    const walkable = (x: number, y: number) => isWalkableOn(player.section, x, y);
    if (!walkable(tileX, tileY)) return;

    const path = findPath({ tileX: player.tileX, tileY: player.tileY }, { tileX, tileY }, walkable);
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

      // Re-check on arrival: this is the one place a walk already in progress
      // gets stopped, which also covers a player who changed map mid-route.
      if (!isWalkableOn(player.section, next.tileX, next.tileY)) {
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

  // --- travel --------------------------------------------------------------

  /**
   * Portals are tiles, not buttons: the server insists the player is actually
   * standing at the gate before it moves them, so "enter section 3" from the
   * middle of the hub is refused no matter what the client sends.
   */
  private onTravel(client: Client, message: TravelIntent) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    const target = Math.floor(Number(message?.section));
    if (!Number.isFinite(target) || target === player.section) return;

    const here: TilePos = { tileX: player.tileX, tileY: player.tileY };

    if (target === HUB_MAP) {
      const from = findSection(player.section);
      if (!from || !isAdjacentOrOn(here, from.returnPortal)) {
        return this.reject(client, MSG_TRAVEL, "not_at_portal", "Stand on the way out first.");
      }
      return this.placeOnMap(session, player, HUB_MAP);
    }

    const section = findSection(target);
    const portal = HUB_PORTALS.find((p) => p.section === target);
    if (!section || !portal) {
      return this.reject(client, MSG_TRAVEL, "unknown_section", "There is no such place.");
    }
    if (player.section !== HUB_MAP) {
      return this.reject(client, MSG_TRAVEL, "not_in_hub", "Return to the hub first.");
    }
    if (!isAdjacentOrOn(here, { tileX: portal.tileX, tileY: portal.tileY })) {
      return this.reject(client, MSG_TRAVEL, "not_at_portal", "Walk to the gate first.");
    }
    if (!session.state.canEnterSection(target)) {
      return this.reject(
        client,
        MSG_TRAVEL,
        "locked",
        `${section.name} opens at Chef Level ${section.unlockChefLevel}.`,
      );
    }

    session.state.markSectionEntered(target);
    session.save();
    this.placeOnMap(session, player, target);
  }

  /** Moves a player between maps and resets everything tied to the old one. */
  private placeOnMap(session: Session, player: Player, mapId: number) {
    const spawn = mapId === HUB_MAP ? HUB_SPAWN : spawnFor(mapId);

    // A walk, a gather and a route all belong to the map they started on.
    session.clearTimer();
    session.guard.finish();
    this.routes.delete(player.sessionId);

    player.section = mapId;
    player.tileX = spawn.tileX;
    player.tileY = spawn.tileY;
    player.facing = "s";
    player.moving = false;
    player.activity = "";

    this.sendNodes(session, mapId);
    log.info("hub.travel", { wallet: player.wallet, section: mapId });
  }

  // --- gathering -----------------------------------------------------------

  private onGather(client: Client, message: GatherIntent) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    const now = Date.now();
    const refusal = session.guard.check(now);
    if (refusal) {
      return this.reject(client, MSG_GATHER, refusal.reason, refusal.message);
    }

    const nodeId = String(message?.nodeId ?? "");
    const plan = planGather(
      session.state,
      player.section,
      nodeId,
      { tileX: player.tileX, tileY: player.tileY },
      now,
    );
    if (!plan.ok) {
      return this.reject(client, MSG_GATHER, plan.reason, plan.message);
    }

    // The server owns the timer. The client is told how long to animate for,
    // but the reward is paid on this timeout and nowhere else.
    session.guard.begin("gathering", plan.durationMs, now);
    player.activity = "gathering";
    client.send(MSG_GATHER_STARTED, {
      nodeId: plan.node.id,
      durationMs: plan.durationMs,
      serverNow: now,
    });

    session.clearTimer();
    session.timer = setTimeout(() => {
      session.timer = null;
      session.guard.finish();

      const live = this.state.players.get(client.sessionId);
      if (!live) return;
      live.activity = "";

      // Walking away cancels the gather - the node has to still be in reach.
      if (!isAdjacentOrOn(
        { tileX: live.tileX, tileY: live.tileY },
        { tileX: plan.node.tileX, tileY: plan.node.tileY },
      )) {
        return this.reject(client, MSG_GATHER, "moved_away", "You wandered off.");
      }

      const reward = completeGather(session.state, plan, Date.now());
      live.chefLevel = session.state.chefLevel;
      session.save();

      const payload: GatherResultPayload = {
        nodeId: plan.node.id,
        ingredientId: plan.ing.id,
        name: plan.ing.name,
        qty: reward.qty,
        skill: plan.ing.skill,
        skillXp: reward.skillXp,
        chefXp: reward.skillXp,
        readyAt: reward.readyAt,
        doubled: reward.doubled,
      };
      client.send(MSG_GATHER_RESULT, payload);
      this.sendProfile(session);
    }, plan.durationMs);
  }

  // --- cooking -------------------------------------------------------------

  /**
   * Starts a cook. The guard is claimed for the whole sequence - prep, bar and
   * cook time - so nothing else can interleave with it, and the kitchen is only
   * open in the hub.
   */
  private onCookStart(client: Client, message: CookStartIntent) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    if (player.section !== HUB_MAP) {
      return this.reject(client, MSG_COOK_START, "not_in_hub", "The kitchen is back in the hub.");
    }

    const now = Date.now();
    const refusal = session.guard.check(now);
    if (refusal) return this.reject(client, MSG_COOK_START, refusal.reason, refusal.message);

    const plan = planCook(session.state, String(message?.recipeId ?? ""));
    if (!plan.ok) return this.reject(client, MSG_COOK_START, plan.reason, plan.message);

    const cookId = `${client.sessionId}:${now}`;
    const cook = makeHeatBar(session.state, plan.recipe, cookId);
    session.cook = cook;

    // Claim the guard for prep + bar + cook so no other action interleaves.
    const total = plan.prepMs + cook.durationMs + CONFIG.cooking.cookMs;
    session.guard.begin("cooking", total, now);
    player.activity = "cooking";

    const prepared: CookPreparedPayload = {
      cookId,
      recipeId: plan.recipe.id,
      prepMs: plan.prepMs,
      autoPrep: plan.autoPrep,
      serverNow: now,
    };
    client.send(MSG_COOK_PREPARED, prepared);

    // Auto-prep skips the hold entirely rather than shortening it.
    if (plan.autoPrep) {
      this.sendHeatBar(session, client);
      return;
    }

    // A player who wanders off mid-prep should not hold the guard forever.
    session.clearTimer();
    session.timer = setTimeout(() => this.abandonCook(session, client), plan.prepMs + 10000);
  }

  private onCookPrepped(client: Client, message: CookPrepIntent) {
    const session = this.sessions.get(client.sessionId);
    if (!session?.cook) return;
    if (session.cook.cookId !== String(message?.cookId ?? "")) return;
    if (session.cook.prepared) return;
    this.sendHeatBar(session, client);
  }

  private sendHeatBar(session: Session, client: Client) {
    const cook = session.cook;
    if (!cook) return;

    cook.prepared = true;
    cook.barStartedAt = Date.now();

    const payload: HeatBarPayload = {
      cookId: cook.cookId,
      recipeId: cook.recipeId,
      durationMs: cook.durationMs,
      speed: cook.speed,
      startOffset: cook.startOffset,
      direction: cook.direction,
      windowCentre: cook.windowCentre,
      windowPct: cook.windowPct,
      fineWindowPct: cook.fineWindowPct,
      serverNow: cook.barStartedAt,
    };
    client.send(MSG_HEAT_BAR, payload);

    // No click by the time the bar ends means the marker ran off the end; the
    // dish is settled at that final position rather than left hanging.
    session.clearTimer();
    session.timer = setTimeout(
      () => this.settleCook(session, client, cook.durationMs),
      cook.durationMs + 400,
    );
  }

  private onCookStop(client: Client, message: CookStopIntent) {
    const session = this.sessions.get(client.sessionId);
    if (!session?.cook) {
      return this.reject(client, MSG_COOK_STOP, "no_cook", "Nothing is cooking.");
    }
    const cook = session.cook;
    if (cook.cookId !== String(message?.cookId ?? "")) return;
    if (!cook.prepared) {
      return this.reject(client, MSG_COOK_STOP, "not_prepared", "Finish the prep first.");
    }

    const click = validateClick(cook, message?.elapsedMs, Date.now());
    if (!click.ok) {
      this.cancelCook(session, client);
      return this.reject(client, MSG_COOK_STOP, click.reason, click.message);
    }

    this.settleCook(session, client, click.elapsedMs);
  }

  /** Computes the dish and pays out after the cook time has elapsed. */
  private settleCook(session: Session, client: Client, elapsedMs: number) {
    const cook = session.cook;
    if (!cook) return;
    session.cook = null;
    session.clearTimer();

    const outcome = resolveCook(session.state, cook, elapsedMs);
    if (!("quality" in outcome)) {
      session.guard.finish();
      const stalled = this.state.players.get(client.sessionId);
      if (stalled) stalled.activity = "";
      return this.reject(client, MSG_COOK_STOP, outcome.reason, outcome.message);
    }

    session.save();

    // The dish is settled the moment the marker stops; the cook time is the
    // wait before the player is told, which keeps one timer rather than two.
    session.timer = setTimeout(() => {
      session.timer = null;
      session.guard.finish();

      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.activity = "";
        player.chefLevel = session.state.chefLevel;
      }

      const payload: CookResultPayload = {
        cookId: cook.cookId,
        recipeId: cook.recipeId,
        quality: outcome.quality,
        markerPos: outcome.markerPos,
        windowCentre: cook.windowCentre,
        chefXp: outcome.chefXp,
        skillXp: outcome.skillXp,
        downgraded: outcome.downgraded,
        upgraded: outcome.upgraded,
        cookMs: outcome.cookMs,
      };
      client.send(MSG_COOK_RESULT, payload);
      this.sendProfile(session);
    }, outcome.cookMs);
  }

  private onCookCancel(client: Client) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;
    this.cancelCook(session, client);
  }

  /** Drops the cook without spending anything, and without a full-cook penalty. */
  private cancelCook(session: Session, client: Client) {
    session.cook = null;
    session.clearTimer();
    session.guard.abandon(Date.now());
    const player = this.state.players.get(client.sessionId);
    if (player) player.activity = "";
  }

  private abandonCook(session: Session, client: Client) {
    if (!session.cook) return;
    log.warn("cook.abandoned", { wallet: session.state.wallet });
    this.cancelCook(session, client);
    this.reject(client, MSG_COOK_START, "abandoned", "The pot went cold.");
  }

  // --- outbound ------------------------------------------------------------

  private sendProfile(session: Session) {
    session.client.send(MSG_PROFILE, session.state.toProfile());
  }

  private sendNodes(session: Session, mapId: number) {
    const section = findSection(mapId);
    if (!section) return;
    const payload: NodesPayload = {
      section: mapId,
      nodes: nodeStates(session.state, section, Date.now()),
      serverNow: Date.now(),
    };
    session.client.send(MSG_NODES, payload);
  }

  /** Every refusal is logged with the wallet and reason, as the brief asks. */
  private reject(client: Client, action: string, reason: string, message: string) {
    const player = this.state.players.get(client.sessionId);
    log.warn("action.rejected", { wallet: player?.wallet, action, reason });
    const payload: RejectedPayload = { action, reason, message };
    client.send(MSG_REJECTED, payload);
  }

  private kick(client: Client, reason: string) {
    client.send(MSG_KICK, { reason });
    // Give the message a tick to flush before the socket closes.
    this.clock.setTimeout(() => client.leave(CLOSE_INSUFFICIENT_HOLD), 100);
  }
}
