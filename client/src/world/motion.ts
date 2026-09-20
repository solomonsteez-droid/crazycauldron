/**
 * The painted world, moving.
 *
 * Four paintings that were completely still, given weather and life: grass
 * that leans in a wave, smoke leaning the same way at the same moment, water
 * that catches the light, lanterns that flicker harder after dark, butterflies
 * over the flowers and birds across the sky.
 *
 * Two rules shape the whole file.
 *
 * **One wind.** The grass sway and the smoke drift read the same function of
 * time. A field that ripples while a chimney trails straight up is two effects;
 * the same value in both is weather. `wind()` is that value, and it sweeps the
 * map rather than applying everywhere at once, so the gust arrives at the far
 * hedge a second after the near one.
 *
 * **One budget.** Everything here comes out of the same 200-particle pool the
 * cooking effects use. The persistent pieces - tufts, shimmer, glows - take a
 * reservation up front and hold it; the transient ones ask `float` and accept
 * no for an answer. A dropped butterfly is invisible. A dropped frame is not.
 *
 * Grass is placed by sampling the painting rather than from a list: the map is
 * drawn once into a 42x24 canvas, and a cell whose average colour is green
 * gets tufts in that cell's own colour. No anchor list to maintain, and the
 * tufts cannot drift out of step with art that has been repainted.
 */

import Phaser from "phaser";
import {
  CELL,
  WIND,
  anchorsFor,
  nightFactor,
  type CellRef,
  type MapAnchors,
} from "@crazycauldron/shared";
import type { GameMap } from "../map/gameMap.js";
import { Effects, TEX_PUFF } from "./effects.js";
import {
  edgeWeight,
  glowPose,
  isGrassColour,
  lighten,
  shaftAlpha,
  shimmerPose,
  tuftPose,
  windAt,
} from "./motionMath.js";

// --------------------------------------------------------------------------
// Budget
// --------------------------------------------------------------------------

/**
 * How many long-lived sprites the world motion may hold.
 *
 * Reserved from the shared pool, so the transient effects and cooking see a
 * smaller ceiling rather than competing for the same slots and losing
 * unpredictably. Tuned so that the two together sit comfortably inside 200.
 */
const MAX_TUFTS = 44;
const MAX_SHIMMER = 14;
const MAX_GLOWS = 14;
const MAX_SHAFTS = 1;
const RESERVED = MAX_TUFTS + MAX_SHIMMER + MAX_GLOWS + MAX_SHAFTS;

// --------------------------------------------------------------------------
// Textures
// --------------------------------------------------------------------------

const TEX_TUFT_A = "wm-tuft-a";
const TEX_TUFT_B = "wm-tuft-b";
const TEX_GLOW_SOFT = "wm-glow";
const TEX_SHAFT = "wm-shaft";
const TEX_WING = "wm-wing";

/**
 * Two frames of grass and three soft shapes, drawn once.
 *
 * The tufts are deliberately tiny and asymmetric: at this size a symmetric
 * tuft reads as a cross, and the whole effect depends on a silhouette that
 * looks different when it leans.
 */
function createMotionTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX_TUFT_A)) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    // Upright: three blades, the middle one tallest.
    g.fillRect(2, 2, 1, 5);
    g.fillRect(4, 0, 1, 7);
    g.fillRect(6, 3, 1, 4);
    g.fillRect(2, 6, 5, 1);
    g.generateTexture(TEX_TUFT_A, 8, 8);
    g.clear();

    // Leaning: the same blades bent to one side, tips further over than roots.
    g.fillStyle(0xffffff, 1);
    g.fillRect(2, 3, 1, 4);
    g.fillRect(3, 2, 1, 1);
    g.fillRect(4, 1, 1, 6);
    g.fillRect(5, 0, 1, 1);
    g.fillRect(6, 4, 1, 3);
    g.fillRect(2, 6, 5, 1);
    g.generateTexture(TEX_TUFT_B, 8, 8);
    g.destroy();
  }

  if (!scene.textures.exists(TEX_GLOW_SOFT)) {
    const g = scene.add.graphics();
    // Three rings rather than a gradient: cheap, and at 16px indistinguishable.
    g.fillStyle(0xffffff, 0.34);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(8, 8, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 2);
    g.generateTexture(TEX_GLOW_SOFT, 16, 16);
    g.destroy();
  }

  if (!scene.textures.exists(TEX_SHAFT)) {
    const g = scene.add.graphics();
    // A wedge, wider at the bottom, for light coming through a canopy.
    g.fillStyle(0xffffff, 1);
    for (let y = 0; y < 32; y += 1) {
      const halfWidth = 2 + (y / 32) * 6;
      g.fillRect(8 - halfWidth, y, halfWidth * 2, 1);
    }
    g.generateTexture(TEX_SHAFT, 16, 32);
    g.destroy();
  }

  if (!scene.textures.exists(TEX_WING)) {
    const g = scene.add.graphics();
    // A bird at distance is two strokes and nothing else.
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 1, 3, 1);
    g.fillRect(3, 0, 2, 1);
    g.fillRect(5, 1, 3, 1);
    g.generateTexture(TEX_WING, 8, 2);
    g.destroy();
  }
}

// --------------------------------------------------------------------------

interface Tuft {
  image: Phaser.GameObjects.Image;
  /** Where it stands, so the wave can be read from its position. */
  x: number;
  /** Its own offset into the wave, so a row does not move as one object. */
  phase: number;
  /** Which frame is showing, tracked to avoid setting the same texture twice. */
  leaning: boolean;
}

interface Shimmer {
  image: Phaser.GameObjects.Image;
  phase: number;
  baseAlpha: number;
}

interface Glow {
  image: Phaser.GameObjects.Image;
  phase: number;
  /** Lanterns burn harder than windows. */
  strength: number;
  baseScale: number;
}

export class WorldMotion {
  private readonly tufts: Tuft[] = [];
  private readonly shimmers: Shimmer[] = [];
  private readonly glows: Glow[] = [];
  private shaft: Phaser.GameObjects.Image | null = null;

  private anchors: MapAnchors = { map: 0 };
  private timers: Phaser.Time.TimerEvent[] = [];

  /** How long the wind takes to cross the map. Re-rolled per map. */
  private windPeriodMs = WIND.periodMsMin;
  private windWidth = 1;
  private reserved = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Effects,
  ) {
    createMotionTextures(scene);
  }

  // --- lifecycle ------------------------------------------------------------

  /** Points the motion at a map. Safe to call on every travel. */
  start(map: GameMap, cols: number, rows: number): void {
    this.stop();

    this.anchors = anchorsFor(map.mapId);
    this.windWidth = Math.max(1, cols * CELL);
    this.windPeriodMs =
      WIND.periodMsMin + Math.random() * Math.max(WIND.periodMsMax - WIND.periodMsMin, 0);

    if (!this.reserved) this.reserved = this.fx.reserve(RESERVED);

    this.buildGrass(map, cols, rows);
    this.buildWater();
    this.buildGlows();
    this.buildShaft();
    this.startEmitters();
  }

  stop(): void {
    for (const timer of this.timers) timer.remove();
    this.timers = [];

    for (const tuft of this.tufts) tuft.image.destroy();
    this.tufts.length = 0;
    for (const shimmer of this.shimmers) shimmer.image.destroy();
    this.shimmers.length = 0;
    for (const glow of this.glows) glow.image.destroy();
    this.glows.length = 0;

    this.shaft?.destroy();
    this.shaft = null;
  }

  destroy(): void {
    this.stop();
    if (this.reserved) {
      this.fx.releaseReserved(RESERVED);
      this.reserved = false;
    }
  }

  // --- the wind -------------------------------------------------------------

  /** The wind at a point. See motionMath for what it is and why. */
  private wind(now: number, x: number): number {
    return windAt(now, x, this.windPeriodMs, this.windWidth);
  }

  // --- grass ----------------------------------------------------------------

  /**
   * Tufts over the green parts of the painting.
   *
   * The map is drawn once into a cols x rows canvas - 1008 pixels, not three
   * million - and each cell's average colour decides two things: whether grass
   * belongs there at all, and what colour the tuft is. So the grass matches the
   * meadow it stands in without anybody writing down where the meadow is.
   *
   * Denser at the edges, because the middle of a map is where the player and
   * the buildings are, and grass waving under a character is noise.
   */
  private buildGrass(map: GameMap, cols: number, rows: number): void {
    const cells = this.sampleCells(map, cols, rows);
    if (!cells) return;

    const candidates: { c: number; r: number; colour: number; weight: number }[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = (r * cols + c) * 4;
        const red = cells[i]!;
        const green = cells[i + 1]!;
        const blue = cells[i + 2]!;

        if (!isGrassColour(red, green, blue)) continue;

        candidates.push({
          c,
          r,
          colour: (red << 16) | (green << 8) | blue,
          weight: edgeWeight(c, r, cols, rows),
        });
      }
    }

    // Weighted sample without replacement, cheaply: jitter each weight and
    // take the best. Exact proportions do not matter; the bias does.
    candidates.sort((a, b) => b.weight * Math.random() - a.weight * Math.random());

    for (const cell of candidates.slice(0, MAX_TUFTS)) {
      const x = cell.c * CELL + CELL / 2 + Phaser.Math.Between(-7, 7);
      const y = cell.r * CELL + CELL - 2 + Phaser.Math.Between(-3, 3);

      const image = this.scene.add
        .image(x, y, TEX_TUFT_A)
        .setOrigin(0.5, 1)
        // Lightened a little: a tuft in exactly the ground's colour is
        // invisible, and the point is to see it move.
        .setTint(lighten(cell.colour, 0.22))
        .setAlpha(0.75)
        .setScale(Phaser.Math.FloatBetween(0.9, 1.5))
        .setDepth(map.depthForActor(cell.r) - 2);

      this.tufts.push({ image, x, phase: Math.random() * Math.PI * 2, leaning: false });
    }
  }

  /**
   * The painting's average colour per cell.
   *
   * One scaled drawImage into a tiny canvas, then one getImageData. Reading the
   * 2688x1520 source directly would be four million pixels for a number we
   * want a thousand of.
   */
  private sampleCells(map: GameMap, cols: number, rows: number): Uint8ClampedArray | null {
    const texture = this.scene.textures.get(map.paintingKey);
    const source = texture?.getSourceImage() as CanvasImageSource | undefined;
    if (!source) return null;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = cols;
      canvas.height = rows;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(source, 0, 0, cols, rows);
      return context.getImageData(0, 0, cols, rows).data;
    } catch {
      // A tainted or not-yet-decoded texture costs the map its grass and
      // nothing else.
      return null;
    }
  }

  // --- water, lanterns, light ----------------------------------------------

  /** A shimmer per water anchor: a slow pulse, slightly out of step with itself. */
  private buildWater(): void {
    for (const cell of (this.anchors.water ?? []).slice(0, MAX_SHIMMER)) {
      const at = this.cellCentre(cell);
      const image = this.scene.add
        .image(at.x, at.y, TEX_GLOW_SOFT)
        .setOrigin(0.5)
        .setTint(0xbfe6ff)
        .setAlpha(0.16)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(6)
        .setScale(Phaser.Math.FloatBetween(1.6, 2.6), Phaser.Math.FloatBetween(0.7, 1.1));

      this.shimmers.push({ image, phase: Math.random() * Math.PI * 2, baseAlpha: 0.16 });
    }
  }

  /** Lanterns and windows. Same sprite, different strength. */
  private buildGlows(): void {
    const sources: { cell: CellRef; strength: number; colour: number }[] = [
      ...(this.anchors.lanterns ?? []).map((cell) => ({
        cell,
        strength: 1,
        colour: 0xffc46b,
      })),
      ...(this.anchors.windows ?? []).map((cell) => ({
        cell,
        strength: 0.65,
        colour: 0xffd79a,
      })),
    ];

    for (const source of sources.slice(0, MAX_GLOWS)) {
      const at = this.cellCentre(source.cell);
      const baseScale = source.strength === 1 ? 1.5 : 2.1;
      const image = this.scene.add
        .image(at.x, at.y, TEX_GLOW_SOFT)
        .setOrigin(0.5)
        .setTint(source.colour)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(baseScale)
        .setDepth(8000);

      this.glows.push({
        image,
        phase: Math.random() * Math.PI * 2,
        strength: source.strength,
        baseScale,
      });
    }
  }

  /** One shaft of light where the canopy opens. */
  private buildShaft(): void {
    const cell = this.anchors.shaft;
    if (!cell) return;

    const at = this.cellCentre(cell);
    this.shaft = this.scene.add
      .image(at.x, at.y - CELL, TEX_SHAFT)
      .setOrigin(0.5, 0)
      .setTint(0xfff0c0)
      .setAlpha(0.1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(2.4, 3.2)
      .setDepth(7);
  }

  // --- emitters -------------------------------------------------------------

  private startEmitters(): void {
    const every = (delay: number, callback: () => void) => {
      this.timers.push(this.scene.time.addEvent({ delay, loop: true, callback }));
    };

    if ((this.anchors.chimneys ?? []).length > 0) every(360, () => this.chimneySmoke());
    if ((this.anchors.flowers ?? []).length > 0) {
      every(900, () => this.butterfly());
      every(1500, () => this.petal());
    }
    if ((this.anchors.crystals ?? []).length > 0) every(700, () => this.crystalMote());
    if (this.anchors.cauldron) every(1100, () => this.cauldronBubble());

    const birdsEvery = this.anchors.birdsEveryMs ?? 0;
    if (birdsEvery > 0) every(birdsEvery, () => this.birds());
  }

  /** A billowing puff, leaning with whatever the wind is doing at the chimney. */
  private chimneySmoke(): void {
    const chimneys = this.anchors.chimneys ?? [];
    const cell = chimneys[Math.floor(Math.random() * chimneys.length)];
    if (!cell) return;

    const at = this.cellCentre(cell);
    const now = this.scene.time.now;
    const lean = this.wind(now, at.x);

    this.fx.float({
      x: at.x + Phaser.Math.Between(-2, 2),
      y: at.y,
      // The wind decides which way it goes, so every chimney on the map leans
      // together - and leans the same way the grass beneath them does.
      dx: lean * 26 + Phaser.Math.Between(-4, 4),
      dy: -Phaser.Math.Between(30, 52),
      colour: 0xcbbfa6,
      durationMs: Phaser.Math.Between(2400, 3600),
      scale: Phaser.Math.FloatBetween(0.7, 1.3),
      alpha: 0.4,
      texture: TEX_PUFF,
      depth: 7000,
    });
  }

  /** A butterfly over the flowers: up, over, and away. */
  private butterfly(): void {
    const at = this.randomAnchor(this.anchors.flowers);
    if (!at) return;

    this.fx.float({
      x: at.x + Phaser.Math.Between(-CELL, CELL),
      y: at.y + Phaser.Math.Between(-CELL, 0),
      dx: Phaser.Math.Between(-40, 40),
      dy: -Phaser.Math.Between(10, 34),
      colour: Phaser.Math.Between(0, 1) ? 0xf7e26b : 0xf0a6c8,
      durationMs: Phaser.Math.Between(2200, 3600),
      scale: Phaser.Math.FloatBetween(0.8, 1.2),
      alpha: 0.9,
      spin: Phaser.Math.Between(-40, 40),
      fadeIn: true,
      texture: TEX_WING,
      depth: 7000,
    });
  }

  /** A petal off the same flowers, falling with the wind. */
  private petal(): void {
    const at = this.randomAnchor(this.anchors.flowers);
    if (!at) return;

    const lean = this.wind(this.scene.time.now, at.x);
    this.fx.float({
      x: at.x + Phaser.Math.Between(-CELL, CELL),
      y: at.y - CELL,
      dx: lean * 40 + Phaser.Math.Between(-10, 10),
      dy: Phaser.Math.Between(26, 48),
      colour: 0xf2d9e6,
      durationMs: Phaser.Math.Between(2800, 4200),
      scale: Phaser.Math.FloatBetween(0.6, 1),
      alpha: 0.7,
      spin: Phaser.Math.Between(120, 360),
      texture: TEX_PUFF,
      depth: 7000,
    });
  }

  /** A mote lifting off a crystal. */
  private crystalMote(): void {
    const at = this.randomAnchor(this.anchors.crystals);
    if (!at) return;

    this.fx.float({
      x: at.x + Phaser.Math.Between(-10, 10),
      y: at.y,
      dx: Phaser.Math.Between(-6, 6),
      dy: -Phaser.Math.Between(26, 54),
      colour: 0xa6d8ff,
      durationMs: Phaser.Math.Between(2600, 4200),
      scale: Phaser.Math.FloatBetween(0.7, 1.4),
      alpha: 0.7,
      fadeIn: true,
      depth: 7000,
    });
  }

  /** A bubble on the cauldron, and now and then a splash. */
  private cauldronBubble(): void {
    const cell = this.anchors.cauldron;
    if (!cell) return;
    const at = this.cellCentre(cell);

    this.fx.float({
      x: at.x + Phaser.Math.Between(-6, 6),
      y: at.y - 6,
      dx: Phaser.Math.Between(-4, 4),
      dy: -Phaser.Math.Between(8, 16),
      colour: 0xc9d67a,
      durationMs: Phaser.Math.Between(700, 1100),
      scale: Phaser.Math.FloatBetween(0.5, 0.9),
      alpha: 0.75,
      texture: TEX_PUFF,
      depth: 7000,
    });

    // One in five bubbles bursts.
    if (Math.random() < 0.2) {
      for (let i = 0; i < 3; i += 1) this.fx.spark(at.x, at.y - 8, 7000);
    }
  }

  /**
   * Two or three birds, in a loose line across the sky.
   *
   * Spaced by a delay rather than by position, so they trail rather than fly
   * in formation - and they cross the whole map, which is the only thing here
   * that travels further than a cell or two.
   */
  private birds(): void {
    const rows = this.anchors.birdRows ?? [1, 5];
    const flock = Phaser.Math.Between(2, 3);
    const rightward = Math.random() < 0.5;
    const y = Phaser.Math.Between(rows[0], rows[1]) * CELL;
    const span = this.windWidth + CELL * 4;

    for (let i = 0; i < flock; i += 1) {
      this.timers.push(
        this.scene.time.delayedCall(i * Phaser.Math.Between(240, 420), () => {
          this.fx.float({
            x: rightward ? -CELL * 2 : this.windWidth + CELL * 2,
            y: y + i * Phaser.Math.Between(-8, 8),
            dx: rightward ? span : -span,
            dy: Phaser.Math.Between(-16, 16),
            colour: 0x2b2438,
            durationMs: Phaser.Math.Between(7000, 10000),
            scale: Phaser.Math.FloatBetween(0.8, 1.2),
            alpha: 0.55,
            texture: TEX_WING,
            depth: 9500,
          });
        }),
      );
    }
  }

  // --- feedback -------------------------------------------------------------

  /** A node shakes off a few leaves when it is harvested. */
  rustle(x: number, y: number): void {
    const lean = this.wind(this.scene.time.now, x);
    for (let i = 0; i < 4; i += 1) {
      this.fx.float({
        x: x + Phaser.Math.Between(-8, 8),
        y: y - Phaser.Math.Between(4, 14),
        dx: lean * 18 + Phaser.Math.Between(-14, 14),
        dy: Phaser.Math.Between(12, 26),
        colour: 0x9ab863,
        durationMs: Phaser.Math.Between(600, 1000),
        scale: Phaser.Math.FloatBetween(0.6, 1),
        alpha: 0.8,
        spin: Phaser.Math.Between(90, 300),
        texture: TEX_PUFF,
        depth: 7000,
      });
    }
  }

  // --- helpers --------------------------------------------------------------

  /** The middle of a cell, in world pixels. */
  private cellCentre(cell: CellRef): { x: number; y: number } {
    return { x: cell[0] * CELL + CELL / 2, y: cell[1] * CELL + CELL / 2 };
  }

  /** One of a list of anchors at random, or null when the list is empty. */
  private randomAnchor(cells: CellRef[] | undefined): { x: number; y: number } | null {
    if (!cells || cells.length === 0) return null;
    return this.cellCentre(cells[Math.floor(Math.random() * cells.length)]!);
  }

  // --- per frame ------------------------------------------------------------

  /**
   * Everything persistent, advanced one frame.
   *
   * Deliberately flat: three short loops over small arrays, arithmetic only,
   * no allocation and no tweens. The tufts are the largest of them at 44, and
   * a texture is only assigned when the frame actually changes - setting the
   * same texture every frame is the kind of thing that costs a millisecond for
   * nothing.
   */
  tick(now: number): void {
    const night = nightFactor(now);

    for (const tuft of this.tufts) {
      const pose = tuftPose(now, tuft.x, tuft.phase, this.windPeriodMs, this.windWidth);
      // Only when it actually changes: setting the same texture every frame is
      // the kind of thing that costs a millisecond for nothing.
      if (pose.leaning !== tuft.leaning) {
        tuft.leaning = pose.leaning;
        tuft.image.setTexture(pose.leaning ? TEX_TUFT_B : TEX_TUFT_A);
      }
      tuft.image.setAngle(pose.angle);
    }

    for (const shimmer of this.shimmers) {
      const pose = shimmerPose(now, shimmer.phase, shimmer.baseAlpha);
      shimmer.image.setAlpha(pose.alpha);
      shimmer.image.setScale(shimmer.image.scaleX, pose.scaleY);
    }

    for (const glow of this.glows) {
      const pose = glowPose(now, glow.phase, glow.strength, night, glow.baseScale);
      glow.image.setAlpha(pose.alpha);
      glow.image.setScale(pose.scale);
    }

    if (this.shaft) this.shaft.setAlpha(shaftAlpha(now, night));
  }
}
