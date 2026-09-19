import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  HUB_MAP,
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  MOVE_STEP_MS,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_KICK,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_TRAVEL,
  findSection,
  isAdjacentOrOn,
  isWalkableOn,
  type GatherResultPayload,
  type GatherStartedPayload,
  type MoveIntent,
  type NodesPayload,
  type ProfilePayload,
  type RejectedPayload,
  type TilePos,
} from "@crazycauldron/shared";
import { fetchCapacity } from "../net/api.js";
import { gameStore } from "../net/game.js";
import { GameMap, type MapFeature } from "../map/gameMap.js";
import { TEX_MARKER, TEX_PLAYER_BACK, TEX_PLAYER_FRONT } from "../map/textures.js";
import type { HubStateView, KickNotice, PlayerView } from "../net/state.js";
import { clearSession, type Session } from "../net/session.js";
import { Hud } from "../ui/hud.js";
import { showPanel, showProgress, toast, type ProgressHandle } from "../ui/overlay.js";
import { SCENE_HUB, SCENE_LOGIN } from "./keys.js";

interface HubSceneData {
  room: Room<HubStateView>;
  session: Session;
}

interface Avatar {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  tween?: Phaser.Tweens.Tween;
}

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
  private readonly avatars = new Map<string, Avatar>();
  private departing = false;
  private currentSection = HUB_MAP;
  private pending: PendingAction | null = null;
  private progress: ProgressHandle | null = null;
  private cooldownTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super(SCENE_HUB);
  }

  create(data: HubSceneData) {
    this.room = data.room;
    this.session = data.session;
    this.departing = false;
    this.pending = null;
    this.currentSection = HUB_MAP;

    this.cameras.main.setBackgroundColor("#101a14");
    this.buildMap(HUB_MAP);

    this.marker = this.add.image(0, 0, TEX_MARKER).setOrigin(0.5, 0).setAlpha(0).setDepth(9999);

    this.hud = new Hud({
      displayName: this.session.displayName,
      wallet: this.session.wallet,
      players: 0,
      hubMax: 0,
      section: HUB_MAP,
    });

    void fetchCapacity()
      .then((capacity) => this.hud.update({ hubMax: capacity.hubMax }))
      .catch(() => undefined);

    this.bindState();
    this.bindInput();
    this.bindRoomEvents();

    // Node cooldowns tick down locally off the server's readyAt timestamps;
    // nothing is decided here, it is only redrawn.
    this.cooldownTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.refreshNodes(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private buildMap(mapId: number) {
    this.map?.destroy();
    this.map = new GameMap(this, mapId);
    this.map.applyCameraBounds();
    this.currentSection = mapId;
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

  /** Only players standing on the same map are drawn. */
  private refreshCrowd() {
    let here = 0;
    this.room.state.players.forEach((player) => {
      if (player.section === this.currentSection) here += 1;
    });
    this.hud.update({ players: here, section: this.currentSection });
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
      // Stations get their panels in the UI pass; walking to them still works.
      this.walkAdjacentTo(feature.tile);
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

  /** Redraws node sprites from whatever the server last said about them. */
  private refreshNodes() {
    if (this.currentSection === HUB_MAP) return;
    for (const node of gameStore.nodes(this.currentSection)) {
      this.map.setNodeReady(node.id, node.readyAt === 0, node.available);
    }
  }

  private addAvatar(player: PlayerView, sessionId: string) {
    const position = this.map.tileCentre(player.tileX, player.tileY);
    const isSelf = player.wallet === this.session.wallet;

    const sprite = this.add.image(0, 0, TEX_PLAYER_FRONT).setOrigin(0.5, 1);
    const label = this.add
      .text(0, -26, player.displayName, {
        fontFamily: "monospace",
        fontSize: "8px",
        color: isSelf ? "#7ce08a" : "#f3e9d2",
      })
      .setOrigin(0.5, 1)
      .setResolution(3);

    const container = this.add.container(position.x, position.y, [sprite, label]);
    container.setDepth(player.tileX + player.tileY);
    container.setVisible(player.section === this.currentSection);

    const avatar: Avatar = { container, sprite };
    this.avatars.set(sessionId, avatar);
    this.applyFacing(avatar, player.facing);

    player.onChange(() => this.onPlayerChanged(sessionId, player));

    if (isSelf) this.cameras.main.startFollow(container, true, 0.12, 0.12);
  }

  private onPlayerChanged(sessionId: string, player: PlayerView) {
    const avatar = this.avatars.get(sessionId);
    if (!avatar) return;

    const isSelf = player.wallet === this.session.wallet;

    // Our own section change means a new map; everyone else's just means they
    // walked out of view.
    if (isSelf && player.section !== this.currentSection) {
      this.buildMap(player.section);
      this.rebuildAvatarsForMap();
      this.cameras.main.startFollow(avatar.container, true, 0.12, 0.12);
      this.refreshCrowd();
      const section = findSection(player.section);
      toast(section ? `Entered ${section.name}.` : "Back in the hub.");
    }

    avatar.container.setVisible(player.section === this.currentSection);
    this.applyFacing(avatar, player.facing);

    const target = this.map.tileCentre(player.tileX, player.tileY);
    if (avatar.container.x !== target.x || avatar.container.y !== target.y) {
      avatar.tween?.stop();
      avatar.tween = this.tweens.add({
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
    if (isSelf) this.refreshCrowd();
  }

  private rebuildAvatarsForMap() {
    this.room.state.players.forEach((player, sessionId) => {
      const avatar = this.avatars.get(sessionId);
      if (!avatar) return;
      const at = this.map.tileCentre(player.tileX, player.tileY);
      avatar.tween?.stop();
      avatar.container.setPosition(at.x, at.y);
      avatar.container.setVisible(player.section === this.currentSection);
    });
  }

  private applyFacing(avatar: Avatar, facing: string) {
    const away = facing === "n" || facing === "e";
    avatar.sprite.setTexture(away ? TEX_PLAYER_BACK : TEX_PLAYER_FRONT);
    avatar.sprite.setFlipX(facing === "e" || facing === "w");
  }

  private removeAvatar(sessionId: string) {
    const avatar = this.avatars.get(sessionId);
    if (!avatar) return;
    avatar.tween?.stop();
    avatar.container.destroy(true);
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
    for (const sessionId of [...this.avatars.keys()]) this.removeAvatar(sessionId);
    this.hud.destroy();
    if (!this.departing) {
      this.departing = true;
      void this.room.leave();
    }
  }
}