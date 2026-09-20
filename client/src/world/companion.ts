/**
 * A companion: one sprite that walks with a player.
 *
 * Everything it does is derived from the player it follows - position, facing,
 * whether they are cooking - so nothing about it goes on the wire beyond the
 * id in room state, and every client draws it in the same place.
 *
 * Four behaviours, and each exists because of a way a follower reads wrong
 * without it:
 *
 * - It chases its mark rather than occupying it. Pinned to an offset it is a
 *   sticker on the screen; lagging and catching up, it is a creature keeping
 *   pace.
 * - It faces the way it is going. A pet that moons across the map backwards is
 *   the first thing anybody notices.
 * - It bobs, and now and then it hops. A perfectly still sprite beside a
 *   breathing character reads as a dropped frame rather than as an animal.
 * - It gets out of the way while its player cooks, and waits by the kitchen.
 *   Standing on the pan during the heat bar is the one moment it would be in
 *   the way of something that matters.
 *
 * It is never interactive, so it can never eat a click meant for the ground
 * beneath it - the pick helpers in the scene do not know it exists, and this
 * sprite is never given an input handler.
 */

import Phaser from "phaser";
import { CELL } from "@crazycauldron/shared";
import { companionKey } from "../art/assets.js";
import type { Direction } from "../art/manifest.js";

/**
 * How far behind and to the left the companion aims for, in cells.
 *
 * One cell away along the diagonal: the components are the diagonal's legs, so
 * the offset is a cell's length rather than a cell in each axis, which would
 * put it a cell and a half away and reading as a separate character rather
 * than as company.
 */
const FOLLOW_CELLS = 1;
const DIAGONAL = Math.SQRT1_2;

/**
 * How hard it chases, per frame at 60fps.
 *
 * Low enough to lag visibly when its player sets off, high enough to have
 * caught up by the end of a step. Applied frame-rate independently below, so a
 * slow machine gets the same motion rather than a slower companion.
 */
const CHASE_PER_FRAME = 0.15;

/** A slow rise and fall while it stands about. */
const BOB_MS = 2000;

/** How far apart the hops are, and how long one takes. */
const HOP_MIN_MS = 8000;
const HOP_MAX_MS = 15000;
const HOP_MS = 420;
/** Whole pixels, like everything else at this size. */
const HOP_HEIGHT = 4;

/**
 * Below this, it is standing still.
 *
 * Measured per frame rather than per second, and generous: the chase is
 * asymptotic, so a companion that has arrived still creeps a fraction of a
 * pixel for a while afterwards, and flipping on that would make it twitch.
 */
const MOVING_PX = 0.35;

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
  private hopStartedAt = 0;
  private nextHopAt = 0;

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
   *
   * `waitAt` is where it should go instead of following - the kitchen, while
   * its player is cooking there.
   */
  follow(
    x: number,
    y: number,
    facing: Direction,
    playerDepth: number,
    now: number,
    delta: number,
    waitAt: { x: number; y: number } | null = null,
  ) {
    if (!this.sprite.visible) return;

    const mark = waitAt ? this.beside(waitAt) : this.mark(x, y, facing);
    this.targetX = mark.x;
    this.targetY = mark.y;

    // (1 - k)^frames, so the same fraction of the remaining gap closes per
    // second at any frame rate.
    const chase = 1 - Math.pow(1 - CHASE_PER_FRAME, delta / (1000 / 60));
    const nextX = Phaser.Math.Linear(this.sprite.x, this.targetX, chase);
    const nextY = Phaser.Math.Linear(this.sprite.y, this.targetY, chase);

    const movedX = nextX - this.sprite.x;
    const moving = Math.abs(movedX) + Math.abs(nextY - this.sprite.y) > MOVING_PX;

    /*
     * Facing follows travel, and only while travelling. Reading the flip from
     * the player's facing instead would spin the companion on the spot every
     * time its player turned around, which is not what an animal does.
     */
    if (moving && Math.abs(movedX) > MOVING_PX / 2) this.sprite.setFlipX(movedX < 0);

    // Whole pixels: this is pixel art, and half a pixel of a 16px creature is
    // a blurred edge rather than a smaller step.
    this.sprite.setPosition(Math.round(nextX), Math.round(nextY) + this.lift(now, moving));

    /*
     * Behind its player when it is above them, in front when below - the same
     * rule the rest of the world is sorted by, so a companion standing north
     * of somebody is occluded by them and one standing south is not.
     */
    this.sprite.setDepth(playerDepth + (this.sprite.y <= y ? -1 : 1));
  }

  /**
   * The vertical offset this frame: a hop if one is running, otherwise a bob.
   *
   * Both are whole pixels. A hop while walking would fight the chase, so it
   * only happens standing still - and the timer is reset while moving, so a
   * companion that has been following for a minute does not hop the instant
   * it stops.
   */
  private lift(now: number, moving: boolean): number {
    if (moving) {
      this.hopStartedAt = 0;
      this.nextHopAt = now + HOP_MIN_MS + Math.random() * (HOP_MAX_MS - HOP_MIN_MS);
      return 0;
    }

    if (this.nextHopAt === 0) {
      // First call: seed the timer rather than hopping immediately.
      this.nextHopAt = now + HOP_MIN_MS + Math.random() * (HOP_MAX_MS - HOP_MIN_MS);
    }

    if (this.hopStartedAt === 0 && now >= this.nextHopAt) this.hopStartedAt = now;

    if (this.hopStartedAt > 0) {
      const t = (now - this.hopStartedAt) / HOP_MS;
      if (t >= 1) {
        this.hopStartedAt = 0;
        this.nextHopAt = now + HOP_MIN_MS + Math.random() * (HOP_MAX_MS - HOP_MIN_MS);
      } else {
        // A parabola: up and down once, landing exactly where it started.
        return -Math.round(HOP_HEIGHT * 4 * t * (1 - t));
      }
    }

    return ((now + this.phase) % BOB_MS) / BOB_MS < 0.5 ? -1 : 0;
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

  /** A spot beside something, on its left, for waiting at the kitchen. */
  private beside(at: { x: number; y: number }): { x: number; y: number } {
    return { x: at.x - CELL, y: at.y + Math.round(CELL / 2) };
  }

  /** Hidden with its player when they walk onto another map. */
  setVisible(visible: boolean) {
    this.sprite.setVisible(visible && this.known);
  }

  destroy() {
    this.sprite.destroy();
  }
}
