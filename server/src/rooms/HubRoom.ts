import { Room, type Client } from "@colyseus/core";
import {
  BALANCE_CACHE_TTL_MS,
  CONFIG,
  HUB_MAP,
  HUB_PORTALS,
  HUB_SPAWN,
  HUB_STATIONS,
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
  MSG_ATE,
  MSG_BOUGHT,
  MSG_BUY,
  MSG_EAT,
  MSG_DEV,
  MSG_EQUIP,
  MSG_GATHER,
  MSG_GREET,
  MSG_GREETED,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_HEAT_BAR,
  MSG_KICK,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_UNLOCKED,
  MSG_SELL,
  MSG_SOLD,
  MSG_TRAVEL,
  PATCH_RATE_MS,
  facingFor,
  findPath,
  hashSeed,
  CHEF_MAX_LEVEL,
  SECTIONS,
  SKILL_IDS,
  SKILL_MAX_LEVEL,
  chefXpToReach,
  findSection,
  skillXpToReach,
  tierForBalance,
  wardrobeItem,
  isAdjacentOrOn,
  isWalkableOn,
  spawnFor,
  type CookPrepIntent,
  type CookPreparedPayload,
  type CookResultPayload,
  type CookStartIntent,
  type CookStopIntent,
  type AtePayload,
  type BoughtPayload,
  type BuyIntent,
  type EatIntent,
  type DevIntent,
  type EquipIntent,
  type GatherIntent,
  type GreetIntent,
  type GreetedPayload,
  type GatherResultPayload,
  type HeatBarPayload,
  type MoveIntent,
  type NodesPayload,
  type RejectedPayload,
  type SellIntent,
  type SoldPayload,
  type UnlockedPayload,
  type TilePos,
  type TravelIntent,
} from "@crazycauldron/shared";
import { config } from "../config.js";
import { players as playerRepo } from "../db/index.js";
import { makeHeatBar, planCook, resolveCook, validateClick } from "../game/cooking.js";
import { buyUpgrade, eatStack, sellStack } from "../game/economy.js";
import { completeGather, nodeStates, planGather } from "../game/gathering.js";
import { loadSession, type Session } from "../game/session.js";
import { VillagerCrowd } from "../game/villagers.js";
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
  /** The hub's residents. Decoration, but server-simulated so all clients agree. */
  private crowd!: VillagerCrowd;

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
    this.onMessage(MSG_SELL, (client, message: SellIntent) => this.onSell(client, message));
    this.onMessage(MSG_EAT, (client, message: EatIntent) => this.onEat(client, message));
    this.onMessage(MSG_BUY, (client, message: BuyIntent) => this.onBuy(client, message));
    this.onMessage(MSG_EQUIP, (client, message: EquipIntent) => this.onEquip(client, message));
    this.onMessage(MSG_GREET, (client, message: GreetIntent) => this.onGreet(client, message));

    /*
     * The cheat handler is not registered in production at all, rather than
     * registered and then refusing. An unregistered message type is rejected by
     * Colyseus before any of this code runs, so there is no path to it on a
     * live server even if a client sends one.
     */
    if (!config.isProduction) {
      this.onMessage(MSG_DEV, (client, message: DevIntent) => this.onDev(client, message));
      log.warn("dev.commands_enabled", { roomId: this.roomId, env: config.nodeEnv });
    }

    // One tick = one tile of progress for everyone currently walking.
    this.setSimulationInterval(() => this.stepMovement(), MOVE_STEP_MS);

    /*
     * The villagers walk on their own slower clock. Seeded from the room id so
     * two hubs are populated differently while one hub stays the same town for
     * as long as it lives.
     */
    this.crowd = new VillagerCrowd(this.state.villagers, hashSeed(this.roomId));
    this.crowd.populate(Date.now());
    this.clock.setInterval(() => this.crowd.step(Date.now()), VillagerCrowd.stepMs);

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

    /*
     * Which body a wallet gets is fixed by the wallet itself rather than
     * stored: it never changes, so there is nothing to persist or migrate, and
     * the same player looks the same on every device.
     */
    player.body = claims.wallet.charCodeAt(1) % 2 === 0 ? "male" : "female";
    player.hatId = session.state.hatId;
    player.apronId = session.state.apronId;

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
      this.grantAndNotify(session);
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
    if (!this.atStation(client, "kitchen")) {
      return this.reject(client, MSG_COOK_START, "not_at_kitchen", "Step up to the kitchen.");
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

    /*
     * One line per cook, so a "the bar never gives me Superb" report can be
     * checked against what the server actually computed rather than guessed at.
     */
    const d = outcome.diagnostics;
    log.info("cook.resolved", {
      wallet: session.state.wallet,
      recipe: cook.recipeId,
      elapsedMs: Math.round(d.elapsedMs),
      serverElapsedMs: Math.round(Date.now() - cook.barStartedAt),
      marker: Number(d.markerPos.toFixed(4)),
      superb: `${d.superbFrom.toFixed(3)}..${d.superbTo.toFixed(3)}`,
      fine: `${d.fineFrom.toFixed(3)}..${d.fineTo.toFixed(3)}`,
      windowPct: Number(cook.windowPct.toFixed(1)),
      fromBar: d.fromBar,
      result: d.final,
      firecraft: session.state.levels.firecraft,
      knifework: session.state.levels.knifework,
    });

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
      this.grantAndNotify(session);
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

  // --- economy -------------------------------------------------------------

  /**
   * Standing at the right counter is part of the transaction: the tavern buys
   * and the outfitter sells, and both check the player is actually there.
   */
  private atStation(client: Client, station: string): boolean {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.section !== HUB_MAP) return false;

    const tile = HUB_STATIONS.find((s) => s.id === station);
    if (!tile) return false;
    return isAdjacentOrOn(
      { tileX: player.tileX, tileY: player.tileY },
      { tileX: tile.tileX, tileY: tile.tileY },
    );
  }

  private onSell(client: Client, message: SellIntent) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;

    if (!this.atStation(client, "tavern")) {
      return this.reject(client, MSG_SELL, "not_at_tavern", "Take it to the tavern.");
    }

    const result = sellStack(session.state, String(message?.stackKey ?? ""), message?.qty ?? 1);
    if (!result.ok) return this.reject(client, MSG_SELL, result.reason, result.message);

    session.save();
    const payload: SoldPayload = {
      name: result.name,
      qty: result.qty,
      coins: result.coins,
      totalCoins: session.state.coins,
    };
    client.send(MSG_SOLD, payload);
    this.sendProfile(session);
  }

  /** Eating works anywhere - it is your own food, in your own bag. */
  private onEat(client: Client, message: EatIntent) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;

    const result = eatStack(session.state, String(message?.stackKey ?? ""), Date.now());
    if (!result.ok) return this.reject(client, MSG_EAT, result.reason, result.message);

    session.save();
    const payload: AtePayload = {
      name: result.name,
      buffExpiresAt: result.buffExpiresAt,
      gatherSpeedPct: result.gatherSpeedPct,
    };
    client.send(MSG_ATE, payload);
    this.sendProfile(session);
  }

  private onBuy(client: Client, message: BuyIntent) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;

    if (!this.atStation(client, "outfitter")) {
      return this.reject(client, MSG_BUY, "not_at_outfitter", "The outfitter is in the hub.");
    }

    const kind = message?.kind === "pan" ? "pan" : "bag";
    const result = buyUpgrade(session.state, kind, message?.tier ?? 0);
    if (!result.ok) return this.reject(client, MSG_BUY, result.reason, result.message);

    session.save();
    const payload: BoughtPayload = {
      kind: result.kind,
      tier: result.tier,
      name: result.name,
      coins: result.coins,
      totalCoins: session.state.coins,
    };
    client.send(MSG_BOUGHT, payload);
    this.sendProfile(session);
  }

  // --- wardrobe ------------------------------------------------------------

  private onEquip(client: Client, message: EquipIntent) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    const kind = message?.kind === "hat" ? "hat" : "apron";
    const itemId = String(message?.itemId ?? "");

    if (itemId !== "") {
      const item = wardrobeItem(itemId);
      if (!item || item.kind !== kind) {
        return this.reject(client, MSG_EQUIP, "unknown_item", "No such garment.");
      }
      if (!session.state.canWear(itemId)) {
        const tier = item.unlock.type === "tier";
        return this.reject(
          client,
          MSG_EQUIP,
          tier ? "tier_required" : "locked",
          tier ? "Your $COOK balance does not cover that." : "You have not earned that yet.",
        );
      }
    }

    if (kind === "hat") session.state.hatId = itemId;
    else session.state.apronId = itemId;

    player.hatId = session.state.hatId;
    player.apronId = session.state.apronId;
    session.save();
    this.sendProfile(session);
  }

  /**
   * Grants anything the player has just earned and tells them.
   *
   * Called after every action that can move a skill, a level or the codex -
   * which is every action that pays out at all.
   */
  private grantAndNotify(session: Session) {
    const earned = session.state.grantEarnedItems();
    if (earned.length === 0) return;

    session.save();
    const payload: UnlockedPayload = {
      items: earned.map((item) => ({ id: item.id, kind: item.kind, name: item.name })),
    };
    session.client.send(MSG_UNLOCKED, payload);
    log.info("wardrobe.unlocked", {
      wallet: session.state.wallet,
      items: earned.map((i) => i.id),
    });
  }

  // --- villagers -----------------------------------------------------------

  /**
   * A hello. The line comes from the roster in ambience.json, picked by the
   * server so two players standing together hear the same thing - and so the
   * client cannot put words in a villager's mouth.
   */
  private onGreet(client: Client, message: GreetIntent) {
    const villagerId = String(message?.villagerId ?? "");
    const villager = this.state.villagers.get(villagerId);
    if (!villager) return;

    const line = VillagerCrowd.lineFor(villagerId, Math.floor(Date.now() / 1000));
    if (!line) return;

    const payload: GreetedPayload = { villagerId, name: villager.name, line };
    client.send(MSG_GREETED, payload);
  }

  // --- development ---------------------------------------------------------

  /**
   * /dev level <n> - sets the Chef track and every skill to n.
   *
   * For reaching the Deep Forest and the Caves without playing to Chef 20
   * first. Only ever reachable when NODE_ENV is not production; see onCreate.
   */
  private onDev(client: Client, message: DevIntent) {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!session || !player) return;

    if (message?.command !== "level") {
      return this.reject(client, MSG_DEV, "unknown_command", "Try: /dev level <n>");
    }

    const level = Math.floor(Number(message.value));
    if (!Number.isFinite(level) || level < 1) {
      return this.reject(client, MSG_DEV, "bad_level", "Level must be 1 or more.");
    }

    const chefLevel = Math.min(level, CHEF_MAX_LEVEL);
    const skillLevel = Math.min(level, SKILL_MAX_LEVEL);

    session.state.chefXp = chefXpToReach(chefLevel);
    for (const skill of SKILL_IDS) {
      session.state.skillXp[skill] = skillXpToReach(skillLevel);
    }

    // Sections are gated on Chef Level, so unlock whatever that now covers.
    for (const section of SECTIONS) {
      if (chefLevel >= section.unlockChefLevel) session.state.markSectionEntered(section.index);
    }

    player.chefLevel = session.state.chefLevel;
    this.grantAndNotify(session);
    session.save();
    this.sendProfile(session);

    log.warn("dev.level", { wallet: session.state.wallet, chefLevel, skillLevel });
    client.send(MSG_REJECTED, {
      action: MSG_DEV,
      reason: "ok",
      message: `Chef ${chefLevel}, all skills ${skillLevel}.`,
    });
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
