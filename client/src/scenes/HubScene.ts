import Phaser from "phaser";
import { getStateCallbacks } from "@colyseus/sdk";
import type { GameRoom } from "../net/room.js";
import {
  AMBIENCE,
  HUB_MAP,
  approachTo,
  nearZone,
  zoneById,
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  MOVE_STEP_MS,
  MSG_COOK_CANCEL,
  MSG_COOK_PREP,
  MSG_COOK_PREPARED,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_COOK_STOP,
  MSG_DEV,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_GREET,
  MSG_GREETED,
  MSG_HEAT_BAR,
  MSG_KICK,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_ATE,
  MSG_BOUGHT,
  MSG_BUY,
  MSG_EAT,
  MSG_REJECTED,
  MSG_SELL,
  MSG_EQUIP,
  MSG_SOLD,
  MSG_TRAVEL,
  MSG_UNLOCKED,
  findSection,
  isAdjacentOrOn,
  CELL,
  findPath,
  isWalkableOn,
  type CookPreparedPayload,
  type CookResultPayload,
  type GatherResultPayload,
  type GatherStartedPayload,
  type GreetedPayload,
  type HeatBarPayload,
  type MoveIntent,
  type NodesPayload,
  type ProfilePayload,
  type AtePayload,
  type BoughtPayload,
  type RejectedPayload,
  type SoldPayload,
  type TilePos,
  type UnlockedPayload,
} from "@crazycauldron/shared";
import { fetchCapacity } from "../net/api.js";
import { gameStore } from "../net/game.js";
import { GameMap, type MapFeature } from "../map/gameMap.js";
import { Avatar } from "../world/avatar.js";
import { Effects } from "../world/effects.js";
import { Ambience } from "../world/ambience.js";
import { sound } from "../world/sound.js";
import { directionFor, directionForVector, loadArt, type Manifest, type OffsetsFile } from "../art/manifest.js";
import { WalkDebug, type VectorSource } from "../dev/walkDebug.js";
import { Companion } from "../world/companion.js";
import { LABEL_SCREEN_PX, labelScale, planCamera } from "../map/camera.js";
import { TEX_MARKER } from "../map/textures.js";
import type { HubStateView, KickNotice, PlayerView, VillagerView } from "../net/state.js";
import { clearSession, type Session } from "../net/session.js";
import { Hud } from "../ui/hud.js";
import { openKitchen, runHeatBar, runPrep, showCookResult, type KitchenCallbacks } from "../ui/cooking.js";
import {
  Dock,
  openCodex,
  openInventory,
  openLeaderboard,
  openShop,
  openSkills,
  openSettings,
  openTavern,
  openWardrobe,
  type PanelCallbacks,
} from "../ui/panels.js";
import {
  showPanel,
  showProgress,
  toast,
  uiRoot,
  type ModalHandle,
  type ProgressHandle,
} from "../ui/overlay.js";
import { SCENE_HUB, SCENE_LOGIN } from "./keys.js";

interface HubSceneData {
  room: GameRoom<HubStateView>;
  session: Session;
}

interface AvatarEntry {
  avatar: Avatar;
  /** Only players have one; villagers walk alone. */
  companion?: Companion;
  tween?: Phaser.Tweens.Tween;
  /** The last vector a walk direction was chosen from, for the debug overlay. */
  vector?: { dx: number; dy: number; source: VectorSource };
}

/** How hard the camera chases the player. Low enough to glide, high enough to keep up. */
const FOLLOW_LERP = 0.12;

/**
 * How long a predicted route waits for the server before giving up.
 *
 * Three steps' worth: long enough that a slow round trip or a batched patch
 * does not abandon a walk that is really happening, short enough that a move
 * the server refused stops the legs within half a second.
 */
const PREDICTION_GRACE_MS = MOVE_STEP_MS * 3;

/** Matches the server's villager clock, so their walk tweens do not stutter. */
const VILLAGER_STEP_MS = AMBIENCE.villagers.stepMs;

/** Click radius around a villager, in world pixels - about a tile and a half. */
const VILLAGER_PICK_PX = 24;

/** A click on something out of reach: walk there, then do the thing. */
interface PendingAction {
  kind: "gather" | "travel";
  id: string;
  section?: number;
  tile: TilePos;
  /** Travel only: the gate being walked to, which decides when we have arrived. */
  zone?: string;
}

/**
 * The world view. Still a pure view of replicated state - a click sends an
 * intent and nothing happens until the server says so - now across four maps
 * rather than one, and with gather nodes on top.
 */
export class HubScene extends Phaser.Scene {
  private room!: GameRoom<HubStateView>;
  /** The room's callback proxy: where every state listener is registered. */
  private watch!: ReturnType<typeof getStateCallbacks<HubStateView>>;
  private session!: Session;
  private map!: GameMap;
  private hud!: Hud;
  private marker!: Phaser.GameObjects.Image;
  private readonly avatars = new Map<string, AvatarEntry>();
  private manifest!: Manifest;
  private artOffsets!: OffsetsFile;
  private fx!: Effects;
  private ambience!: Ambience;
  /** Hub residents, kept apart from players so neither list has to filter. */
  private readonly villagers = new Map<string, AvatarEntry>();
  /** Coins and XP before the current cook, so the reveal card can show the gain. */
  private beforeCook: { coins: number; chefXp: number } | null = null;
  /** Chef level last seen, to notice a level-up. */
  private lastChefLevel = 0;
  private departing = false;
  private currentSection = HUB_MAP;
  /**
   * The route the client worked out for itself, so the stride can start on the
   * click instead of a round trip later.
   *
   * Only the animation is predicted. Position stays the server's to decide -
   * the tween never moves to a cell the server has not confirmed - so a
   * mispredicted path costs a wrong-footed stride for a frame or two and
   * nothing else.
   */
  private predicted: { path: TilePos[]; giveUpAt: number } | null = null;

  /** Dev-only readout over each character; null in a production build. */
  private walkDebug: WalkDebug | null = null;

  private pending: PendingAction | null = null;
  /** A station clicked from across the map, opened once we arrive. */
  private pendingStation: string | null = null;
  private progress: ProgressHandle | null = null;
  private cookModal: ModalHandle | null = null;
  private dock!: Dock;
  private cooldownTimer?: Phaser.Time.TimerEvent;
  /** Current camera zoom, so labels can cancel it out as it changes. */
  private zoom = 1;

  constructor() {
    super(SCENE_HUB);
  }

  create(data: HubSceneData) {
    this.room = data.room;
    this.session = data.session;
    // Boot has already fetched these; this resolves from its cache.
    void loadArt().then((art) => {
      this.manifest = art.manifest;
      this.artOffsets = art.offsets;
    });
    this.departing = false;
    this.pending = null;
    this.pendingStation = null;
    this.currentSection = HUB_MAP;

    this.cameras.main.setBackgroundColor("#101a14");
    this.fx = new Effects(this);
    this.ambience = new Ambience(this, this.fx);
    this.buildMap(HUB_MAP);
    this.layoutCamera();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this),
    );

    this.marker = this.add.image(0, 0, TEX_MARKER).setOrigin(0.5).setAlpha(0).setDepth(9999);

    this.hud = new Hud({
      displayName: this.session.displayName,
      wallet: this.session.wallet,
      players: 0,
      hubMax: 0,
      section: HUB_MAP,
      roomReady: false,
    });

    void fetchCapacity()
      .then((capacity) => this.hud.update({ hubMax: capacity.hubMax }))
      .catch(() => undefined);

    this.dock = new Dock(uiRoot(), {
      inventory: () => openInventory(this.panelCallbacks()),
      skills: () => openSkills(),
      codex: () => openCodex(),
      leaderboard: () => openLeaderboard(this.session.wallet),
      settings: () => openSettings(),
    });

    this.bindState();
    this.bindInput();
    this.bindRoomEvents();
    this.bindCooking();

    // Node cooldowns tick down locally off the server's readyAt timestamps;
    // nothing is decided here, it is only redrawn.
    this.cooldownTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.refreshNodes(),
    });

    // The buff pill counts down between server messages, so it needs its own
    // tick; the value itself still comes from the server's expiry timestamp.
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.hud.update({}),
    });

    this.installDevConsole();
    // Compiled out of production along with everything else behind this flag.
    if (import.meta.env.DEV) this.walkDebug = new WalkDebug(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  /**
   * Console helpers, stripped from production bundles.
   *
   * import.meta.env.DEV is a compile-time constant, so this whole block is
   * removed by the bundler rather than merely skipped - and the server refuses
   * to register the matching handler outside development anyway.
   */
  private installDevConsole() {
    if (!import.meta.env.DEV) return;

    const dev = {
      level: (n: number) => {
        this.room.send(MSG_DEV, { command: "level", value: n });
        return `asked the server for level ${n}`;
      },
      /*
       * The only way to get a companion: the slot has no unlocks yet, and a
       * follower nobody can put on is a follower nobody can look at.
       */
      companion: (id: string) => {
        this.room.send(MSG_DEV, { command: "companion", value: id });
        const known = this.manifest.companions.map((c) => c.id);
        return id
          ? `asked for ${id}${known.includes(id) ? "" : ` (no art; known: ${known.join(", ")})`}`
          : "asked to clear the companion";
      },
      help: () =>
        [
          "cc.level(n)       - set Chef and every skill to n",
          "cc.companion(id)  - walk with a companion; \"\" clears it",
        ].join("\n"),
    };
    (window as unknown as { cc?: typeof dev }).cc = dev;
    console.info("dev: cc.help() lists what is available. Development only.");
  }

  override update(now: number, delta: number) {
    /*
     * A prediction that the server never acted on is a move it refused -
     * blocked ground, out of range, too many messages - and the character
     * would otherwise march on the spot forever. The clock is pushed forward
     * every time the server confirms a cell, so this only fires on silence.
     */
    if (this.predicted && now > this.predicted.giveUpAt) this.clearPrediction();

    // Everyone in the room breathes, fidgets and dances - the motion is
    // procedural, so it costs the same for one player or thirty.
    for (const entry of this.avatars.values()) {
      entry.avatar.tick(now);
      /*
       * Companions chase from here rather than from a state patch. Their whole
       * position is derived from the player they follow, so there is nothing
       * to replicate and nothing to arrive late - they simply keep up, every
       * frame, on every client, identically.
       */
      entry.companion?.follow(
        entry.avatar.container.x,
        entry.avatar.container.y,
        entry.avatar.heading,
        entry.avatar.container.depth,
        now,
        delta,
      );
    }
    for (const entry of this.villagers.values()) entry.avatar.tick(now);

    this.walkDebug?.update([...this.avatars.values(), ...this.villagers.values()]);
  }

  private buildMap(mapId: number) {
    this.map?.destroy();
    this.map = new GameMap(this, mapId);
    this.currentSection = mapId;
    this.map.applyLabelScale(this.zoom);
    this.refreshNodes();
    this.ambience.start(this.map);
    sound.enterMap(mapId);
  }

  /*
   * Listeners hang off a proxy, not off the state.
   *
   * $(x) returns the callback surface for whatever x is - a collection gets
   * onAdd/onRemove, a decoded object gets onChange - and the decoded state
   * itself stays plain data. Keeping the proxy on the scene means every
   * avatar's onChange can be registered from the same one.
   */
  private bindState() {
    this.watch = getStateCallbacks(this.room);
    const state = this.watch(this.room.state);

    state.players.onAdd((player, sessionId) => {
      this.addAvatar(player, sessionId);
      this.refreshCrowd();
    }, true);

    state.players.onRemove((_player, sessionId) => {
      this.removeAvatar(sessionId);
      this.refreshCrowd();
    });

    // Villagers arrive the same way players do and are drawn the same way, but
    // they are not players: they never reach refreshCrowd, so the room count
    // stays a count of people who are actually playing.
    state.villagers.onAdd((villager, id) => this.addVillager(villager, id), true);
    state.villagers.onRemove((_villager, id) => this.removeVillager(id));
  }

  /**
   * Only players standing on the same map are counted.
   *
   * Reaching here at all means a state patch has been decoded, which is what
   * the HUD needs to stop saying it is still connecting.
   */
  private refreshCrowd() {
    let here = 0;
    this.room.state.players.forEach((player) => {
      if (player.section === this.currentSection) here += 1;
    });
    this.hud.update({ players: here, section: this.currentSection, roomReady: true });
  }

  private bindInput() {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // Features win over bare ground within the pick radius, so a slightly
      // missed click on a node still gathers rather than walking past it.
      const feature = this.map.pickFeature(pointer.worldX, pointer.worldY);
      if (feature) return this.onFeatureClicked(feature);

      // Villagers are checked after features and before the ground, so they
      // can be talked to without ever standing between a player and a node.
      const villagerId = this.pickVillager(pointer.worldX, pointer.worldY);
      if (villagerId) {
        this.room.send(MSG_GREET, { villagerId });
        sound.play("click");
        return;
      }

      const tile = this.map.tileAt(pointer.worldX, pointer.worldY);
      if (!tile) return;
      this.pending = null;
      this.sendMove(tile);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const feature = this.map.pickFeature(pointer.worldX, pointer.worldY);
      this.map.setHighlight(feature);
      this.input.setDefaultCursor(feature ? "pointer" : "default");
    });
  }

  private sendMove(tile: TilePos) {
    const intent: MoveIntent = tile;
    this.room.send(MSG_MOVE, intent);
    this.flashMarker(tile.tileX, tile.tileY);
    this.predict(tile);
  }

  /**
   * Starts the walk animation now, from a route the client works out itself.
   *
   * The same pathfinder the server runs, over the same grid, so the two agree
   * except where the world changed between them. Without this the character
   * stands still for a round trip after every click and then jerks into a
   * stride, which is the single most noticeable thing about moving.
   */
  private predict(destination: TilePos) {
    const me = this.self();
    const entry = me && this.avatars.get(this.room.sessionId);
    if (!me || !entry) return;

    const from = { tileX: me.tileX, tileY: me.tileY };
    const path = findPath(from, destination, (x, y) =>
      isWalkableOn(this.currentSection, x, y),
    );

    if (path.length === 0) {
      this.clearPrediction();
      return;
    }

    this.predicted = { path, giveUpAt: this.time.now + PREDICTION_GRACE_MS };
    const dx = path[0]!.tileX - from.tileX;
    const dy = path[0]!.tileY - from.tileY;
    entry.vector = { dx, dy, source: "intent" };
    entry.avatar.setIntent(directionForVector(dx, dy, directionFor(me.facing)));
  }

  /**
   * Keeps the predicted route level with where the server says the player is.
   *
   * Cells the server has reached are dropped, and the intent becomes the
   * direction of the step after them - the one the character is about to
   * take. When the route runs out, or the server goes somewhere the route
   * does not, the prediction is abandoned and the server's own facing takes
   * over again.
   */
  private advancePrediction(player: PlayerView) {
    if (!this.predicted) return;
    const entry = this.avatars.get(this.room.sessionId);
    if (!entry) return;

    const reached = this.predicted.path.findIndex(
      (cell) => cell.tileX === player.tileX && cell.tileY === player.tileY,
    );

    if (reached >= 0) {
      this.predicted.path = this.predicted.path.slice(reached + 1);
      this.predicted.giveUpAt = this.time.now + PREDICTION_GRACE_MS;
    }

    const next = this.predicted.path[0];
    if (!next) {
      this.clearPrediction();
      return;
    }

    const dx = next.tileX - player.tileX;
    const dy = next.tileY - player.tileY;
    entry.vector = { dx, dy, source: "intent" };
    entry.avatar.setIntent(directionForVector(dx, dy, directionFor(player.facing)));
  }

  /** Forgets the route and lets the server decide again. */
  private clearPrediction() {
    this.predicted = null;
    this.avatars.get(this.room.sessionId)?.avatar.setIntent(null);
  }

  /**
   * A click on something means "go there and do it".
   *
   * Nodes are gathered from beside them and zones are used from within reach
   * of their edge, so clicking one walks to the right cell and remembers what
   * to do on arrival. A painted building is solid, so the cell a player wants
   * is always outside it - which is why the approach is asked of the area
   * rather than worked out from the zone's centre.
   */
  private onFeatureClicked(feature: MapFeature) {
    if (feature.kind === "zone") {
      const zone = zoneById(this.currentSection, feature.id);
      if (!zone) return;

      const me = this.self();
      const here = me ? { tileX: me.tileX, tileY: me.tileY } : { tileX: 0, tileY: 0 };
      const arrived = nearZone(zone, here.tileX, here.tileY);

      if (zone.kind === "portal") {
        this.pending = {
          kind: "travel",
          id: zone.id,
          ...(zone.section !== undefined ? { section: zone.section } : {}),
          tile: { tileX: zone.c, tileY: zone.r },
          zone: zone.id,
        };
        if (arrived) return this.firePending();
      } else {
        if (arrived) return this.openStation(zone.id);
        this.pendingStation = zone.id;
      }

      const approach = approachTo(this.currentSection, zone, here);
      if (!approach) return toast("There is no way to reach that.", "bad");
      return this.sendMove(approach);
    }

    this.pending = { kind: "gather", id: feature.id, tile: feature.tile };
    this.map.squashNode(feature.id);

    if (this.isSelfNear(feature.tile)) return this.firePending();
    this.walkAdjacentTo(feature.tile);
  }

  private walkAdjacentTo(tile: TilePos) {
    const target = this.nearestWalkableBeside(tile);
    if (!target) {
      toast("There is no way to reach that.", "bad");
      return;
    }
    this.sendMove(target);
  }

  /** A walkable neighbour of `tile`, preferring the one closest to the player. */
  private nearestWalkableBeside(tile: TilePos): TilePos | null {
    const me = this.self();
    if (!me) return null;

    const candidates: TilePos[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidate = { tileX: tile.tileX + dx, tileY: tile.tileY + dy };
        if (isWalkableOn(this.currentSection, candidate.tileX, candidate.tileY)) {
          candidates.push(candidate);
        }
      }
    }
    if (candidates.length === 0) return null;

    const distance = (t: TilePos) =>
      Math.max(Math.abs(t.tileX - me.tileX), Math.abs(t.tileY - me.tileY));
    return candidates.reduce((best, c) => (distance(c) < distance(best) ? c : best));
  }

  private self(): PlayerView | undefined {
    return this.room.state.players.get(this.room.sessionId);
  }

  private isSelfNear(tile: TilePos): boolean {
    const me = this.self();
    return me ? isAdjacentOrOn({ tileX: me.tileX, tileY: me.tileY }, tile) : false;
  }

  /** Whether the player is close enough for a queued action to fire. */
  private hasArrived(action: PendingAction): boolean {
    const me = this.self();
    if (!me) return false;
    if (action.zone) {
      const zone = zoneById(this.currentSection, action.zone);
      return zone ? nearZone(zone, me.tileX, me.tileY) : false;
    }
    return this.isSelfNear(action.tile);
  }

  private firePending() {
    const action = this.pending;
    if (!action) return;
    this.pending = null;

    if (action.kind === "gather") this.room.send(MSG_GATHER, { nodeId: action.id });
    else this.room.send(MSG_TRAVEL, { section: action.section ?? HUB_MAP });
  }

  private bindRoomEvents() {
    this.room.onMessage(MSG_KICK, (notice: KickNotice) => this.onKicked(notice));

    this.room.onMessage(MSG_PROFILE, (profile: ProfilePayload) => {
      gameStore.setProfile(profile);
      this.checkLevelUp();
    });

    this.room.onMessage(MSG_NODES, (payload: NodesPayload) => {
      gameStore.setNodes(payload.section, payload.nodes, payload.serverNow);
      this.refreshNodes();
    });

    this.room.onMessage(MSG_GATHER_STARTED, (payload: GatherStartedPayload) => {
      this.progress?.done();
      this.progress = showProgress("Gathering…", payload.durationMs);
    });

    this.room.onMessage(MSG_GATHER_RESULT, (result: GatherResultPayload) => {
      this.progress?.done();
      this.progress = null;
      gameStore.updateNode(this.currentSection, {
        id: result.nodeId,
        readyAt: result.readyAt,
        available: true,
      });
      this.refreshNodes();

      sound.play("gather");
      const doubled = result.doubled ? " (double drop!)" : "";
      toast(`+${result.qty} ${result.name}${doubled} · +${result.skillXp} ${result.skill} XP`);
    });

    this.room.onMessage(MSG_GREETED, (greeting: GreetedPayload) => {
      this.villagers.get(greeting.villagerId)?.avatar.say(greeting.line);
    });

    this.room.onMessage(MSG_REJECTED, (rejection: RejectedPayload) => {
      this.progress?.done();
      this.progress = null;
      this.pending = null;
      this.pendingStation = null;
      this.cookModal?.close();
      this.cookModal = null;
      toast(rejection.message, "bad");
    });

    this.room.onLeave(() => {
      if (this.departing) return;
      this.departing = true;
      this.scene.start(SCENE_LOGIN, { error: "You were disconnected from the hub." });
    });

    this.room.onError((code, message) => {
      toast(message ?? `Connection error (${code}).`, "bad");
    });
  }

  // --- stations ------------------------------------------------------------

  /** The callbacks every stage of the mini-game reports back through. */
  private kitchenCallbacks(): KitchenCallbacks {
    return {
      onCook: (recipeId) => {
        const profile = gameStore.profile;
        this.beforeCook = profile ? { coins: profile.coins, chefXp: profile.chefXp } : null;
        this.room.send(MSG_COOK_START, { recipeId });
      },
      onPrepDone: (cookId) => this.room.send(MSG_COOK_PREP, { cookId }),
      onStop: (cookId, elapsedMs) => this.room.send(MSG_COOK_STOP, { cookId, elapsedMs }),
      onCancel: () => this.room.send(MSG_COOK_CANCEL, {}),
    };
  }

  /** Selling, eating and buying all report back through here. */
  private panelCallbacks(): PanelCallbacks {
    return {
      onEat: (stackKey) => this.room.send(MSG_EAT, { stackKey }),
      onSell: (stackKey, qty) => this.room.send(MSG_SELL, { stackKey, qty }),
      onBuy: (kind, tier) => this.room.send(MSG_BUY, { kind, tier }),
    };
  }

  private openStation(id: string) {
    if (id === "kitchen") this.cookModal = openKitchen(this.kitchenCallbacks());
    else if (id === "tavern") openTavern(this.panelCallbacks());
    else if (id === "outfitter") {
      // The outfitter sells upgrades and keeps the wardrobe; both open here.
      openShop(this.panelCallbacks());
      openWardrobe((itemId) => this.room.send(MSG_EQUIP, { kind: "hat", itemId }));
    }
  }

  private bindCooking() {
    this.room.onMessage(MSG_COOK_PREPARED, (payload: CookPreparedPayload) => {
      this.cookModal?.close();
      // Auto-prep sends the bar immediately, so there is nothing to hold.
      this.cookModal = payload.autoPrep ? null : runPrep(payload, this.kitchenCallbacks());
    });

    this.room.onMessage(MSG_HEAT_BAR, (payload: HeatBarPayload) => {
      this.cookModal?.close();
      this.cookModal = runHeatBar(payload, this.kitchenCallbacks());
      this.startSizzle(payload.durationMs);
    });

    this.room.onMessage(MSG_COOK_RESULT, (result: CookResultPayload) => {
      this.cookModal?.close();
      sound.play("cook");
      this.celebrateCook(result);
      // The profile arrives just after this, so the card reads the gain from
      // what was true before the cook rather than from a value already updated.
      this.cookModal = showCookResult(result, gameStore.profile, this.beforeCook);
    });

    this.room.onMessage(MSG_SOLD, (sold: SoldPayload) => {
      sound.play("sell");
      toast(`Sold ${sold.qty} x ${sold.name} for ${sold.coins}c · ${sold.totalCoins} coins`);
    });

    this.room.onMessage(MSG_ATE, (ate: AtePayload) => {
      const minutes = Math.round((ate.buffExpiresAt - gameStore.serverNow()) / 60000);
      toast(`Ate ${ate.name}. +${ate.gatherSpeedPct}% gathering for ${minutes} minutes.`);
    });

    this.room.onMessage(MSG_UNLOCKED, (payload: UnlockedPayload) => {
      const names = payload.items.map((i) => i.name).join(", ");
      toast(`Unlocked: ${names}. Try it on at the Outfitter.`);
    });

    this.room.onMessage(MSG_BOUGHT, (bought: BoughtPayload) => {
      toast(`Bought the ${bought.name} for ${bought.coins}c · ${bought.totalCoins} coins left`);
    });
  }

  // --- camera --------------------------------------------------------------

  /**
   * Fits the camera to the current window.
   *
   * Zoom comes from the viewport width, bounds from the map, and the choice
   * between following the player and centring the map comes from whether the
   * map is actually bigger than the view. Phaser clamps the scroll to the
   * bounds itself, which is what keeps empty space off the screen on the axes
   * that do scroll.
   */
  private layoutCamera() {
    const camera = this.cameras.main;
    const plan = planCamera(this.scale.width, this.scale.height, this.map.worldBounds);

    this.zoom = plan.zoom;
    camera.setSize(this.scale.width, this.scale.height);
    camera.setZoom(plan.zoom);
    camera.setBounds(
      plan.bounds.x,
      plan.bounds.y,
      plan.bounds.width,
      plan.bounds.height,
      // centerOn: with nothing to scroll, sit in the middle of the map.
      plan.fitsEntirely,
    );

    const self = this.avatars.get(this.room.sessionId)?.avatar;
    if (plan.fitsEntirely || !self) {
      camera.stopFollow();
      camera.centerOn(plan.centre.x, plan.centre.y);
    } else {
      // roundPixels on the follow keeps the scroll on whole pixels, so a 32px
      // tile never straddles a device pixel and shimmers.
      camera.startFollow(self.container, true, FOLLOW_LERP, FOLLOW_LERP);
    }

    this.map.applyLabelScale(plan.zoom);
    this.applyAvatarLabelScale();
  }

  private onResize() {
    this.layoutCamera();
  }

  /** Name labels live in the world, so they have to cancel the zoom out. */
  private applyAvatarLabelScale() {
    const scale = labelScale(this.zoom);
    const resolution = Math.max(1, Math.ceil(this.zoom));
    for (const entry of this.avatars.values()) entry.avatar.setLabelScale(scale, resolution);
    for (const entry of this.villagers.values()) entry.avatar.setLabelScale(scale, resolution);
  }

  // --- feel ----------------------------------------------------------------

  /** Sparks off the pan while the heat bar runs. */
  private startSizzle(durationMs: number) {
    const kitchen = this.map.features.find((f) => f.id === "kitchen");
    if (!kitchen) return;
    const at = this.map.tileCentre(kitchen.tile.tileX, kitchen.tile.tileY);

    const timer = this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => this.fx.spark(at.x + Phaser.Math.Between(-6, 6), at.y - 20, 10000),
    });
    this.time.delayedCall(durationMs, () => timer.remove());
  }

  /** Steam in the dish's colour, then the knock and chime if it was Superb. */
  private celebrateCook(result: CookResultPayload) {
    const kitchen = this.map.features.find((f) => f.id === "kitchen");
    if (kitchen) {
      const at = this.map.tileCentre(kitchen.tile.tileX, kitchen.tile.tileY);
      for (let i = 0; i < 6; i += 1) {
        this.time.delayedCall(i * 110, () => this.fx.steam(at.x, at.y - 24, result.quality));
      }
    }

    if (result.quality === "superb") {
      this.fx.shake();
      this.fx.chime();
    }
  }

  /** A burst over the player whenever the Chef level ticks up. */
  private checkLevelUp() {
    const profile = gameStore.profile;
    if (!profile) return;

    if (this.lastChefLevel === 0) {
      this.lastChefLevel = profile.chefLevel;
      return;
    }
    if (profile.chefLevel <= this.lastChefLevel) return;

    this.lastChefLevel = profile.chefLevel;
    const self = this.avatars.get(this.room.sessionId)?.avatar;
    if (self) this.fx.burst(self.container.x, self.container.y - 24);
    toast(`Chef Level ${profile.chefLevel}.`);
  }

  /** Redraws node sprites from whatever the server last said about them. */
  private refreshNodes() {
    if (this.currentSection === HUB_MAP) return;
    for (const node of gameStore.nodes(this.currentSection)) {
      const seconds = gameStore.cooldownSeconds(this.currentSection, node.id);
      const total = gameStore.cooldownTotalSeconds(this.currentSection, node.id);
      this.map.setNodeReady(node.id, seconds === 0, node.available, seconds, total);
    }
  }

  // --- villagers -----------------------------------------------------------

  private addVillager(villager: VillagerView, id: string) {
    const at = this.map.tileCentre(villager.tileX, villager.tileY);
    const avatar = new Avatar(
      this,
      this.manifest,
      this.artOffsets,
      {
        body: villager.body || "male",
        hatId: villager.hatId ?? "",
        displayName: villager.name,
        isSelf: false,
      },
      at.x,
      at.y,
    );
    avatar.container.setDepth(this.map.depthForActor(villager.tileY));
    avatar.container.setVisible(this.currentSection === HUB_MAP);
    avatar.setDirection(directionFor(villager.facing), villager.moving);

    const entry: AvatarEntry = { avatar };
    this.villagers.set(id, entry);
    this.watch(villager).onChange(() => this.onVillagerChanged(id, villager));
  }

  private onVillagerChanged(id: string, villager: VillagerView) {
    const entry = this.villagers.get(id);
    if (!entry) return;

    entry.avatar.container.setVisible(this.currentSection === HUB_MAP);
    const target = this.map.tileCentre(villager.tileX, villager.tileY);
    const moved =
      entry.avatar.container.x !== target.x || entry.avatar.container.y !== target.y;

    entry.vector = moved
      ? {
          dx: (target.x - entry.avatar.container.x) / CELL,
          dy: (target.y - entry.avatar.container.y) / CELL,
          source: "tween",
        }
      : { dx: 0, dy: 0, source: "facing" };

    entry.avatar.setDirection(
      moved
        ? directionForVector(
            target.x - entry.avatar.container.x,
            target.y - entry.avatar.container.y,
            directionFor(villager.facing),
          )
        : directionFor(villager.facing),
      villager.moving,
    );
    if (!moved) return;

    entry.tween?.stop();
    entry.avatar.setTweening(true);
    entry.tween = this.tweens.add({
      targets: entry.avatar.container,
      x: target.x,
      y: target.y,
      // Matched to the server's villager step, not the player's: a tween that
      // finishes early leaves them standing still between cells.
      duration: VILLAGER_STEP_MS,
      ease: "Linear",
      onUpdate: () => entry.avatar.container.setDepth(this.map.depthForActor(villager.tileY)),
      onComplete: () => entry.avatar.setTweening(false),
      onStop: () => entry.avatar.setTweening(false),
    });
  }

  private removeVillager(id: string) {
    const entry = this.villagers.get(id);
    if (!entry) return;
    entry.tween?.stop();
    entry.avatar.destroy();
    this.villagers.delete(id);
  }

  /** The villager nearest a pointer, within the same radius features use. */
  private pickVillager(worldX: number, worldY: number): string | null {
    if (this.currentSection !== HUB_MAP) return null;

    let best: string | null = null;
    let bestDistance = VILLAGER_PICK_PX;
    for (const [id, entry] of this.villagers) {
      const container = entry.avatar.container;
      if (!container.visible) continue;
      // Measured against the middle of the body rather than the feet, which is
      // where the pointer naturally lands.
      const distance = Phaser.Math.Distance.Between(worldX, worldY, container.x, container.y - 20);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }

  private addAvatar(player: PlayerView, sessionId: string) {
    const position = this.map.tileCentre(player.tileX, player.tileY);
    const isSelf = player.wallet === this.session.wallet;

    const avatar = new Avatar(
      this,
      this.manifest,
      this.artOffsets,
      {
        body: player.body || "male",
        hatId: player.hatId ?? "",
        displayName: player.displayName,
        isSelf,
      },
      position.x,
      position.y,
    );
    avatar.container.setDepth(this.map.depthForActor(player.tileY));
    avatar.container.setVisible(player.section === this.currentSection);
    avatar.setDirection(directionFor(player.facing), player.moving);
    avatar.setActivity(player.activity ?? "");

    const companion = new Companion(this);
    companion.setCompanion(player.companionId ?? "");
    companion.setVisible(player.section === this.currentSection);
    companion.snapTo(position.x, position.y, avatar.heading);

    const entry: AvatarEntry = { avatar, companion };
    this.avatars.set(sessionId, entry);

    this.watch(player).onChange(() => this.onPlayerChanged(sessionId, player));

    // The camera cannot follow before the player it follows exists.
    if (isSelf) this.layoutCamera();
  }

  private onPlayerChanged(sessionId: string, player: PlayerView) {
    const entry = this.avatars.get(sessionId);
    if (!entry) return;
    const { avatar } = entry;

    const isSelf = player.wallet === this.session.wallet;

    // Our own section change means a new map; everyone else's just means they
    // walked out of view.
    if (isSelf && player.section !== this.currentSection) {
      this.buildMap(player.section);
      this.rebuildAvatarsForMap();
      this.layoutCamera();
      this.refreshCrowd();
      const section = findSection(player.section);
      toast(section ? `Entered ${section.name}.` : "Back in the hub.");
    }

    avatar.container.setVisible(player.section === this.currentSection);
    avatar.setLook({
      body: player.body || "male",
      hatId: player.hatId ?? "",
      displayName: player.displayName,
      isSelf,
    });
    entry.companion?.setCompanion(player.companionId ?? "");
    entry.companion?.setVisible(player.section === this.currentSection);
    avatar.setActivity(player.activity ?? "");

    /*
     * The stride follows the vector the character is actually travelling,
     * not the server's last facing.
     *
     * With eight-direction movement those two disagree often enough to see: a
     * state patch can carry two steps at once, and the facing that arrives
     * with it describes the second while the tween still has to cover both.
     * Taking the direction from the tween's own delta gets it right by
     * construction, and falls back to the facing when there is no delta - a
     * player who turned on the spot.
     */
    if (isSelf) this.advancePrediction(player);

    const target = this.map.tileCentre(player.tileX, player.tileY);
    const dx = target.x - avatar.container.x;
    const dy = target.y - avatar.container.y;
    const moved = dx !== 0 || dy !== 0;

    // In cells, like the predicted vector, so the two can be read against
    // each other in the debug overlay rather than compared in different units.
    entry.vector = moved
      ? { dx: dx / CELL, dy: dy / CELL, source: "tween" }
      : { dx: 0, dy: 0, source: "facing" };

    if (moved) {
      entry.tween?.stop();
      // Walking until the tween says otherwise: the server clears its own
      // moving flag on the last step, a whole step before the figure arrives.
      avatar.setTweening(true);
      entry.tween = this.tweens.add({
        targets: avatar.container,
        x: target.x,
        y: target.y,
        duration: MOVE_STEP_MS,
        ease: "Linear",
        onUpdate: () => avatar.container.setDepth(this.map.depthForActor(player.tileY)),
        onComplete: () => avatar.setTweening(false),
        onStop: () => avatar.setTweening(false),
      });
    }

    /*
     * After the tween, not before it.
     *
     * Stopping the previous tween fires its onStop, which hands the direction
     * to the predicted route - the step *after* this one. That is right in a
     * gap between steps and wrong here, because this step is about to be
     * drawn. Setting the direction last means the motion on screen decides,
     * and the prediction only fills the silence.
     */
    avatar.setDirection(
      moved ? directionForVector(dx, dy, directionFor(player.facing)) : directionFor(player.facing),
      player.moving,
    );

    // Arriving is what triggers the queued action. A node has to be adjacent;
    // a gate or a counter only has to be within reach of its edge.
    if (isSelf && this.pending && !player.moving && this.hasArrived(this.pending)) {
      this.firePending();
    }
    if (isSelf && this.pendingStation && !player.moving) {
      const zone = zoneById(this.currentSection, this.pendingStation);
      if (zone && nearZone(zone, player.tileX, player.tileY)) {
        const id = this.pendingStation;
        this.pendingStation = null;
        this.openStation(id);
      }
    }
    if (isSelf) this.refreshCrowd();
  }

  private rebuildAvatarsForMap() {
    // The avatars are about to be thrown away and rebuilt, so any route
    // predicted against the old map is about to be a route to nowhere.
    this.predicted = null;

    this.room.state.villagers.forEach((villager, id) => {
      const entry = this.villagers.get(id);
      if (!entry) return;
      const at = this.map.tileCentre(villager.tileX, villager.tileY);
      entry.tween?.stop();
      entry.avatar.container.setPosition(at.x, at.y);
      entry.avatar.container.setVisible(this.currentSection === HUB_MAP);
    });

    this.room.state.players.forEach((player, sessionId) => {
      const entry = this.avatars.get(sessionId);
      if (!entry) return;
      const at = this.map.tileCentre(player.tileX, player.tileY);
      entry.tween?.stop();
      entry.avatar.container.setPosition(at.x, at.y);
      entry.avatar.container.setVisible(player.section === this.currentSection);
      // Snapped rather than chased: a companion should not be seen crossing
      // the map to catch up with somebody who walked through a gate.
      entry.companion?.setVisible(player.section === this.currentSection);
      entry.companion?.snapTo(at.x, at.y, entry.avatar.heading);
    });
  }

  private removeAvatar(sessionId: string) {
    const entry = this.avatars.get(sessionId);
    if (!entry) return;
    entry.tween?.stop();
    entry.companion?.destroy();
    entry.avatar.destroy();
    this.avatars.delete(sessionId);
  }

  private flashMarker(tileX: number, tileY: number) {
    const world = this.map.tileCentre(tileX, tileY);
    this.marker.setPosition(world.x, world.y).setAlpha(0.9);
    this.tweens.add({ targets: this.marker, alpha: 0, duration: 400, ease: "Quad.easeOut" });
  }

  private onKicked(notice: KickNotice) {
    this.departing = true;

    const explanation =
      notice.reason === KICK_INSUFFICIENT_HOLD
        ? "Your $COOK balance fell below the amount the hub requires."
        : notice.reason === KICK_AUTH_EXPIRED
          ? "Your session expired."
          : "The server ended your session.";

    clearSession();
    this.hud.destroy();
    showPanel({
      title: "Removed from the hub",
      error: explanation,
      actions: [
        {
          label: "Back to sign-in",
          onClick: () => {
            this.scene.start(SCENE_LOGIN);
          },
        },
      ],
    });
  }

  private teardown() {
    this.input.removeAllListeners();
    this.cooldownTimer?.remove();
    this.progress?.done();
    this.cookModal?.close();
    this.dock?.destroy();
    this.walkDebug?.destroy();
    this.walkDebug = null;
    for (const sessionId of [...this.avatars.keys()]) this.removeAvatar(sessionId);
    for (const id of [...this.villagers.keys()]) this.removeVillager(id);
    this.ambience?.stop();
    sound.stop();
    this.hud.destroy();
    if (!this.departing) {
      this.departing = true;
      void this.room.leave();
    }
  }
}