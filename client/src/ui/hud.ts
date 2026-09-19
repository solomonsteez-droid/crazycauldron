import { findSection, shortenAddress } from "@crazycauldron/shared";
import { gameStore } from "../net/game.js";
import { clearUi, uiRoot } from "./overlay.js";

export interface HudData {
  displayName: string;
  wallet: string;
  players: number;
  hubMax: number;
  section: number;
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
  private readonly bar = document.createElement("div");
  private readonly unsubscribe: () => void;

  constructor(private data: HudData) {
    clearUi();
    this.bar.className = "cc-hud";
    this.bar.append(this.left, this.middle, this.right);

    this.goal.className = "cc-goal";
    uiRoot().append(this.bar, this.goal);

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

    this.middle.textContent = profile
      ? `Chef ${profile.chefLevel} · ${profile.coins} coins · bag ${profile.usedSlots}/${profile.carrySlots}`
      : "loading…";

    const buff = gameStore.buffSeconds();
    const crowd = `${this.data.players}/${this.data.hubMax} in ${place}`;
    this.right.textContent = buff > 0 ? `${crowd} · well fed ${buff}s` : crowd;

    const goal = profile?.nextGoal ?? null;
    this.goal.textContent = goal ? `Next goal: ${goal}` : "";
    this.goal.hidden = !goal;
  }
}
