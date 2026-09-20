/**
 * The gates, drawn in code.
 *
 * They used to be three paintings, cut by the sprite pipeline and scaled onto
 * the map. Those files are still in art/buildings/ and nothing draws them any
 * more: a painted arch is one picture, and a gate is the loudest object in the
 * hub - the thing that says the map continues - so it has to move.
 *
 * Every piece is built once into a texture and then only transformed, which is
 * what keeps three animated gates inside a millisecond a frame. The arch is a
 * still image; the two spiral textures are still images; what happens per
 * frame is three rotations, one alpha, and a particle every second or so.
 *
 * **Hard pixels throughout.** Everything is drawn into a canvas at map pixel
 * scale - one texture pixel is one world pixel - with alpha quantised into
 * bands rather than ramped, and every texture is set to NEAREST. A gradient
 * that is smooth at 1x is a muddy smear at 3x, and the rest of this game is
 * pixel art.
 *
 * Colours, sizes and rates come from shared/src/content/portals.json.
 */

import Phaser from "phaser";
import {
  CELL,
  PORTALS,
  hashSeed,
  portalFor,
  seededRandom,
  type AreaZone,
  type PortalDef,
} from "@crazycauldron/shared";
import type { Effects } from "./effects.js";
import { band, openingHalfWidth, portalFrame, spiralAlphaAt } from "./portalMath.js";
import { TEX_GLOW } from "../map/textures.js";

/** Slots held for the gates' own particles, out of the 200-particle pool. */
const RESERVED_PER_PORTAL = 6;

const defaults = PORTALS.defaults;

const rgb = (css: string): number => Phaser.Display.Color.HexStringToColor(css).color;

// --- the arch --------------------------------------------------------------

/**
 * Draws one arch into a texture, in whichever of the three builds it is.
 *
 * Seeded from the gate's own id, so the crooked keystone is crooked the same
 * way every time the map loads - a stone that moves when you walk back through
 * a door reads as a fault, however pretty each version is.
 */
function drawArch(
  scene: Phaser.Scene,
  key: string,
  def: PortalDef,
  width: number,
  height: number,
  seed: number,
): void {
  if (scene.textures.exists(key)) return;

  const texture = scene.textures.createCanvas(key, width, height);
  const context = texture?.getContext();
  if (!texture || !context) return;

  context.imageSmoothingEnabled = false;
  const random = seededRandom(seed);
  const jamb = Math.max(5, Math.round(width * 0.17));

  const fill = (x: number, y: number, w: number, h: number, css: string, alpha = 1) => {
    context.globalAlpha = band(alpha);
    context.fillStyle = css;
    context.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };

  if (def.style === "stone") drawStone(fill, random, def, width, height, jamb);
  else if (def.style === "trunks") drawTrunks(fill, random, def, width, height, jamb);
  else drawCrystal(fill, random, def, width, height, jamb);

  drawRim(fill, def, width, height, jamb);

  context.globalAlpha = 1;
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

type Fill = (x: number, y: number, w: number, h: number, css: string, alpha?: number) => void;

/** Layered blocks in warm grey, laid unevenly, with a crooked keystone. */
function drawStone(
  fill: Fill,
  random: () => number,
  def: PortalDef,
  width: number,
  height: number,
  jamb: number,
): void {
  const [mid, dark, light] = def.stone;
  const course = 9;

  for (let y = 0; y < height; y += course) {
    const inner = openingHalfWidth(y, width, height, jamb);
    const gap = inner > 0 ? inner : 0;

    for (const side of [-1, 1] as const) {
      const from = width / 2 + side * gap;
      const to = side < 0 ? 0 : width;
      const span = Math.abs(to - from);
      if (span < 2) continue;

      // Blocks along the course, each a little different so no two courses
      // line up - the whole point of a rough wall.
      let x = Math.min(from, to);
      const end = Math.max(from, to);
      while (x < end) {
        const block = Math.min(end - x, 7 + Math.floor(random() * 5));
        const shade = random() < 0.28 ? light : random() < 0.5 ? dark : mid;
        fill(x, y, block - 1, course - 1, shade);
        // A darker underside on every block: one row of shadow is the whole
        // difference between a wall and a grid.
        fill(x, y + course - 2, block - 1, 1, dark, 0.7);
        x += block;
      }
    }
  }

  // The keystone, deliberately off true.
  const lean = random() < 0.5 ? -2 : 2;
  const keyWidth = Math.round(width * 0.2);
  fill(width / 2 - keyWidth / 2 + lean, 0, keyWidth, course * 2, light);
  fill(width / 2 - keyWidth / 2 + lean, course * 2 - 2, keyWidth, 2, dark, 0.8);

  drawVines(fill, random, def, width, height, jamb);
}

/** Two twisted trunks that lean together and meet overhead. */
function drawTrunks(
  fill: Fill,
  random: () => number,
  def: PortalDef,
  width: number,
  height: number,
  jamb: number,
): void {
  const [mid, dark, light] = def.stone;

  for (let y = 0; y < height; y += 2) {
    const inner = openingHalfWidth(y, width, height, jamb);
    // The twist: a slow wander, the same on both sides but mirrored, so the
    // two trunks lean into each other rather than in parallel.
    const wander = Math.round(Math.sin(y / 17) * 3 + Math.sin(y / 6) * 1.5);

    for (const side of [-1, 1] as const) {
      const edge = width / 2 + side * inner;
      const outer = side < 0 ? 0 : width;
      const from = Math.min(edge, outer) + (side < 0 ? wander : 0);
      const span = Math.abs(outer - edge) - Math.abs(wander);
      if (span < 2) continue;

      fill(from, y, span, 2, mid);
      fill(side < 0 ? from : from + span - 2, y, 2, 2, side < 0 ? dark : light, 0.9);

      // Moss on the northern faces, in patches rather than a coat.
      if (random() < 0.16) {
        fill(from + random() * Math.max(1, span - 3), y, 3, 2, def.vine, 0.75);
      }
    }
  }

  drawVines(fill, random, def, width, height, jamb);

  // Vines hanging from the crown, into the opening.
  const crown = Math.round(height * 0.16);
  for (let i = 0; i < 5; i += 1) {
    const x = width * 0.3 + random() * width * 0.4;
    const length = 6 + random() * 16;
    fill(x, crown, 1, length, def.vine, 0.8);
    fill(x - 1, crown + length, 3, 2, def.vineLight, 0.85);
  }
}

/** Jagged shards leaning in over a dark mouth. */
function drawCrystal(
  fill: Fill,
  random: () => number,
  def: PortalDef,
  width: number,
  height: number,
  jamb: number,
): void {
  const [mid, dark, light] = def.stone;

  // The mouth behind the shards, so the opening reads as depth rather than a
  // hole in the painting.
  for (let y = 0; y < height; y += 1) {
    const inner = openingHalfWidth(y, width, height, jamb);
    if (inner < 1) continue;
    fill(width / 2 - inner, y, inner * 2, 1, "#0c0912", 0.85);
  }

  for (const side of [-1, 1] as const) {
    let y = height;
    while (y > height * 0.06) {
      const shard = 10 + random() * 22;
      const top = Math.max(height * 0.05, y - shard);
      const inner = openingHalfWidth((y + top) / 2, width, height, jamb);
      const base = width / 2 + side * (inner + 1);
      const thickness = 4 + random() * 7;
      const shade = random() < 0.3 ? light : random() < 0.55 ? dark : mid;

      // A shard is a stack of rows that narrows to a point, which is a
      // triangle a pixel at a time and therefore has hard edges.
      const rows = Math.max(2, Math.round(y - top));
      for (let i = 0; i < rows; i += 1) {
        const t = i / rows;
        const w = Math.max(1, thickness * (1 - t * 0.85));
        const lean = side * t * 4;
        fill(base - (side < 0 ? w : 0) + lean, y - i, w, 1, shade);
      }
      // A lit facet down one edge.
      fill(base - (side < 0 ? thickness : 0), y - rows + 1, 1, rows - 1, light, 0.6);

      y -= shard * 0.75;
    }
  }

  // Tiny glowing mushrooms at the feet.
  for (let i = 0; i < 7; i += 1) {
    const x = random() * width;
    const y = height - 1 - random() * 5;
    fill(x, y - 2, 1, 2, def.vine, 0.9);
    fill(x - 1, y - 3, 3, 1, def.vineLight, 0.9);
  }
}

/** Vines up both jambs, with small flowers where they catch the light. */
function drawVines(
  fill: Fill,
  random: () => number,
  def: PortalDef,
  width: number,
  height: number,
  jamb: number,
): void {
  for (const side of [-1, 1] as const) {
    let y = height - 1;
    let drift = 0;
    while (y > height * 0.1) {
      const inner = openingHalfWidth(y, width, height, jamb);
      drift += (random() - 0.5) * 1.6;
      drift = Math.max(-3, Math.min(3, drift));
      const x = width / 2 + side * (inner + 2) + drift;

      fill(x, y, 1, 2, def.vine, 0.85);
      if (random() < 0.22) fill(x + (random() < 0.5 ? -2 : 2), y, 2, 1, def.vineLight, 0.8);
      if (random() < 0.1) {
        const petal = def.flowers[Math.floor(random() * def.flowers.length)] ?? def.vineLight;
        fill(x + (random() < 0.5 ? -3 : 3), y - 1, 2, 2, petal, 0.95);
      }
      y -= 2;
    }
  }
}

/**
 * A rim of light down the inner edge, in the vortex's colour.
 *
 * The one thing that says the light is coming from inside the gate rather
 * than from the sky: without it the arch is a doorway with a picture behind
 * it, and with it the arch is lit by what it contains.
 */
function drawRim(fill: Fill, def: PortalDef, width: number, height: number, jamb: number): void {
  for (let y = 0; y < height; y += 1) {
    const inner = openingHalfWidth(y, width, height, jamb);
    if (inner < 1) continue;
    const strength = 0.55 * (1 - y / height) + 0.2;
    fill(width / 2 - inner - 1, y, 1, 1, def.vortexCore, strength);
    fill(width / 2 + inner, y, 1, 1, def.vortexCore, strength);
  }
}

// --- the vortex ------------------------------------------------------------

/**
 * One spiral, as a texture.
 *
 * A logarithmic spiral evaluated per pixel: the arm falls out of
 * `sin(arms * angle + turns * log(radius))`, which is the equation of every
 * spiral galaxy and every drain. Alpha is banded and the whole thing fades to
 * nothing before the edge, so the sprite can be laid over the opening without
 * a mask and without a visible boundary.
 */
function drawSpiral(scene: Phaser.Scene, key: string, size: number, arms: number, css: string): void {
  if (scene.textures.exists(key)) return;

  const texture = scene.textures.createCanvas(key, size, size);
  const context = texture?.getContext();
  if (!texture || !context) return;

  const colour = Phaser.Display.Color.HexStringToColor(css);
  const image = context.createImageData(size, size);
  const centre = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const alpha = spiralAlphaAt(x - centre + 0.5, y - centre + 0.5, centre, arms);
      if (alpha <= 0) continue;

      image.data[i] = colour.red;
      image.data[i + 1] = colour.green;
      image.data[i + 2] = colour.blue;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }

  context.putImageData(image, 0, 0);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// --- one gate --------------------------------------------------------------

export class Portal {
  private readonly arch: Phaser.GameObjects.Image;
  private readonly spirals: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly def: PortalDef;
  private readonly centre: { x: number; y: number };
  private readonly opening: number;
  private nextMoteAt = 0;
  private nextPetalAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Effects,
    zone: AreaZone,
    depth: number,
  ) {
    this.def = portalFor(zone.section ?? 0);

    const width = defaults.widthChars * defaults.charWidthPx;
    const height = defaults.heightChars * defaults.charHeightPx;
    const jamb = Math.max(5, Math.round(width * 0.17));
    this.opening = Math.round((width / 2 - jamb) * 2);

    // The foot of the arch stands on the gate's baseline row, like a building.
    const x = (zone.c + zone.w / 2) * CELL;
    const foot = (zone.baseline + 1) * CELL;
    this.centre = { x, y: foot - height * 0.55 };

    const archKey = `portal-arch-${zone.id}-${this.def.section}`;
    drawArch(this.scene, archKey, this.def, width, height, hashSeed(`${zone.id}:${this.def.section}`));

    /*
     * The vortex goes in first, so the arch is drawn over it and the opening
     * frames it. Both sort on the same depth as any other building on this
     * baseline, which is what lets a player walk in front of a gate.
     */
    for (let i = 0; i < defaults.spinMs.length; i += 1) {
      const arms = defaults.spiralArms[i % defaults.spiralArms.length] ?? 3;
      const key = `portal-spiral-${this.def.section}-${arms}`;
      drawSpiral(this.scene, key, this.opening, arms, i === 0 ? this.def.vortexCore : this.def.vortex);

      const sprite = this.scene.add
        .image(x, this.centre.y, key)
        .setOrigin(0.5)
        .setDepth(depth - 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(defaults.spiralAlpha[i] ?? 0.4)
        .setScale(defaults.spiralScale[i] ?? 1);
      this.spirals.push(sprite);
    }

    this.arch = this.scene.add
      .image(x, foot, archKey)
      .setOrigin(0.5, 1)
      .setDepth(depth);

    // The pool of light on the ground, which is what a player sees first.
    this.glow = this.scene.add
      .image(x, foot - 4, TEX_GLOW)
      .setOrigin(0.5)
      .setDepth(depth - 2)
      .setTint(rgb(this.def.glow))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(width * 1.9, height * 0.55);

    this.fx.reserve(RESERVED_PER_PORTAL);
  }

  /**
   * One frame.
   *
   * Three rotations, one alpha and at most one particle. Everything that
   * could have been arithmetic per pixel was done once, into a texture, in
   * the constructor - which is the whole reason three animated gates cost
   * less than a tenth of a millisecond between them.
   */
  tick(now: number): void {
    const frame = portalFrame(now, this.def.glowPulse ?? 1);
    for (let i = 0; i < this.spirals.length; i += 1) {
      this.spirals[i]!.setRotation(frame.rotations[i] ?? 0);
    }
    this.glow.setAlpha(frame.glowAlpha);

    if (now >= this.nextMoteAt) {
      this.nextMoteAt = now + this.def.moteEveryMs * (0.6 + Math.random() * 0.8);
      this.fx.float({
        x: this.centre.x + (Math.random() - 0.5) * this.opening,
        y: this.centre.y + this.opening * 0.3,
        dx: (Math.random() - 0.5) * 10,
        dy: -18 - Math.random() * 22,
        colour: rgb(this.def.mote),
        durationMs: 1400 + Math.random() * 900,
        scale: 1,
        alpha: 0.75,
        fadeIn: true,
        depth: this.arch.depth + 1,
      });
    }

    if (now >= this.nextPetalAt) {
      this.nextPetalAt = now + this.def.petalEveryMs * (0.6 + Math.random() * 0.8);
      this.fx.float({
        x: this.centre.x + (Math.random() - 0.5) * this.opening * 1.6,
        y: this.centre.y,
        dx: (Math.random() - 0.5) * 26,
        dy: 14 + Math.random() * 16,
        colour: rgb(this.def.petal),
        durationMs: 2200 + Math.random() * 1200,
        scale: 1,
        alpha: 0.6,
        spin: 90,
        depth: this.arch.depth + 1,
      });
    }
  }

  destroy(): void {
    this.fx.releaseReserved(RESERVED_PER_PORTAL);
    this.arch.destroy();
    this.glow.destroy();
    for (const sprite of this.spirals) sprite.destroy();
  }
}
