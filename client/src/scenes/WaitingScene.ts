import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { MSG_ADMIT, MSG_QUEUE, type EnterResponse } from "@crazycauldron/shared";
import { consumeReservation } from "../net/room.js";
import type { QueueUpdate, WaitingStateView } from "../net/state.js";
import type { Session } from "../net/session.js";
import { showPanel, toast, type PanelHandle } from "../ui/overlay.js";
import { SCENE_HUB, SCENE_LOGIN, SCENE_WAITING } from "./keys.js";

interface WaitingSceneData {
  room: Room<WaitingStateView>;
  session: Session;
}

/**
 * The overflow queue. Nothing is polled: the server pushes MSG_QUEUE as places
 * shift and MSG_ADMIT - carrying a ready-made hub reservation - the moment a
 * seat frees up, so this scene only has to redeem it.
 */
export class WaitingScene extends Phaser.Scene {
  private room!: Room<WaitingStateView>;
  private session!: Session;
  private panel!: PanelHandle;
  private departing = false;

  constructor() {
    super(SCENE_WAITING);
  }

  create(data: WaitingSceneData) {
    this.room = data.room;
    this.session = data.session;
    this.departing = false;

    this.cameras.main.setBackgroundColor("#14101a");
    this.panel = showPanel({
      title: "The cauldron is full",
      body: "You are in the queue. The hub will let you in as soon as a seat opens.",
      actions: [{ label: "Leave the queue", secondary: true, onClick: () => this.leaveQueue() }],
    });

    this.room.onMessage(MSG_QUEUE, (update: QueueUpdate) => this.renderPlace(update));
    this.room.onMessage(MSG_ADMIT, (payload: EnterResponse) => void this.admit(payload));

    this.room.onLeave(() => {
      if (this.departing) return;
      this.departing = true;
      this.scene.start(SCENE_LOGIN, { error: "You were disconnected from the queue." });
    });

    this.room.onError((code, message) => toast(message ?? `Queue error (${code}).`, "bad"));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.departing) return;
      this.departing = true;
      void this.room.leave();
    });
  }

  private renderPlace(update: QueueUpdate) {
    const place = update.place > 0 ? update.place : 1;
    this.panel.setBody(
      place === 1
        ? "You are next in line."
        : `You are number ${place} of ${update.waiting} in the queue.`,
    );
    this.panel.setMeta(
      `${this.room.state.hubPlayers} of ${this.room.state.globalMax} wizards are in the cauldron.`,
    );
  }

  /** A pushed reservation: consume it, then hand the room to the hub scene. */
  private async admit(payload: EnterResponse) {
    this.panel.setBusy(true);
    this.panel.setBody("A seat opened \u2014 stepping in\u2026");

    try {
      const hub = await consumeReservation(payload.reservation);
      // Leave the queue only once the hub seat is actually held, so a failure
      // here keeps the player queued instead of dropping them entirely.
      this.departing = true;
      await this.room.leave();
      this.scene.start(SCENE_HUB, { room: hub, session: this.session });
    } catch (err) {
      this.departing = false;
      this.panel.setBusy(false);
      this.panel.setError(
        (err as Error)?.message ?? "That seat slipped away. Staying in the queue.",
      );
    }
  }

  private async leaveQueue() {
    this.departing = true;
    await this.room.leave();
    this.scene.start(SCENE_LOGIN);
  }
}
