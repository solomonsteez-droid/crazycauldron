import { shortenAddress } from "@crazycauldron/shared";
import { clearUi, uiRoot } from "./overlay.js";

export interface HudData {
  displayName: string;
  wallet: string;
  players: number;
  hubMax: number;
}

/** The thin strip of status text shown while in the hub. */
export class Hud {
  private readonly left = document.createElement("span");
  private readonly right = document.createElement("span");
  private readonly bar = document.createElement("div");

  constructor(private data: HudData) {
    clearUi();
    this.bar.className = "cc-hud";
    this.bar.append(this.left, this.right);
    uiRoot().append(this.bar);
    this.render();
  }

  update(patch: Partial<HudData>) {
    this.data = { ...this.data, ...patch };
    this.render();
  }

  destroy() {
    this.bar.remove();
  }

  private render() {
    this.left.textContent = `${this.data.displayName} · ${shortenAddress(this.data.wallet)}`;
    this.right.textContent = `${this.data.players}/${this.data.hubMax} in this hub`;
  }
}
