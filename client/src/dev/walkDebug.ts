/**
 * A label over every character saying what its legs are doing.
 *
 * Development only, behind the D key, and compiled out of production builds
 * with the rest of `import.meta.env.DEV`. It exists because walk-animation
 * faults are the hardest kind to report: by the time you have described what
 * you saw, the character has taken three more steps. With this on, a
 * screenshot carries the animation key, which of the four drawings is on
 * screen, and the vector that chose them - which is usually enough to say
 * whether the bug is in the direction, the sheet, or the timing.
 *
 * Three lines per character:
 *
 *   male_walk_left f2          the animation Phaser is playing, and the frame
 *   v(-1,+0.5) tween           the vector in cells, and who chose it
 *   walking                    whether anything thinks this figure is moving
 */

import Phaser from "phaser";
import { PALETTE, hex } from "@crazycauldron/shared";
import type { Avatar } from "../world/avatar.js";

/** Where the vector driving the animation came from. */
export type VectorSource = "tween" | "intent" | "facing";

export interface DebugSubject {
  avatar: Avatar;
  /** The last vector a direction was picked from, in cells. */
  vector?: { dx: number; dy: number; source: VectorSource };
}

const STYLE = {
  fontFamily: "monospace",
  fontSize: "9px",
  color: hex(PALETTE.parchment),
  backgroundColor: "rgba(10,8,14,0.75)",
  padding: { x: 2, y: 1 },
  align: "center",
} as const;

export class WalkDebug {
  private on = false;
  private readonly labels = new Map<Avatar, Phaser.GameObjects.Text>();
  private readonly key?: Phaser.Input.Keyboard.Key;

  constructor(private readonly scene: Phaser.Scene) {
    this.key = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D, false);
    this.key?.on("down", () => this.toggle());
  }

  private toggle() {
    this.on = !this.on;
    if (!this.on) this.clear();
    console.info(`dev: walk debug ${this.on ? "on" : "off"} (D)`);
  }

  /**
   * Redraws every label.
   *
   * Called once a frame from the scene's update, and does nothing at all while
   * the overlay is off - a debug tool that costs frames is a debug tool that
   * changes what it is measuring.
   */
  update(subjects: Iterable<DebugSubject>): void {
    if (!this.on) return;

    const seen = new Set<Avatar>();
    for (const subject of subjects) {
      const { avatar } = subject;
      seen.add(avatar);

      const state = avatar.debugState();
      const vector = subject.vector;
      const arrow = vector
        ? `v(${sign(vector.dx)},${sign(vector.dy)}) ${vector.source}`
        : "v(-,-) still";

      let label = this.labels.get(avatar);
      if (!label) {
        label = this.scene.add.text(0, 0, "", STYLE).setOrigin(0.5, 1).setDepth(100_000);
        this.labels.set(avatar, label);
      }

      label.setText([
        `${state.animation} f${state.frame}`,
        arrow,
        state.walking ? "walking" : "idle",
      ]);

      /*
       * Positioned in world space rather than parented to the avatar: the
       * container's children are scaled and nudged by the idle bob, and a
       * debug readout that breathes is harder to read off a screenshot than
       * one that sits still.
       */
      const container = avatar.container;
      label.setPosition(container.x, container.y - 56);
      label.setVisible(container.visible);
    }

    // Anyone who left the room takes their label with them.
    for (const [avatar, label] of this.labels) {
      if (seen.has(avatar)) continue;
      label.destroy();
      this.labels.delete(avatar);
    }
  }

  private clear() {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }

  destroy(): void {
    this.key?.removeAllListeners();
    this.clear();
  }
}

/**
 * Always-signed and to one decimal, so a zero reads differently from a
 * positive, and a step still in progress reads differently from a whole one.
 */
function sign(n: number): string {
  const value = Math.abs(n) < 0.05 ? 0 : Number(n.toFixed(1));
  return value > 0 ? `+${value}` : String(value);
}
