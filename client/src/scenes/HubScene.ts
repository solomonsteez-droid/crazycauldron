import Phaser from "phaser";
import type { Room } from "colyseus.js";
import {
  KICK_AUTH_EXPIRED,
  KICK_INSUFFICIENT_HOLD,
  MOVE_STEP_MS,
  MSG_KICK,
  MSG_MOVE,
  type MoveIntent,
} from "@crazycauldron/shared";
import { fetchCapacity } from "../net/api.js";
import { HubMap } from "../map/hubMap.js";
import { TEX_MARKER, TEX_PLAYER_BACK, TEX_PLAYER_FRONT } from "../map/textures.js";
import type { HubStateView, KickNotice, PlayerView } from "../net/state.js";
import { clearSession, type Session } from "../net/session.js";
import { Hud } from "../ui/hud.js";
import { showPanel, toast } from "../ui/overlay.js";
import { SCENE_HUB, SCENE_LOGIN } from "./keys.js";

interface HubSceneData {
  room: Room<HubStateView>;
  session: Session;
}

/** One player's on-screen representation: token plus name label. */
interface Avatar {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  tween?: Phaser.Tweens.Tween;
}

/**
 * The hub. The scene is a pure view of replicated state: a click sends a
 * destination and nothing moves until the server says a tile changed. That
 * costs one round trip of responsiveness and buys a client that cannot cheat
 * its own position.
 */
export class HubScene extends Phaser.Scene {
  private room!: Room<HubStateView>;
  private session!: Session;
  private map!: HubMap;
  private hud!: Hud;
  private marker!: Phaser.GameObjects.Image;
  private readonly avatars = new Map<string, Avatar>();
  /** Set when we are deliberately tearing down, so onLeave stays quiet. */
  private departing = false;

  constructor() {
    super(SCENE_HUB);
  }

  create(data: HubSceneData) {
    this.room = data.room;
    this.session = data.session;
    this.departing = false;

    this.cameras.main.setBackgroundColor("#101a14");
    this.map = new HubMap(this);
    this.map.applyCameraBounds();
    this.cameras.main.centerOn(this.map.centreOfMap.x, this.map.centreOfMap.y);
    this.cameras.main.setZoom(2);

    this.marker = this.add.image(0, 0, TEX_MARKER).setOrigin(0.5, 0).setAlpha(0).setDepth(9999);

    this.hud = new Hud({
      displayName: this.session.displayName,
      wallet: this.session.wallet,
      players: 0,
      hubMax: 0,
    });

    // The per-hub cap is server configuration, so ask rather than assume it.
    void fetchCapacity()
      .then((capacity) => this.hud.update({ hubMax: capacity.hubMax }))
      .catch(() => undefined);

    this.bindState();
    this.bindInput();
    this.bindRoomEvents();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  private bindState() {
    // triggerAll: the state has usually arrived before create() runs, so the
    // players already present must be replayed rather than waited for.
    this.room.state.players.onAdd((player, sessionId) => {
      this.addAvatar(player, sessionId);
      this.hud.update({ players: this.room.state.players.size });
    }, true);

    this.room.state.players.onRemove((_player, sessionId) => {
      this.removeAvatar(sessionId);
      this.hud.update({ players: this.room.state.players.size });
    });
  }

  private bindInput() {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const tile = this.map.tileAt(pointer.worldX, pointer.worldY);
      if (!tile) return;

      const intent: MoveIntent = tile;
      this.room.send(MSG_MOVE, intent);
      this.flashMarker(tile.tileX, tile.tileY);
    });
  }

  private bindRoomEvents() {
    this.room.onMessage(MSG_KICK, (notice: KickNotice) => this.onKicked(notice));

    this.room.onLeave(() => {
      if (this.departing) return;
      this.departing = true;
      this.scene.start(SCENE_LOGIN, { error: "You were disconnected from the hub." });
    });

    this.room.onError((code, message) => {
      toast(message ?? `Connection error (${code}).`, "bad");
    });
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

    const avatar: Avatar = { container, sprite };
    this.avatars.set(sessionId, avatar);
    this.applyFacing(avatar, player.facing);

    player.onChange(() => this.onPlayerChanged(sessionId, player));

    if (isSelf) {
      // Lerp rather than snap: the server moves players a whole tile at a time.
      this.cameras.main.startFollow(container, true, 0.12, 0.12);
    }
  }

  private onPlayerChanged(sessionId: string, player: PlayerView) {
    const avatar = this.avatars.get(sessionId);
    if (!avatar) return;

    this.applyFacing(avatar, player.facing);

    const target = this.map.tileCentre(player.tileX, player.tileY);
    if (avatar.container.x === target.x && avatar.container.y === target.y) return;

    // Slide across the tile in the same time the server takes to step it, so
    // the animation and the simulation stay in lockstep.
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

  /** Four facings out of two textures: the back view mirrored, and the front. */
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

    // Either reason means the stored token is no longer good for anything.
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
    for (const sessionId of [...this.avatars.keys()]) this.removeAvatar(sessionId);
    this.hud.destroy();
    if (!this.departing) {
      this.departing = true;
      void this.room.leave();
    }
  }
}
