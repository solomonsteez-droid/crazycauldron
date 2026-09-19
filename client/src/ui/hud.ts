import { findSection, shortenAddress } from "@crazycauldron/shared";
import { gameStore } from "../net/game.js";
import { clearUi, uiRoot } from "./overlay.js";

export interface HudData {
  displayName: string;
  wallet: string;
  players: number;
  hubMax: number;
  section: number;
  /** False until the first room state patch has been decoded. */
  roomReady: boolean;
}

/**
 * The status strip shown while in the world.
 *
 * Every figure on it comes from the server's last profile message - the HUD
 * renders state, it never computes it. The "next goal" line is part of the
 * strip rather than a panel because it is meant to be visible at all times.
 */
export class Hud {
  private readonly left = document.createElement("span");
  private readonly middle = document.createElement("span");
  private readonly right = document.createElement("span");
  private readonly goal = document.createElement("div");
  private readonly buff = document.createElement("div");
  private readonly bar = document.createElement("div");
  private readonly unsubscribe: () => void;

  constructor(private data: HudData) {
    clearUi();
    this.bar.className = "cc-hud";
    this.bar.append(this.left, this.middle, this.right);

    this.goal.className = "cc-goal";
    this.buff.className = "cc-buff";
    this.buff.hidden = true;
    uiRoot().append(this.bar, this.goal, this.buff);

    this.unsubscribe = gameStore.onChange(() => this.render());
    this.render();
  }

  update(patch: Partial<HudData>) {
    this.data = { ...this.data, ...patch };
    this.render();
  }

  destroy() {
    this.unsubscribe();
    this.bar.remove();
    this.goal.remove();
  }

  private render() {
    const profile = gameStore.profile;
    const place = this.data.section === 0 ? "the hub" : (findSection(this.data.section)?.name ?? "");

    this.left.textContent = `${this.data.displayName} · ${shortenAddress(this.data.wallet)}`;

    /*
     * Two separate things have to arrive before the strip is complete: the
     * replicated room state, and the profile message carrying coins and XP.
     * A bare "loading..." cannot say which is missing, so name it - and clear
     * the slot entirely once both are in rather than leaving a stale word.
     */
    if (profile) {
      this.middle.textContent = `Chef ${profile.chefLevel} · ${profile.coins} coins · bag ${profile.usedSlots}/${profile.carrySlots}`;
    } else if (!this.data.roomReady) {
      this.middle.textContent = "joining the room…";
    } else {
      this.middle.textContent = "waiting for your profile…";
    }
    this.middle.hidden = this.middle.textContent === "";

    const crowd = this.data.roomReady
      ? `${this.data.players}/${this.data.hubMax} in ${place}`
      : "connecting…";
    this.right.textContent = crowd;

    /*
     * The buff gets its own pill rather than a suffix on the crowd count. It is
     * a countdown the player acts on - eat again before it lapses - and mm:ss
     * in a fixed place is readable at a glance in a way a growing sentence is
     * not.
     */
    const seconds = gameStore.buffSeconds();
    this.buff.hidden = seconds <= 0;
    if (seconds > 0) {
      const minutes = Math.floor(seconds / 60);
      this.buff.textContent = `Well fed ${minutes}:${String(seconds % 60).padStart(2, "0")}`;
      // Warn in the last thirty seconds.
      this.buff.classList.toggle("cc-expiring", seconds <= 30);
    }

    const goal = profile?.nextGoal ?? null;
    this.goal.textContent = goal ? `Next goal: ${goal}` : "";
    this.goal.hidden = !goal;
  }
}
