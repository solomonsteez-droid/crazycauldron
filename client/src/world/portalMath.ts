/**
 * The arithmetic behind the gates, with no Phaser in it.
 *
 * Split out for the same reason world/motionMath.ts is: this is the part worth
 * measuring, and a renderer cannot be started in a test. The gates have a
 * budget of a millisecond a frame for all of them together, and the only way
 * to know whether they are inside it is to run the numbers a few hundred
 * thousand times somewhere a browser is not.
 *
 * It is also the part that decides what the gates look like, which is the
 * other reason it is here: the spiral is an equation, and an equation is
 * easier to trust when it can be evaluated on its own.
 */

import { PORTALS } from "@crazycauldron/shared";

const defaults = PORTALS.defaults;

/**
 * Alpha in bands rather than on a ramp.
 *
 * Everything here is drawn at map pixel scale and then magnified by the
 * camera, up to four times. A gradient that is smooth at 1x is a muddy smear
 * at 4x; six steps read as deliberate shading, which is what the rest of the
 * game's art does.
 */
export function band(alpha: number): number {
  const steps = defaults.alphaSteps;
  return Math.round(Math.max(0, Math.min(1, alpha)) * steps) / steps;
}

/**
 * The inner edge of the arch at a row: half the opening's width.
 *
 * Straight-sided for the lower part and a semicircle over it, which is the
 * shape every arch ever built has and the one a player reads as a doorway
 * rather than as a hole in the painting.
 */
export function openingHalfWidth(
  row: number,
  width: number,
  height: number,
  jamb: number,
): number {
  const half = width / 2 - jamb;
  const springLine = height * 0.55;
  if (row >= springLine) return half;

  const t = (springLine - row) / springLine;
  return Math.sqrt(Math.max(0, 1 - t * t)) * half;
}

/**
 * One pixel of a spiral: how much of an arm is here.
 *
 * A logarithmic spiral - the equation of every galaxy and every drain - with
 * only the crest of the wave kept, so there is an arm and then a gap rather
 * than a ripple everywhere. It fades to nothing before the rim, which is what
 * lets the sprite be laid over the arch's opening without a mask and without
 * a visible edge.
 */
export function spiralAlphaAt(dx: number, dy: number, radiusPx: number, arms: number): number {
  const radius = Math.sqrt(dx * dx + dy * dy) / radiusPx;
  if (radius > 1 || radius < 0.04) return 0;

  const arm = Math.sin(arms * Math.atan2(dy, dx) + Math.log(radius) * 5);
  const on = Math.max(0, arm - 0.2) / 0.8;
  const falloff = Math.max(0, 1 - radius) * (0.35 + 0.65 * (1 - radius));
  return band(on * falloff);
}

export interface PortalFrame {
  /** One rotation per spiral layer, in radians. */
  rotations: number[];
  glowAlpha: number;
}

/**
 * Everything one gate changes in a frame.
 *
 * Three rotations and an alpha, and that is the whole of it - which is why
 * three gates cost a fraction of a millisecond between them. The arch, both
 * spirals and the glow were each drawn once into a texture when the map
 * loaded, and a texture costs the same to rotate whatever is painted on it.
 */
export function portalFrame(now: number, glowPulse = 1): PortalFrame {
  const rotations: number[] = [];
  for (let i = 0; i < defaults.spinMs.length; i += 1) {
    const period = defaults.spinMs[i] ?? 6000;
    rotations.push(((now % Math.abs(period)) / period) * Math.PI * 2);
  }

  const pulse = (1 - Math.cos((now / defaults.pulseMs) * Math.PI * 2)) / 2;
  const span = (defaults.glowAlphaMax - defaults.glowAlphaMin) * glowPulse;

  return { rotations, glowAlpha: defaults.glowAlphaMin + pulse * span };
}
