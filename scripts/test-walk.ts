/**
 * The walk: that it advances, and that the art has a stride in it.
 *
 *   npx tsx scripts/test-walk.ts
 *
 * Two things, and they failed independently.
 *
 * The first is the one a player saw: walking up showed no leg motion at all.
 * The cycle is played from `client/src/world/gait.ts` now - a pure function of
 * how long the figure has been walking - so this can play a second of every
 * direction for every body and count how many times the drawing changes. It
 * could not be tested while the walk was a Phaser animation, because a
 * Phaser animation needs a browser.
 *
 * The second is why it looked that way. Four plainly different drawings are
 * not a walk if what differs between them is the arms and the shading: the up
 * sheets score as the *most* different of the four directions and their feet
 * travel a fifth of a pixel across the whole cycle. So the sheets are measured
 * here as well, and a direction with no stride is named rather than left for
 * somebody to notice in a recording.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CYCLE, contactFrames, frameChanges, gaitPose } from "../client/src/world/gait.js";
import type { WalkCycleData } from "../client/src/world/gait.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const MANIFEST = path.join(ROOT, "client", "public", "assets", "generated", "manifest.json");

const DIRECTIONS = ["down", "up", "left", "right"] as const;

/** One second of walking must change the drawing at least this many times. */
const MIN_CHANGES_PER_SECOND = 4;

interface ManifestCycle extends WalkCycleData {
  pingPong: boolean;
  footSpread?: number[];
  footTravel?: number;
  strideless?: boolean;
}

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function main(): void {
  console.log("test-walk\n");

  if (!fs.existsSync(MANIFEST)) {
    check("there is a sprite manifest", false, "run npm run sprites");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as {
    bodies: Record<string, { walk?: Record<string, ManifestCycle> }>;
  };
  const bodies = Object.keys(manifest.bodies);
  check("there are bodies to walk", bodies.length > 0, bodies.join(", "));

  // --- a second of each direction ------------------------------------------
  console.log("\n-- one second of walking, per body and direction --");
  for (const body of bodies) {
    for (const direction of DIRECTIONS) {
      const cycle = manifest.bodies[body]?.walk?.[direction] ?? DEFAULT_CYCLE;
      const changes = frameChanges(cycle, 1000);
      check(
        `${body} ${direction}`,
        changes >= MIN_CHANGES_PER_SECOND,
        `${changes} frame changes, order ${cycle.order.join("-")} at ${cycle.frameRate} fps`,
      );
    }
  }

  // --- and it is the right frames, in the right order -----------------------
  console.log("\n-- the cycle is the one the pipeline decided on --");
  for (const body of bodies) {
    for (const direction of DIRECTIONS) {
      const cycle = manifest.bodies[body]?.walk?.[direction] ?? DEFAULT_CYCLE;
      const frameMs = 1000 / cycle.frameRate;

      const played = cycle.order.map(
        (_, step) => gaitPose(cycle, step * frameMs + frameMs / 2, direction).sourceFrame,
      );
      check(
        `${body} ${direction} plays ${cycle.order.join("-")}`,
        played.join("-") === cycle.order.join("-"),
        played.join("-"),
      );
    }
  }

  // --- the stride never resets ----------------------------------------------
  console.log("\n-- the stride is a clock, not a state machine --");
  const cycle = manifest.bodies[bodies[0]!]?.walk?.down ?? DEFAULT_CYCLE;
  check(
    "the same elapsed time always gives the same frame",
    gaitPose(cycle, 517, "down").sourceFrame === gaitPose(cycle, 517, "down").sourceFrame,
  );
  check(
    "and it loops rather than running off the end",
    gaitPose(cycle, 60_000, "down").sourceFrame ===
      gaitPose(cycle, 60_000 % (cycle.order.length * (1000 / cycle.frameRate)), "down")
        .sourceFrame,
  );

  // --- the bob, the lean and the footfalls ----------------------------------
  console.log("\n-- the procedural motion --");
  const walk = manifest.bodies[bodies[0]!]?.walk?.down ?? DEFAULT_CYCLE;
  const frameMs = 1000 / walk.frameRate;
  const poses = walk.order.map((_, step) => gaitPose(walk, step * frameMs + 1, "down"));

  check(
    "the body bobs two pixels and never more",
    poses.every((pose) => pose.bobY === 0 || pose.bobY === -2),
    [...new Set(poses.map((p) => p.bobY))].join(", "),
  );
  check(
    "it is up on the passing frames and level on the contacts",
    poses.every((pose) => (pose.contact ? pose.bobY === 0 : pose.bobY === -2)),
  );
  check(
    "there is at least one footfall per cycle",
    poses.some((pose) => pose.contact),
    `${poses.filter((p) => p.contact).length} of ${poses.length} steps`,
  );
  check(
    "the lean is one pixel, either way",
    poses.every((pose) => Math.abs(pose.leanX) === 1),
  );
  check(
    "walking left leans left and right leans right",
    gaitPose(walk, 0, "left").leanX === -1 && gaitPose(walk, 0, "right").leanX === 1,
  );
  check(
    "every contact frame is one the pipeline named",
    poses.every((pose) => pose.contact === contactFrames(walk).has(pose.sourceFrame)),
  );

  // --- the art itself -------------------------------------------------------
  console.log("\n-- and whether the sheets have a stride in them --");
  const weak: string[] = [];
  for (const body of bodies) {
    for (const direction of DIRECTIONS) {
      const measured = manifest.bodies[body]?.walk?.[direction];
      if (!measured || measured.footTravel === undefined) continue;

      const line =
        `spread ${measured.footSpread?.join("/") ?? "?"}px, travel ${measured.footTravel}px`;
      if (measured.strideless) weak.push(`${body} walk_${direction} (${line})`);
      console.log(`  ${measured.strideless ? "weak" : "ok  "} ${body} ${direction} - ${line}`);
    }
  }

  /*
   * Not a failure. The art is what it is, and the client's own bob is what
   * makes these read as walking until they are redrawn - so this prints the
   * list rather than failing the suite over a drawing.
   */
  console.log(
    weak.length === 0
      ? "\n  every sheet has a stride"
      : `\n  ${weak.length} sheet(s) with no stride, carried by the procedural bob:\n    ${weak.join("\n    ")}`,
  );

  console.log(`\ntest-walk: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
