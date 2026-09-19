import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  HUB_MAP,
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
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
  isWalkableOn,
  type CookPreparedPayload,
  type CookResultPayload,
  type GatherResultPayload,
  type GatherStartedPayload,
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
import { loadArt, type Direction, type Manifest, type OffsetsFile } from "../art/manifest.js";
import { LABEL_SCREEN_PX, labelScale, planCamera } from "../map/camera.js";
import { TEX_MARKER } from "../map/textures.js";
import type { HubStateView, KickNotice, PlayerView } from "../net/state.js";
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
  room: Room<HubStateView>;
  session: Session;
}

interface AvatarEntry {
  avatar: Avatar;
  tween?: Phaser.Tweens.Tween;
}

/** How hard the camera chases the player. Low enough to glide, high enough to keep up. */
const FOLLOW_LERP = 0.12;

/** A click on something out of reach: walk there, then do the thing. */
interface PendingAction {
  kind: "gather" | "travel";
  id: string;
  section?: number;
  tile: TilePos;
}

/**
 * The world view. Still a pure view of replicated state - a click sends an
 * intent and nothing happens until the server says so - now across four maps
 * rather than one, and with gather nodes on top.
 */
export class HubScene extends Phaser.Scene {
  private room!: Room<HubStateView>;
  private session!: Session;
  private map!: GameMap;
  private hud!: Hud;
  private marker!: Phaser.GameObjects.Image;
  private readonly avatars = new Map<string, AvatarEntry>();
  private manifest!: Manifest;
  private artOffsets!: OffsetsFile;
  private departing = false;
  private currentSection = HUB_MAP;
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
    this.buildMap(HUB_MAP);
    this.layoutCamera();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this),
    );

    this.marker = this.add.image(0, 0, TEX_MARKER).setOrigin(0.5, 0).setAlpha(0).setDepth(9999);

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  override update() {
    // Garments copy the body's bob, which only the animation knows about.
    for (const entry of this.avatars.values()) entry.avatar.tick();
  }

  private buildMap(mapId: number) {
    this.map?.destroy();
    this.map = new GameMap(this, mapId);
    this.currentSection = mapId;
    this.map.applyLabelScale(this.zoom);
    this.refreshNodes();
  }

  private bindState() {
    this.room.state.players.onAdd((player, sessionId) => {
      this.addAvatar(player, sessionId);
      this.refreshCrowd();
    }, true);

    this.room.state.players.onRemove((_player, sessionId) => {
      this.removeAvatar(sessionId);
      this.refreshCrowd();
    });
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
      const tile = this.map.tileAt(pointer.worldX, pointer.worldY);
      if (!tile) return;

      const feature = this.map.featureAt(tile);
      if (feature) return this.onFeatureClicked(feature);

      this.pending = null;
      this.sendMove(tile);
    });
  }

  private sendMove(tile: TilePos) {
    const intent: MoveIntent = tile;
    this.room.send(MSG_MOVE, intent);
    this.flashMarker(tile.tileX, tile.tileY);
  }

  /**
   * Nodes and portals are acted on from an adjacent tile. Clicking one walks
   * there and remembers what to do on arrival, so the player never has to
   * position themselves by hand.
   */
  private onFeatureClicked(feature: MapFeature) {
    if (feature.kind === "station") {
      if (this.isSelfNear(feature.tile)) this.openStation(feature.id);
      else {
        this.pendingStation = feature.id;
        this.walkAdjacentTo(feature.tile);
      }
      return;
    }

    const kind = feature.kind === "node" ? "gather" : "travel";
    this.pending = {
      kind,
      id: feature.id,
      ...(feature.section !== undefined ? { section: feature.section } : {}),
      tile: feature.tile,
    };

    if (this.isSelfNear(feature.tile)) {
      this.firePending();
      return;
    }
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

    const distance = (t: TilePos) => Math.abs(t.tileX - me.tileX) + Math.abs(t.tileY - me.tileY);
    return candidates.reduce((best, c) => (distance(c) < distance(best) ? c : best));
  }

  private self(): PlayerView | undefined {
    return this.room.state.players.get(this.room.sessionId);
  }

  private isSelfNear(tile: TilePos): boolean {
    const me = this.self();
    return me ? isAdjacentOrOn({ tileX: me.tileX, tileY: me.tileY }, tile) : false;
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

      const doubled = result.doubled ? " (double drop!)" : "";
      toast(`+${result.qty} ${result.name}${doubled} · +${result.skillXp} ${result.skill} XP`);
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
      onCook: (recipeId) => this.room.send(MSG_COOK_START, { recipeId }),
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
      openWardrobe((kind, itemId) => this.room.send(MSG_EQUIP, { kind, itemId }));
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
    });

    this.room.onMessage(MSG_COOK_RESULT, (result: CookResultPayload) => {
      this.cookModal?.close();
      this.cookModal = showCookResult(result, gameStore.profile);
    });

    this.room.onMessage(MSG_SOLD, (sold: SoldPayload) => {
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
  }

  /** Redraws node sprites from whatever the server last said about them. */
  private refreshNodes() {
    if (this.currentSection === HUB_MAP) return;
    for (const node of gameStore.nodes(this.currentSection)) {
      const seconds = gameStore.cooldownSeconds(this.currentSection, node.id);
      this.map.setNodeReady(node.id, seconds === 0, node.available, seconds);
    }
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
        apronId: player.apronId ?? "",
        displayName: player.displayName,
        isSelf,
      },
      position.x,
      position.y,
    );
    avatar.container.setDepth(player.tileX + player.tileY);
    avatar.container.setVisible(player.section === this.currentSection);
    avatar.setDirection((player.facing as Direction) ?? "down", player.moving);

    const entry: AvatarEntry = { avatar };
    this.avatars.set(sessionId, entry);

    player.onChange(() => this.onPlayerChanged(sessionId, player));

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
      apronId: player.apronId ?? "",
      displayName: player.displayName,
      isSelf,
    });
    avatar.setDirection((player.facing as Direction) ?? "down", player.moving);

    const target = this.map.tileCentre(player.tileX, player.tileY);
    if (avatar.container.x !== target.x || avatar.container.y !== target.y) {
      entry.tween?.stop();
      entry.tween = this.tweens.add({
        targets: avatar.container,
        x: target.x,
        y: target.y,
        duration: MOVE_STEP_MS,
        ease: "Linear",
        onUpdate: () => avatar.container.setDepth(player.tileX + player.tileY),
      });
    }

    // Arriving next to whatever was clicked is what triggers the queued action.
    if (isSelf && this.pending && !player.moving && this.isSelfNear(this.pending.tile)) {
      this.firePending();
    }
    if (isSelf && this.pendingStation && !player.moving) {
      const station = this.map.features.find((f) => f.id === this.pendingStation);
      if (station && this.isSelfNear(station.tile)) {
        const id = this.pendingStation;
        this.pendingStation = null;
        this.openStation(id);
      }
    }
    if (isSelf) this.refreshCrowd();
  }

  private rebuildAvatarsForMap() {
    this.room.state.players.forEach((player, sessionId) => {
      const entry = this.avatars.get(sessionId);
      if (!entry) return;
      const at = this.map.tileCentre(player.tileX, player.tileY);
      entry.tween?.stop();
      entry.avatar.container.setPosition(at.x, at.y);
      entry.avatar.container.setVisible(player.section === this.currentSection);
    });
  }

  private removeAvatar(sessionId: string) {
    const entry = this.avatars.get(sessionId);
    if (!entry) return;
    entry.tween?.stop();
    entry.avatar.destroy();
    this.avatars.delete(sessionId);
  }

  private flashMarker(tileX: number, tileY: number) {
    const world = this.map.tileCentre(tileX, tileY);
    this.marker.setPosition(world.x, world.y - 8).setAlpha(0.9);
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
    for (const sessionId of [...this.avatars.keys()]) this.removeAvatar(sessionId);
    this.hud.destroy();
    if (!this.departing) {
      this.departing = true;
      void this.room.leave();
    }
  }
}