/**
 * Measures how often the heat bar actually pays out Fine and Superb.
 *
 * The play-test report was "many dishes at Firecraft 1, never a Fine or a
 * Superb". The cause was a hard quality cap, not the bar - but a cap is easy to
 * remove and hard to notice coming back, so this samples thousands of simulated
 * cooks and prints the distribution at each skill level.
 *
 *   npx tsx scripts/test-cooking.ts
 */

import { CONFIG, timingWindowPct, type SkillLevels } from "@crazycauldron/shared";

/*
 * A player's error is in *timing*, not position: they click a few tens of
 * milliseconds early or late, and the marker speed decides how far that is
 * along the bar. Modelling it as a fixed positional error hides the whole point
 * of the +15% speed retune, which makes the same reaction worth more distance.
 */
const SIGMA_MS = 70;
const SAMPLES = 20000;

/** Average sweeps across the bar, after the retune multiplier. */
const SWEEPS = 3 * CONFIG.cooking.markerSpeedMultiplier;
/** Bar-widths travelled per millisecond. */
const SPEED = SWEEPS / CONFIG.cooking.barMs;
const SIGMA = SIGMA_MS * SPEED;

function gaussian(): number {
  // Box-Muller, good enough for a feel check.
  const u = Math.max(Number.EPSILON, Math.random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function levelsAt(firecraft: number, knifework: number): SkillLevels {
  return { foraging: 1, prospecting: 1, knifework, firecraft, spicecraft: 1 };
}

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
};

console.log("test-cooking\n");
console.log(
  `  marker speed x${CONFIG.cooking.markerSpeedMultiplier}, ` +
    `Fine band ${CONFIG.cooking.fineWindowMultiplier}x the Superb window, ` +
    `player sigma ${SIGMA}\n`,
);
console.log("  firecraft  window   superb    fine   common");
console.log("  ---------  ------   ------   -----   ------");

const rates: Record<number, { superb: number; fine: number; common: number }> = {};

for (const firecraft of [1, 5, 10, 15, 20]) {
  // Knifework deliberately left at 1: that is the state the bug was reported in.
  const levels = levelsAt(firecraft, 1);
  const windowPct = timingWindowPct(levels, 0);
  const superbHalf = windowPct / 200;
  const fineHalf = (windowPct * CONFIG.cooking.fineWindowMultiplier) / 200;

  let superb = 0;
  let fine = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const error = Math.abs(gaussian() * SIGMA);
    if (error <= superbHalf) superb += 1;
    else if (error <= fineHalf) fine += 1;
  }
  const s = superb / SAMPLES;
  const f = fine / SAMPLES;
  rates[firecraft] = { superb: s, fine: f, common: 1 - s - f };

  console.log(
    `  ${String(firecraft).padStart(9)}  ${windowPct.toFixed(1).padStart(5)}%  ` +
      `${(s * 100).toFixed(1).padStart(6)}%  ${(f * 100).toFixed(1).padStart(5)}%  ` +
      `${((1 - s - f) * 100).toFixed(1).padStart(6)}%`,
  );
}

console.log();
const low = rates[1]!;
const high = rates[20]!;

check(
  "a Firecraft 1 player reaches Superb sometimes",
  low.superb > 0.2,
  `${(low.superb * 100).toFixed(0)}% of cooks`,
);
check(
  "but Superb at Firecraft 1 is not a formality",
  low.superb < 0.8,
  `${(low.superb * 100).toFixed(0)}%`,
);
check(
  "a Firecraft 1 player reaches Fine or better most of the time",
  low.superb + low.fine > 0.6,
  `${((low.superb + low.fine) * 100).toFixed(0)}%`,
);
check(
  "Common is still the outcome of a bad stop",
  low.common > 0.05,
  `${(low.common * 100).toFixed(0)}% at Firecraft 1`,
);
check(
  "mastery matters: Superb is meaningfully likelier at 20 than at 1",
  high.superb - low.superb > 0.2,
  `${(low.superb * 100).toFixed(0)}% -> ${(high.superb * 100).toFixed(0)}%`,
);
check(
  "a Firecraft 20 player almost never drops to Common",
  high.common < 0.05,
  `${(high.common * 100).toFixed(1)}%`,
);

console.log(`\n${failures === 0 ? "test-cooking: OK" : `test-cooking: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
