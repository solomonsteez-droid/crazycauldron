/**
 * The things that move when nobody is playing.
 *
 * Smoke over the kitchen, leaves across the Meadows, fireflies in the Deep
 * Forest, motes in the Caves, and a twenty minute day turning over all of it.
 * None of it is gameplay: no particle here is ever read back, and the tint is
 * applied to the ground alone so nothing on top of it becomes harder to see.
 *
 * Every particle comes out of the same pool the cooking effects use and the
 * same 200-particle cap. Cooking wins ties by arriving second - `float` simply
 * returns false when the budget is spent, and a skipped firefly is invisible.
 */

import Phaser from "phaser";
import { CELL, HUB_MAP, areaFor, lifeFor, type LifeKind } from "@crazycauldron/shared";
import type { GameMap } from "../map/gameMap.js";
import { Effects, TEX_PUFF } from "./effects.js";
import { WorldMotion } from "./motion.js";

/** How often the ground colour is re-evaluated. A minute of day per second. */
const TINT_STEP_MS = 1000;

/** The most ambient particles alive at once, well under the shared cap. */
const AMBIENT_BUDGET = 60;

interface Spawn {
  x: number;
  y: number;
}

export class Ambience {
  private lifeTimer?: Phaser.Time.TimerEvent;
  private tintTimer?: Phaser.Time.TimerEvent;
  private alive = 0;

  /**
   * The painted world's own motion: grass, weather, water, lanterns, life.
   *
   * Kept here rather than in the scene because it is the same kind of thing as
   * the drifting leaves - decoration that follows the map - and it starts and
   * stops on the same call.
   */
  readonly motion: WorldMotion;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Effects,
  ) {
    this.motion = new WorldMotion(scene, fx);
  }

  /** Points the ambience at a map. Safe to call on every travel. */
  start(map: GameMap) {
    this.stop();

    const area = areaFor(map.mapId);
    this.motion.start(map, area.cols, area.rows);

    const life = lifeFor(map.mapId);
    if (life && life.everyMs > 0) {
      const colour = Phaser.Display.Color.HexStringToColor(life.colour).color;
      this.lifeTimer = this.scene.time.addEvent({
        delay: life.everyMs,
        loop: true,
        callback: () => this.emit(life.kind, colour, map),
      });
    }

    this.tintTimer = this.scene.time.addEvent({
      delay: TINT_STEP_MS,
      loop: true,
      callback: () => map.applyDaylight(),
    });
    map.applyDaylight();
  }

  /** One frame of the persistent motion. Called from the scene's update. */
  tick(now: number) {
    this.motion.tick(now);
  }

  /** A gather node shaking when it is harvested. */
  rustle(x: number, y: number) {
    this.motion.rustle(x, y);
  }

  stop() {
    this.motion.stop();
    this.lifeTimer?.remove();
    this.lifeTimer = undefined as unknown as Phaser.Time.TimerEvent;
    this.tintTimer?.remove();
    this.tintTimer = undefined as unknown as Phaser.Time.TimerEvent;
  }

  // --- emitters -------------------------------------------------------------

  private emit(kind: LifeKind, colour: number, map: GameMap) {
    if (this.alive >= AMBIENT_BUDGET) return;

    const spawned =
      kind === "smoke"
        ? this.smoke(colour, map)
        : kind === "leaves"
          ? this.leaf(colour)
          : kind === "fireflies"
            ? this.firefly(colour)
            : this.mote(colour);

    if (spawned) this.countOne();
  }

  /**
   * The ambient particles are counted separately from the pool's own budget so
   * ambience can never crowd out feedback. The count is released on the same
   * schedule the particle is, which is a timer rather than a callback because
   * `float` owns the tween.
   */
  private countOne() {
    this.alive += 1;
    this.scene.time.delayedCall(4000, () => {
      this.alive = Math.max(0, this.alive - 1);
    });
  }

  /** A puff from the kitchen chimney. Slow, grey, and always in the same place. */
  private smoke(colour: number, map: GameMap): boolean {
    if (map.mapId !== HUB_MAP) return false;
    const kitchen = map.features.find((f) => f.id === "kitchen");
    if (!kitchen) return false;

    const at = map.tileCentre(kitchen.tile.tileX, kitchen.tile.tileY);
    return this.fx.float({
      x: at.x + Phaser.Math.Between(-2, 2),
      // The chimney, not the doorway. The zone's centre is the middle of the
      // painted oven, and its stack rises about three cells above that.
      y: at.y - CELL * 3,
      dx: Phaser.Math.Between(-10, 16),
      dy: -Phaser.Math.Between(26, 44),
      colour,
      durationMs: Phaser.Math.Between(2200, 3400),
      scale: Phaser.Math.FloatBetween(0.6, 1.1),
      alpha: 0.45,
      texture: TEX_PUFF,
      depth: kitchen.tile.tileX + kitchen.tile.tileY + 2,
    });
  }

  /** A leaf tumbling across the view, front to back. */
  private leaf(colour: number): boolean {
    const at = this.spawnInView(0.15);
    return this.fx.float({
      x: at.x,
      y: at.y,
      dx: Phaser.Math.Between(40, 90),
      dy: Phaser.Math.Between(30, 70),
      colour,
      durationMs: Phaser.Math.Between(3200, 5200),
      scale: Phaser.Math.FloatBetween(0.8, 1.4),
      alpha: 0.7,
      spin: Phaser.Math.Between(180, 540),
      texture: TEX_PUFF,
    });
  }

  /** A firefly: fades in, drifts a short way, fades out. */
  private firefly(colour: number): boolean {
    const at = this.spawnInView(0);
    return this.fx.float({
      x: at.x,
      y: at.y,
      dx: Phaser.Math.Between(-24, 24),
      dy: Phaser.Math.Between(-18, 6),
      colour,
      durationMs: Phaser.Math.Between(1400, 2400),
      scale: Phaser.Math.FloatBetween(1, 1.8),
      alpha: 0.9,
      fadeIn: true,
    });
  }

  /** A cave mote, rising almost straight up and very slowly. */
  private mote(colour: number): boolean {
    const at = this.spawnInView(0);
    return this.fx.float({
      x: at.x,
      y: at.y,
      dx: Phaser.Math.Between(-8, 8),
      dy: -Phaser.Math.Between(30, 60),
      colour,
      durationMs: Phaser.Math.Between(2600, 4200),
      scale: Phaser.Math.FloatBetween(0.8, 1.5),
      alpha: 0.65,
      fadeIn: true,
    });
  }

  /**
   * A point inside what the camera can currently see.
   *
   * `topBias` lifts the spawn band above the view for things that fall into it,
   * so a leaf drifts in from off-screen rather than appearing out of nowhere in
   * the middle of the meadow.
   */
  private spawnInView(topBias: number): Spawn {
    const view = this.scene.cameras.main.worldView;
    const lift = view.height * topBias;
    return {
      x: Phaser.Math.Between(view.left, view.right),
      y: Phaser.Math.Between(view.top - lift, view.bottom - CELL),
    };
  }
}
