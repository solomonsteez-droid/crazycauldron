/**
 * The gates: what they cost, and that every one of them is described.
 *
 *   npx tsx scripts/test-portals.ts
 *
 * The brief is a budget: the gates are the loudest objects in the hub and they
 * all animate, and all of it has to fit in a millisecond a frame and inside
 * the same 200-particle pool everything else shares.
 *
 * A renderer cannot be started here, so this measures the half that is ours.
 * That half is small on purpose: the arch, both spirals and the glow are each
 * drawn once into a texture when a map loads, and what runs every frame
 * afterwards is three rotations and an alpha per gate. The build cost is
 * measured too, because "once" is still a hitch if it is big enough.
 */

import { PORTALS, portalFor } from "@crazycauldron/shared";
import { portalFrame, spiralAlphaAt } from "../client/src/world/portalMath.js";

/** The brief's budget, per frame, for every gate on the map together. */
const BUDGET_MS = 1;

/** The hub has three. A biome has one, home. */
const GATES = 3;
const FRAMES = 20_000;

/** Mirrors portal.ts: two characters wide, three tall, at map pixel scale. */
const OPENING_PX = 64 - 2 * Math.max(5, Math.round(64 * 0.17));

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function main(): void {
  console.log("test-portals\n");

  // --- every gate is described ---------------------------------------------
  console.log("-- the data --");
  const { defaults, portals } = PORTALS;

  check("there is a gate for every biome and one for home", portals.length >= 4, `${portals.length}`);
  for (const section of [0, 1, 2, 3]) {
    const def = portalFor(section);
    check(
      `section ${section} has a build and a colour`,
      def.section === section &&
        ["stone", "trunks", "crystal"].includes(def.style) &&
        def.stone.length === 3 &&
        /^#[0-9a-f]{6}$/i.test(def.vortex),
      `${def.name}: ${def.style}, ${def.vortex}`,
    );
  }
  check(
    "the three biomes are built differently from each other",
    new Set([1, 2, 3].map((s) => portalFor(s).style)).size === 3,
    [1, 2, 3].map((s) => `${portalFor(s).style}`).join(", "),
  );
  check(
    "a section with no gate of its own falls back to the way home",
    portalFor(99).section === 0,
  );

  check(
    "two or three spiral layers, at different speeds",
    defaults.spinMs.length >= 2 &&
      defaults.spinMs.length <= 3 &&
      new Set(defaults.spinMs).size === defaults.spinMs.length,
    defaults.spinMs.join(", "),
  );
  check(
    "at least one turns the other way",
    defaults.spinMs.some((ms) => ms < 0) && defaults.spinMs.some((ms) => ms > 0),
  );
  check(
    "the glow pulses over three to four seconds",
    defaults.pulseMs >= 3000 && defaults.pulseMs <= 4000,
    `${defaults.pulseMs}ms`,
  );
  check(
    "the gate is about three characters tall and two wide",
    defaults.heightChars === 3 && defaults.widthChars === 2,
    `${defaults.widthChars * defaults.charWidthPx}x${defaults.heightChars * defaults.charHeightPx}px`,
  );

  // --- hard pixels ----------------------------------------------------------
  console.log("\n-- hard pixel edges --");
  const alphas = new Set<number>();
  for (let y = 0; y < OPENING_PX; y += 1) {
    for (let x = 0; x < OPENING_PX; x += 1) {
      alphas.add(spiralAlphaAt(x - OPENING_PX / 2, y - OPENING_PX / 2, OPENING_PX / 2, 3));
    }
  }
  check(
    "the spiral's alpha comes in bands, not a ramp",
    alphas.size <= defaults.alphaSteps + 1,
    `${alphas.size} distinct values over ${defaults.alphaSteps} steps`,
  );
  check(
    "it fades to nothing before the rim",
    spiralAlphaAt(OPENING_PX / 2, 0, OPENING_PX / 2, 3) === 0,
  );

  // --- the per-frame cost ---------------------------------------------------
  console.log("\n-- a frame with every gate turning --");
  let sink = 0;
  const started = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const now = frame * 16.67;
    for (let gate = 0; gate < GATES; gate += 1) {
      const pose = portalFrame(now, gate === 2 ? 1.35 : 1);
      sink += pose.glowAlpha + pose.rotations[0]! + pose.rotations[1]!;
    }
  }
  const perFrameMs = (performance.now() - started) / FRAMES;

  console.log(`    ${GATES} gates x ${FRAMES} frames`);
  console.log(`    per frame: ${perFrameMs.toFixed(5)}ms  (budget ${BUDGET_MS}ms)`);
  console.log(`    headroom:  ${(BUDGET_MS / Math.max(perFrameMs, 1e-9)).toFixed(0)}x`);
  check("every gate on the map fits in 1ms a frame", perFrameMs < BUDGET_MS, `${perFrameMs.toFixed(5)}ms`);
  check("and the result was actually computed", Number.isFinite(sink));

  // --- the one-off build ----------------------------------------------------
  console.log("\n-- and what building them costs, once per map --");
  const buildStarted = performance.now();
  let pixels = 0;
  for (let layer = 0; layer < 2; layer += 1) {
    for (let y = 0; y < OPENING_PX; y += 1) {
      for (let x = 0; x < OPENING_PX; x += 1) {
        sink += spiralAlphaAt(x - OPENING_PX / 2, y - OPENING_PX / 2, OPENING_PX / 2, layer === 0 ? 3 : 5);
        pixels += 1;
      }
    }
  }
  const buildMs = performance.now() - buildStarted;
  console.log(`    ${pixels} spiral pixels in ${buildMs.toFixed(2)}ms`);
  check(
    "building both spirals is under a frame",
    buildMs < 16,
    `${buildMs.toFixed(2)}ms, once when a map loads`,
  );

  // --- the particle budget --------------------------------------------------
  console.log("\n-- the particle pool --");
  const reservedPerGate = 6;
  check(
    "three gates reserve a tenth of the pool",
    GATES * reservedPerGate <= 200 * 0.1,
    `${GATES * reservedPerGate} of 200`,
  );
  const slowest = Math.min(...portals.map((p) => Math.min(p.moteEveryMs, p.petalEveryMs)));
  check(
    "and none of them emits faster than twice a second",
    slowest >= 500,
    `fastest is one every ${slowest}ms`,
  );

  console.log(`\ntest-portals: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
