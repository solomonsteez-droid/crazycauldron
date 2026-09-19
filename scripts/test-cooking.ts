/**
 * Measures how often the heat bar pays out Fine and Superb, and solves for the
 * window sizes that hit a target distribution.
 *
 *   npx tsx scripts/test-cooking.ts            report
 *   npx tsx scripts/test-cooking.ts --tune     search for windows
 *
 * The player model is an error in *milliseconds*, not in bar-widths: a human
 * clicks a little early or late, and the marker speed decides how far along the
 * bar that lands. Modelling it as a fixed positional error hides the effect of
 * the speed entirely.
 */

import { CONFIG, timingWindowPct, type SkillLevels } from "@crazycauldron/shared";

/** Average absolute timing error of the modelled player. */
const MEAN_ERROR_MS = 60;
/** A half-normal with this sigma has that mean: mean = sigma * sqrt(2/pi). */
const SIGMA_MS = MEAN_ERROR_MS / Math.sqrt(2 / Math.PI);

/** What the retune is aiming at, as {superb, fine} at level 1 and level 20. */
const TARGETS = {
  1: { superb: 0.15, fine: 0.4 },
  20: { superb: 0.7, fine: 0.25 },
} as const;

const sweeps = (speedMultiplier: number) => 3 * speedMultiplier;
/** Timing sigma expressed as a fraction of the bar. */
const positionSigma = (speedMultiplier: number) =>
  (SIGMA_MS * sweeps(speedMultiplier)) / CONFIG.cooking.barMs;

/** Normal CDF via Abramowitz & Stegun 7.1.26. */
function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return x >= 0 ? 0.5 + y / 2 : 0.5 - y / 2;
}

/** Chance the stop lands within `halfWidth` bar-widths of the centre. */
const within = (halfWidth: number, sigma: number) => 2 * normalCdf(halfWidth / sigma) - 1;

interface Mix {
  superb: number;
  fine: number;
  common: number;
}

/** Outcome distribution for one window, analytically rather than by sampling. */
function mixFor(windowPct: number, fineMultiplier: number, sigma: number): Mix {
  const superb = within(windowPct / 200, sigma);
  const fine = Math.max(within((windowPct * fineMultiplier) / 200, sigma) - superb, 0);
  return { superb, fine, common: Math.max(1 - superb - fine, 0) };
}

function windowAt(level: number, atOne: number, atTwenty: number): number {
  const t = (level - 1) / 19;
  return atOne + (atTwenty - atOne) * t;
}

function levelsAt(firecraft: number): SkillLevels {
  return { foraging: 1, prospecting: 1, knifework: 1, firecraft, spicecraft: 1 };
}

// --------------------------------------------------------------------------

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
};

function report() {
  const sigma = positionSigma(CONFIG.cooking.markerSpeedMultiplier);
  console.log("test-cooking\n");
  console.log(
    `  marker x${CONFIG.cooking.markerSpeedMultiplier} (${sweeps(
      CONFIG.cooking.markerSpeedMultiplier,
    ).toFixed(2)} sweeps), Fine ${CONFIG.cooking.fineWindowMultiplier}x Superb`,
  );
  console.log(
    `  player error ${MEAN_ERROR_MS}ms average = ${(sigma * 100).toFixed(1)}% of the bar\n`,
  );
  console.log("  firecraft  window   superb    fine   common");
  console.log("  ---------  ------   ------   -----   ------");

  const rates: Record<number, Mix> = {};
  for (const firecraft of [1, 5, 10, 15, 20]) {
    const windowPct = timingWindowPct(levelsAt(firecraft), 0);
    const mix = mixFor(windowPct, CONFIG.cooking.fineWindowMultiplier, sigma);
    rates[firecraft] = mix;
    console.log(
      `  ${String(firecraft).padStart(9)}  ${windowPct.toFixed(1).padStart(5)}%  ` +
        `${(mix.superb * 100).toFixed(1).padStart(6)}%  ${(mix.fine * 100).toFixed(1).padStart(5)}%  ` +
        `${(mix.common * 100).toFixed(1).padStart(6)}%`,
    );
  }

  console.log();
  // Within 6 points of target is close enough for a feel curve; the two ends
  // cannot both be hit exactly with a single Fine multiplier.
  const near = (got: number, want: number) => Math.abs(got - want) <= 0.06;
  const low = rates[1]!;
  const high = rates[20]!;

  check(
    "Firecraft 1 Superb is near 15%",
    near(low.superb, TARGETS[1].superb),
    `${(low.superb * 100).toFixed(1)}%`,
  );
  check(
    "Firecraft 1 Fine is near 40%",
    near(low.fine, TARGETS[1].fine),
    `${(low.fine * 100).toFixed(1)}%`,
  );
  check(
    "Firecraft 1 Common is near 45%",
    near(low.common, 0.45),
    `${(low.common * 100).toFixed(1)}%`,
  );
  check(
    "Firecraft 20 Superb is near 70%",
    near(high.superb, TARGETS[20].superb),
    `${(high.superb * 100).toFixed(1)}%`,
  );
  check(
    "Firecraft 20 Fine is near 25%",
    near(high.fine, TARGETS[20].fine),
    `${(high.fine * 100).toFixed(1)}%`,
  );
  check(
    "five Superbs in a row is unlikely at Firecraft 1",
    low.superb ** 5 < 0.01,
    `${(low.superb ** 5 * 100).toFixed(2)}% chance`,
  );

  console.log(`\n${failures === 0 ? "test-cooking: OK" : `test-cooking: ${failures} failure(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Searches window sizes for the closest fit to the targets.
 *
 * The two ends pull the Fine multiplier in opposite directions - level 1 wants
 * roughly 4x the Superb window, level 20 roughly 1.9x - so no single value hits
 * all four numbers. The search minimises the total squared miss and prints what
 * it settled for.
 */
function tune() {
  const speed = CONFIG.cooking.markerSpeedMultiplier;
  const sigma = positionSigma(speed);
  console.log(`searching windows at marker x${speed} (sigma ${(sigma * 100).toFixed(2)}% of bar)\n`);

  let best: { one: number; twenty: number; multiplier: number; error: number } | null = null;

  for (let one = 1; one <= 20; one += 0.1) {
    for (let twenty = one; twenty <= 60; twenty += 0.25) {
      for (let multiplier = 1.2; multiplier <= 5; multiplier += 0.05) {
        const a = mixFor(one, multiplier, sigma);
        const b = mixFor(twenty, multiplier, sigma);
        const error =
          (a.superb - TARGETS[1].superb) ** 2 +
          (a.fine - TARGETS[1].fine) ** 2 +
          (b.superb - TARGETS[20].superb) ** 2 +
          (b.fine - TARGETS[20].fine) ** 2;
        if (!best || error < best.error) best = { one, twenty, multiplier, error };
      }
    }
  }

  if (!best) return;
  const a = mixFor(best.one, best.multiplier, sigma);
  const b = mixFor(best.twenty, best.multiplier, sigma);
  console.log(
    `  windowPctAtLevel1  ${best.one.toFixed(1)}\n` +
      `  windowPctAtLevel20 ${best.twenty.toFixed(1)}\n` +
      `  fineWindowMultiplier ${best.multiplier.toFixed(2)}\n`,
  );
  console.log(
    `  level  1: superb ${(a.superb * 100).toFixed(1)}% (target 15) ` +
      `fine ${(a.fine * 100).toFixed(1)}% (40) common ${(a.common * 100).toFixed(1)}% (45)`,
  );
  console.log(
    `  level 20: superb ${(b.superb * 100).toFixed(1)}% (target 70) ` +
      `fine ${(b.fine * 100).toFixed(1)}% (25) common ${(b.common * 100).toFixed(1)}% (5)`,
  );
  console.log("\nSet those in shared/src/content/skills.json and re-run without --tune.");
}

if (process.argv.includes("--tune")) tune();
else report();
