/**
 * The walk, as arithmetic.
 *
 * Which drawing is on screen, and where the figure sits relative to its
 * resting place, as pure functions of how long it has been walking. No Phaser,
 * so `scripts/test-walk.ts` can play a second of every direction and check the
 * frame actually advances - which is the thing that was wrong and that nothing
 * could see.
 *
 * **Why this is not a Phaser animation any more.** It used to be:
 * `createBodyAnimations` registered one animation per body and direction and
 * the sprite played it. That works until something re-seats the sprite, and
 * the walk has three things that can - a click's predicted intent, the
 * server's own facing, and the tween ending a step early - each of which used
 * to run through `play()` and could land the cycle back on its first frame. A
 * frame derived from accumulated walk time cannot be reset by any of them,
 * because none of them touches the clock.
 *
 * **And the procedural half.** The four drawings per direction do not all
 * carry a stride: in the up sheets the feet travel about a tenth of a pixel
 * across the whole cycle, which reads as a figure sliding backwards up the
 * map however cleanly it is played. So the motion does not depend on the art
 * being good - a two-pixel bob on the stride, a one-pixel lean into the
 * travel, and a puff of dust where a foot lands. Whole pixels throughout: a
 * sub-pixel offset on a 32x48 figure is blur, not motion.
 */

/** What the pipeline worked out about one direction's four drawings. */
export interface WalkCycleData {
  /** Source frame numbers, in the order they are played. */
  order: number[];
  frameRate: number;
  /**
   * Frames where a foot is planted, by source frame number.
   *
   * Measured from the art where the art allows it. Where the feet never
   * change their separation - which is every sheet this game currently has -
   * the pipeline says so and falls back to the convention that the first and
   * third drawings of a four-frame cycle are the contacts.
   */
  contact?: number[];
}

/** The cycle used when a body predates the manifest carrying its own. */
export const DEFAULT_CYCLE: WalkCycleData = {
  order: [0, 1, 2, 3],
  frameRate: 10,
  contact: [0, 2],
};

export type WalkDirection = "down" | "up" | "left" | "right";

export interface GaitPose {
  /** The drawing to show, by the number in its file name. */
  sourceFrame: number;
  /** Where in the played order that drawing is, which a ping-pong repeats. */
  step: number;
  /** Whole pixels, negative is up. */
  bobY: number;
  /** Whole pixels, positive is right. */
  leanX: number;
  /** True on the step a foot lands. One dust puff per true. */
  contact: boolean;
}

/** Up on the passing frames, level on the contacts. Two pixels, no more. */
const BOB_PX = 2;

/**
 * Which drawings are foot-strikes.
 *
 * By source frame number rather than by position in the order, because a
 * ping-pong plays six steps from four drawings and a position-based rule
 * would put the contacts in different places on the way back.
 */
export function contactFrames(cycle: WalkCycleData): Set<number> {
  const listed = cycle.contact;
  if (listed && listed.length > 0) return new Set(listed);

  // The convention, for a sheet the pipeline could not measure: first and
  // third of four.
  const distinct = [...new Set(cycle.order)].sort((a, b) => a - b);
  return new Set(distinct.filter((_, index) => index % 2 === 0));
}

/**
 * The lean, which is a weight shift rather than a rotation.
 *
 * Walking left or right, the figure tips a pixel the way it is going. Walking
 * up or down there is no sideways travel to lean into, so the pixel alternates
 * with the stride instead - which is what a lean looks like from in front or
 * behind, and is the only part of the figure that can say "this is a step"
 * when the drawings themselves barely change.
 */
function leanFor(direction: WalkDirection, step: number): number {
  if (direction === "left") return -1;
  if (direction === "right") return 1;
  return step % 2 === 0 ? -1 : 1;
}

/**
 * The pose at a moment, from how long this character has been walking.
 *
 * `elapsedMs` is walk time, not wall time: it stops accumulating when the
 * figure stops and resumes where it left off, so a step interrupted by a
 * pause does not restart the stride from its first frame.
 */
export function gaitPose(
  cycle: WalkCycleData,
  elapsedMs: number,
  direction: WalkDirection,
): GaitPose {
  const order = cycle.order.length > 0 ? cycle.order : DEFAULT_CYCLE.order;
  const rate = cycle.frameRate > 0 ? cycle.frameRate : DEFAULT_CYCLE.frameRate;

  const step = Math.floor(Math.max(0, elapsedMs) / (1000 / rate)) % order.length;
  const sourceFrame = order[step] ?? 0;
  const contact = contactFrames(cycle).has(sourceFrame);

  return {
    sourceFrame,
    step,
    bobY: contact ? 0 : -BOB_PX,
    leanX: leanFor(direction, step),
    contact,
  };
}

/**
 * How many times the drawing changes over a stretch of walking.
 *
 * Used by the test, and the reason it exists rather than being inlined there:
 * "the frame advances" is the property that was broken, and a property worth
 * testing is worth naming.
 */
export function frameChanges(
  cycle: WalkCycleData,
  durationMs: number,
  sampleMs = 1000 / 60,
): number {
  let changes = 0;
  let previous: number | null = null;

  for (let t = 0; t < durationMs; t += sampleMs) {
    const { sourceFrame } = gaitPose(cycle, t, "down");
    if (previous !== null && sourceFrame !== previous) changes += 1;
    previous = sourceFrame;
  }

  return changes;
}
