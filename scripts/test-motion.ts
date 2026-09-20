/**
 * What the world motion costs per frame, and where it lands on each map.
 *
 *   npx tsx scripts/test-motion.ts
 *
 * The brief is a budget: ambience under 4 ms of frame time at a phone-sized
 * viewport. A renderer cannot be started here, so this measures the half that
 * is ours - the arithmetic that runs on every moving object on every frame -
 * at the full budget the game will ever hold, and reports it against 4 ms.
 *
 * The other half is the GPU drawing the sprites, which is why the counts are
 * reported too: what matters there is how many extra draws a frame carries,
 * and that number is small and fixed by a reservation rather than growing with
 * the map.
 *
 * It also checks the grass actually lands on grass. The tufts are placed by
 * sampling each painting rather than from a list, so this reads the real
 * images and reports what the sampler found - a map that has stopped producing
 * grass is a map whose art changed under the thresholds.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { AREAS, CELL, anchorsFor } from "@crazycauldron/shared";
import {
  edgeWeight,
  glowPose,
  isGrassColour,
  shaftAlpha,
  shimmerPose,
  tuftPose,
} from "../client/src/world/motionMath.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

/** The budget the world motion reserves; mirrors motion.ts. */
const MAX_TUFTS = 44;
const MAX_SHIMMER = 14;
const MAX_GLOWS = 14;
const MAX_SHAFTS = 1;

/** A phone at 390x844, the viewport the mobile audit uses. */
const VIEWPORT = { width: 390, height: 844 };
/** Frames measured. Enough to swamp the timer's own resolution. */
const FRAMES = 2000;
const BUDGET_MS = 4;

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Average colour per cell, exactly as the client samples it at runtime. */
function sampleCells(image: PNG, cols: number, rows: number): Uint8Array {
  const out = new Uint8Array(cols * rows * 4);
  const cellW = image.width / cols;
  const cellH = image.height / rows;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let n = 0;
      const x0 = Math.floor(c * cellW);
      const y0 = Math.floor(r * cellH);
      const x1 = Math.min(image.width, Math.floor((c + 1) * cellW));
      const y1 = Math.min(image.height, Math.floor((r + 1) * cellH));

      // Every fourth pixel: the average of a quarter of a cell is the average
      // of the cell, and this runs over four 2688x1520 paintings.
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * image.width + x) * 4;
          red += image.data[i]!;
          green += image.data[i + 1]!;
          blue += image.data[i + 2]!;
          n += 1;
        }
      }
      if (n === 0) continue;
      const o = (r * cols + c) * 4;
      out[o] = Math.round(red / n);
      out[o + 1] = Math.round(green / n);
      out[o + 2] = Math.round(blue / n);
      out[o + 3] = 255;
    }
  }
  return out;
}

interface Placed {
  tufts: { x: number; phase: number }[];
  grassCells: number;
}

function placeGrass(area: (typeof AREAS)[number], cells: Uint8Array): Placed {
  const candidates: { c: number; r: number; weight: number }[] = [];
  for (let r = 0; r < area.rows; r += 1) {
    for (let c = 0; c < area.cols; c += 1) {
      const i = (r * area.cols + c) * 4;
      if (!isGrassColour(cells[i]!, cells[i + 1]!, cells[i + 2]!)) continue;
      candidates.push({ c, r, weight: edgeWeight(c, r, area.cols, area.rows) });
    }
  }

  candidates.sort((a, b) => b.weight * Math.random() - a.weight * Math.random());
  return {
    grassCells: candidates.length,
    tufts: candidates.slice(0, MAX_TUFTS).map((cell) => ({
      x: cell.c * CELL + CELL / 2,
      phase: Math.random() * Math.PI * 2,
    })),
  };
}

function main(): void {
  console.log("test-motion\n");
  console.log(`  viewport ${VIEWPORT.width}x${VIEWPORT.height}, budget ${BUDGET_MS}ms/frame\n`);

  // --- where the motion lands ---------------------------------------------
  console.log("  map              grass cells  tufts  water  lights  shaft");
  console.log("  ---------------  -----------  -----  -----  ------  -----");

  const placements: Record<number, Placed> = {};
  for (const area of AREAS) {
    const file = path.join(ROOT, "client", "public", "assets", "maps", area.image);
    if (!fs.existsSync(file)) {
      check(`${area.id}: painting is present`, false, area.image);
      continue;
    }

    const cells = sampleCells(PNG.sync.read(fs.readFileSync(file)), area.cols, area.rows);
    const placed = placeGrass(area, cells);
    placements[area.map] = placed;

    const anchors = anchorsFor(area.map);
    const lights = (anchors.lanterns ?? []).length + (anchors.windows ?? []).length;
    console.log(
      `  ${area.id.padEnd(15)}  ${String(placed.grassCells).padStart(11)}  ` +
        `${String(placed.tufts.length).padStart(5)}  ` +
        `${String((anchors.water ?? []).length).padStart(5)}  ` +
        `${String(lights).padStart(6)}  ${anchors.shaft ? "  yes" : "   no"}`,
    );
  }

  console.log();

  /*
   * Grass where there is ground, and none underground. The caves are the check
   * that matters: a threshold loose enough to grow grass on stone is one that
   * is calling something green that is not, and it would show up as tufts
   * waving on a cave floor.
   */
  for (const area of AREAS.filter((a) => a.map !== 3)) {
    const placed = placements[area.map];
    if (!placed) continue;
    check(
      `${area.id} has ground for tufts to stand on`,
      placed.tufts.length >= 20,
      `${placed.grassCells} grassy cells, ${placed.tufts.length} tufts`,
    );
  }
  check(
    "and nothing grows in the caves",
    (placements[3]?.grassCells ?? 0) === 0,
    `${placements[3]?.grassCells ?? 0} cells`,
  );

  // --- what a frame costs --------------------------------------------------
  console.log("\n  a frame at full budget:");

  const tufts = placements[0]?.tufts ?? [];
  const padded = [...tufts];
  while (padded.length < MAX_TUFTS) padded.push({ x: Math.random() * 1008, phase: Math.random() });

  const shimmers = Array.from({ length: MAX_SHIMMER }, () => ({
    phase: Math.random() * Math.PI * 2,
    baseAlpha: 0.16,
  }));
  const glows = Array.from({ length: MAX_GLOWS }, () => ({
    phase: Math.random() * Math.PI * 2,
    strength: Math.random() < 0.5 ? 1 : 0.65,
    baseScale: 1.5,
  }));

  const periodMs = 8000;
  const width = 1008;

  // Consumed so the arithmetic cannot be optimised away as dead code.
  let sink = 0;

  const startedAt = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const now = frame * 16.67;
    const night = 0.5;

    for (const tuft of padded) {
      const pose = tuftPose(now, tuft.x, tuft.phase, periodMs, width);
      sink += pose.angle + (pose.leaning ? 1 : 0);
    }
    for (const shimmer of shimmers) {
      const pose = shimmerPose(now, shimmer.phase, shimmer.baseAlpha);
      sink += pose.alpha + pose.scaleY;
    }
    for (const glow of glows) {
      const pose = glowPose(now, glow.phase, glow.strength, night, glow.baseScale);
      sink += pose.alpha + pose.scale;
    }
    sink += shaftAlpha(now, night);
  }
  const perFrameMs = (performance.now() - startedAt) / FRAMES;

  const objects = MAX_TUFTS + MAX_SHIMMER + MAX_GLOWS + MAX_SHAFTS;
  console.log(`    ${objects} persistent objects updated (${MAX_TUFTS} tufts, ` +
    `${MAX_SHIMMER} water, ${MAX_GLOWS} lights, ${MAX_SHAFTS} shaft)`);
  console.log(`    ${FRAMES} frames in ${(perFrameMs * FRAMES).toFixed(1)}ms`);
  console.log(`    per frame: ${perFrameMs.toFixed(4)}ms  (budget ${BUDGET_MS}ms)`);
  console.log(`    headroom:  ${(BUDGET_MS / Math.max(perFrameMs, 1e-9)).toFixed(0)}x`);
  if (sink === Number.POSITIVE_INFINITY) console.log("unreachable");

  console.log();
  check(
    `the per-frame arithmetic is inside ${BUDGET_MS}ms`,
    perFrameMs < BUDGET_MS,
    `${perFrameMs.toFixed(4)}ms`,
  );
  check(
    "and leaves most of the budget for drawing",
    perFrameMs < BUDGET_MS / 10,
    `${((perFrameMs / BUDGET_MS) * 100).toFixed(2)}% of it`,
  );
  check(
    "the persistent objects fit in half the particle pool",
    objects <= 100,
    `${objects} of a 200 pool`,
  );

  console.log(`\ntest-motion: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
