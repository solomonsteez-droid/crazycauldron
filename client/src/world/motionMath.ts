/**
 * The arithmetic behind the world motion, with no Phaser in it.
 *
 * Split out for one reason: this is the part that runs on every object on
 * every frame, and it is the part worth measuring. A renderer cannot be
 * started in a test, so the code that costs frame time lives here where
 * `scripts/test-motion.ts` can run it a thousand times and report what it
 * costs at full budget.
 *
 * Everything below is a pure function of time and a few constants. No
 * allocation, no branching on anything that changes per frame, and no
 * trigonometry that could have been a lookup - which between them are the
 * whole of the performance story.
 */

/**
 * The wind at a point, -1 to 1.
 *
 * A travelling wave, not a global oscillation: the phase depends on x as well
 * as on time, so a gust crosses the map rather than the whole field flexing at
 * once. The grass and the chimney smoke both read this, which is what makes
 * them look like the same weather instead of two effects.
 */
export function windAt(now: number, x: number, periodMs: number, width: number): number {
  const t = (now % periodMs) / periodMs;
  return Math.sin((t - x / width) * Math.PI * 2);
}

/** Above this the tuft swaps to its leaning frame. */
const LEAN_THRESHOLD = 0.25;
/** Degrees either way. More and a tuft of grass becomes a windscreen wiper. */
const LEAN_DEGREES = 7;

export interface TuftPose {
  angle: number;
  leaning: boolean;
}

export function tuftPose(
  now: number,
  x: number,
  phase: number,
  periodMs: number,
  width: number,
): TuftPose {
  const w = Math.sin(
    ((now % periodMs) / periodMs - x / width) * Math.PI * 2 + phase,
  );
  return { angle: w * LEAN_DEGREES, leaning: w > LEAN_THRESHOLD };
}

export interface ShimmerPose {
  alpha: number;
  scaleY: number;
}

/**
 * Water catching the light.
 *
 * One sine drives both the brightness and a slight vertical squash; together
 * at this alpha they read as a ripple crossing the surface rather than as a
 * sprite changing size, which is the cheapest honest version of a wave.
 */
export function shimmerPose(now: number, phase: number, baseAlpha: number): ShimmerPose {
  const pulse = Math.sin(now / 900 + phase);
  return { alpha: baseAlpha * (1 + pulse * 0.5), scaleY: 0.9 + pulse * 0.12 };
}

export interface GlowPose {
  alpha: number;
  scale: number;
}

/**
 * A lantern or a lit window.
 *
 * Two sines with periods that do not divide into each other, so the flicker
 * never settles into a rhythm you can watch. Scaled by how dark it is: almost
 * out at noon, full after dusk. Lights coming up as the day turns is most of
 * what makes the cycle feel like time passing rather than a filter.
 */
export function glowPose(
  now: number,
  phase: number,
  strength: number,
  night: number,
  baseScale: number,
): GlowPose {
  const flicker = 0.82 + Math.sin(now / 130 + phase) * 0.1 + Math.sin(now / 57) * 0.05;
  const lit = (0.12 + night * 0.88) * strength;
  return { alpha: lit * flicker * 0.75, scale: baseScale * (0.96 + flicker * 0.06) };
}

/** A shaft of light through the canopy. Barely there, and barely moving. */
export function shaftAlpha(now: number, night: number): number {
  return 0.07 + Math.sin(now / 2600) * 0.03 + (1 - night) * 0.05;
}

/** Mixes a colour toward white, for a tuft that has to be seen against its own ground. */
export function lighten(colour: number, amount: number): number {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/**
 * Whether a cell's average colour is grass.
 *
 * Green-dominant, and neither a pale path nor pitch black. Tuned against the
 * four paintings rather than guessed: these bounds find 129 cells in the hub,
 * 190 in the Meadows, 60 on the forest floor and - the one that matters - none
 * at all in the caves, which are stone. A threshold that grew grass
 * underground would mean it was calling something green that is not.
 *
 * Kept here with the rest of the arithmetic so it can be checked against the
 * real images by scripts/test-motion.ts instead of eyeballed in a browser.
 */
export function isGrassColour(red: number, green: number, blue: number): boolean {
  return green > red + 6 && green > blue + 10 && green > 38 && green < 215;
}

/**
 * How much grass a cell deserves, 0.25 in the middle of a map rising to 1 at
 * the edges.
 *
 * The middle is where the player and the buildings are, and grass waving under
 * a character is noise; the edges are hedgerow and verge, where it is scenery.
 */
export function edgeWeight(col: number, row: number, cols: number, rows: number): number {
  const dx = Math.abs(col / Math.max(cols - 1, 1) - 0.5) * 2;
  const dy = Math.abs(row / Math.max(rows - 1, 1) - 0.5) * 2;
  return 0.25 + Math.max(dx, dy) * 0.75;
}
