/**
 * A companion: one sprite that walks with a player.
 *
 * Scaffolding. Nothing grants one yet - the slot is replicated, and in
 * development `cc.companion("id")` puts one on your own character - but the
 * following itself is the part with the behaviour in it, so it is written and
 * watchable now rather than sketched and discovered later.
 *
 * Three things make a follower read as alive rather than as a second cursor:
 *
 * - It trails behind and to the left of where its player is facing, so it is
 *   out of the way of the character and out of the way of the click that
 *   moves them.
 * - It chases that spot rather than occupying it. A companion pinned to an
 *   offset is a sticker on the screen; one that lags and catches up is a
 *   creature keeping pace.
 * - It bobs a single pixel, on the same whole-pixel rule as everything else
 *   here, because a sub-pixel wobble at this size reads as blur.
 *
 * Position is not replicated and never needs to be: the companion is entirely
 * derived from its player's position and facing, so every client draws it in
 * the same place without a byte on the wire.
 */

import Phaser from "phaser";
import { CELL } from "@crazycauldron/shared";
import { companionKey } from "../art/assets.js";
import type { Direction } from "../art/manifest.js";

/**
 * How far behind and to the left the companion aims for, in cells.
 *
 * One cell away along the diagonal: the two components are the diagonal's
 * legs, so the offset is a cell's length rather than a cell in each axis,
 * which would put the companion a cell and a half away and reading as a
 * separate character rather than as company.
 */
const FOLLOW_CELLS = 1;
const DIAGONAL = Math.SQRT1_2;

/**
 * How hard it chases, per frame at 60fps.
 *
 * Low enough to lag visibly when its player sets off, high enough to have
 * caught up by the end of a step. Applied frame-rate independently below, so
 * a slow machine gets the same motion rather than a slower companion.
 */
const CHASE_PER_FRAME = 0.15;

/** A slow rise and fall, in milliseconds. */
const BOB_MS = 900;

/** Which way is "behind" and which is "left", per facing. */
const BEHIND: Record<Direction, { x: number; y: number }> = {
  down: { x: 0, y: -1 },
  up: { x: 0, y: 1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
};
const LEFT: Record<Direction, { x: number; y: number }> = {
  down: { x: 1, y: 0 },
  up: { x: -1, y: 0 },
  left: { x: 0, y: -1 },
  right: { x: 0, y: 1 },
};

export class Companion {
  private readonly sprite: Phaser.GameObjects.Image;
  private id = "";
  /** False for an id with no art, which draws nothing at all. */
  private known = false;
  /** Where it is heading, in world pixels. Chased rather than jumped to. */
  private targetX = 0;
  private targetY = 0;
  /** Random per companion so a crowd of them does not bob in unison. */
  private readonly phase = Math.random() * BOB_MS;

  constructor(private readonly scene: Phaser.Scene) {
    this.sprite = scene.add
      .image(0, 0, "__MISSING")
      // Feet at the origin, like the characters, so depth and ground line up.
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  /** Swaps which creature this is, or hides it entirely with an empty id. */
  setCompanion(id: string) {
    if (id === this.id) return;
    this.id = id;

    const texture = companionKey(id);
    /*
     * An unknown id draws nothing rather than a placeholder. A companion is
     * decoration: a missing one should be absent, not a lettered box following
     * somebody around.
     */
    this.known = Boolean(id) && this.scene.textures.exists(texture);
    if (this.known) this.sprite.setTexture(texture);
    this.sprite.setVisible(this.known);
  }

  get gameObject(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  get active(): boolean {
    return this.sprite.visible;
  }

  /** Drops it at its mark with no chase, for a spawn or a change of map. */
  snapTo(x: number, y: number, facing: Direction) {
    const mark = this.mark(x, y, facing);
    this.targetX = mark.x;
    this.targetY = mark.y;
    this.sprite.setPosition(mark.x, mark.y);
  }

  /**
   * Moves it one frame's worth towards where it should be.
   *
   * `delta` rather than a fixed step, so the chase covers the same ground per
   * second whether the machine is drawing 30 frames or 144.
   */
  follow(x: number, y: number, facing: Direction, depth: number, now: number, delta: number) {
    if (!this.sprite.visible) return;

    const mark = this.mark(x, y, facing);
    this.targetX = mark.x;
    this.targetY = mark.y;

    // (1 - k)^frames, so the same fraction of the remaining gap closes per
    // second at any frame rate.
    const chase = 1 - Math.pow(1 - CHASE_PER_FRAME, delta / (1000 / 60));
    const px = Phaser.Math.Linear(this.sprite.x, this.targetX, chase);
    const py = Phaser.Math.Linear(this.sprite.y, this.targetY, chase);

    const bob = ((now + this.phase) % BOB_MS) / BOB_MS < 0.5 ? -1 : 0;

    // Whole pixels: this is pixel art, and half a pixel of a 16px creature is
    // a blurred edge rather than a smaller step.
    this.sprite.setPosition(Math.round(px), Math.round(py) + bob);
    // Behind its player, so the two overlapping reads as the player in front.
    this.sprite.setDepth(depth - 1);
  }

  /** Where it wants to be: one cell behind and to the left of its player. */
  private mark(x: number, y: number, facing: Direction): { x: number; y: number } {
    const behind = BEHIND[facing];
    const left = LEFT[facing];
    const distance = FOLLOW_CELLS * CELL * DIAGONAL;
    return {
      x: x + (behind.x + left.x) * distance,
      y: y + (behind.y + left.y) * distance,
    };
  }

  /** Hidden with its player when they walk onto another map. */
  setVisible(visible: boolean) {
    this.sprite.setVisible(visible && this.known);
  }

  destroy() {
    this.sprite.destroy();
  }
}
