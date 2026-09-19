/**
 * Turns the painted maps into the grids the game plays on.
 *
 *   npx tsx scripts/build-areas.ts            write the four area files
 *   npx tsx scripts/build-areas.ts --preview  also render what it decided
 *
 * A painting has no tile data, so the walkable mask has to come from somewhere.
 * It comes from two places, in this order:
 *
 *   1. The open regions in scripts/area-layout.json, which say where play
 *      happens at all, minus the blocked rectangles, which are the painted
 *      structures - buildings, the cauldron, the stream, the great root. Those
 *      are placed by hand because no classifier is going to reliably find the
 *      edge of a tavern.
 *   2. A per-cell look at the pixels inside what is left, which removes the
 *      things too small and too many to draw rectangles around: the shrubs,
 *      the boulder piles, the puddles, the mushroom clumps.
 *
 * The result is a first pass. /dev/mapedit exists to correct it, and its saves
 * land in the same files this writes - so a hand correction survives until
 * somebody re-runs this, which is why the generated file says so at the top.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INGREDIENTS, SECTIONS } from "@crazycauldron/shared";
import { PNG } from "pngjs";
import { load, type Img } from "./lib/image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const MAPS = path.join(ROOT, "client", "public", "assets", "maps");
const OUT = path.join(ROOT, "shared", "src", "content", "maps");

interface Rect {
  c: number;
  r: number;
  w: number;
  h: number;
  why?: string;
}

interface Classify {
  minLuma: number;
  water?: { blueOver: number };
  canopy?: { luma: number; greenOver: number };
}

interface AreaSpec {
  id: string;
  map: number;
  name: string;
  image: string;
  classify: Classify;
  open: Rect[];
  blocked: Rect[];
  reopen?: Rect[];
  spawn: { c: number; r: number };
  zones: {
    kind: "building" | "portal" | "scenery";
    id: string;
    name: string;
    c: number;
    r: number;
    w: number;
    h: number;
    baseline?: number;
    section?: number;
    glow?: string;
  }[];
  nodes: { id: string; c: number; r: number }[];
}

interface Layout {
  grid: { cols: number; rows: number; cell: number };
  areas: AreaSpec[];
}

const layout = JSON.parse(
  fs.readFileSync(path.join(here, "area-layout.json"), "utf8"),
) as Layout;

const { cols: COLS, rows: ROWS, cell: CELL } = layout.grid;

const problems: string[] = [];
const note = (message: string) => problems.push(message);

// --------------------------------------------------------------------------
// Looking at the paint
// --------------------------------------------------------------------------

interface Sample {
  r: number;
  g: number;
  b: number;
  luma: number;
}

/**
 * The average colour of one cell.
 *
 * Every pixel in the cell, not a sample of them: the images are 2688 wide and
 * a cell is 64x63, so this is a few million reads per map and takes under a
 * second. Sampling would make the boundary between a shrub and the grass
 * depend on which pixels happened to be chosen.
 */
function cellSample(img: Img, col: number, row: number): Sample {
  const x0 = Math.floor((col / COLS) * img.width);
  const x1 = Math.floor(((col + 1) / COLS) * img.width);
  const y0 = Math.floor((row / ROWS) * img.height);
  const y1 = Math.floor(((row + 1) / ROWS) * img.height);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * img.width + x) * 4;
      r += img.data[i]!;
      g += img.data[i + 1]!;
      b += img.data[i + 2]!;
      n += 1;
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0, luma: 0 };
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, luma: 0.299 * r + 0.587 * g + 0.114 * b };
}

/** Why a cell was blocked, or null if it was not. */
function classify(sample: Sample, rules: Classify): string | null {
  if (sample.luma < rules.minLuma) return "too dark to be floor";
  if (rules.water && sample.b > sample.r + rules.water.blueOver && sample.b > sample.g) {
    return "water";
  }
  if (rules.canopy && sample.luma < rules.canopy.luma && sample.g > sample.r * rules.canopy.greenOver) {
    return "canopy";
  }
  return null;
}

// --------------------------------------------------------------------------
// Building one area
// --------------------------------------------------------------------------

const inRect = (rect: Rect, c: number, r: number) =>
  c >= rect.c && c < rect.c + rect.w && r >= rect.r && r < rect.r + rect.h;

function buildArea(spec: AreaSpec): { file: unknown; mask: boolean[][]; reasons: string[][] } {
  const file = path.join(MAPS, spec.image);
  if (!fs.existsSync(file)) {
    note(`${spec.id}: ${spec.image} is missing`);
    throw new Error(`missing ${spec.image}`);
  }

  const img = load(file);
  const mask: boolean[][] = [];
  const reasons: string[][] = [];

  for (let r = 0; r < ROWS; r += 1) {
    mask.push(new Array<boolean>(COLS).fill(false));
    reasons.push(new Array<string>(COLS).fill(""));
  }

  let auto = 0;
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (!spec.open.some((rect) => inRect(rect, c, r))) {
        reasons[r]![c] = "outside the playable region";
        continue;
      }
      const hit = spec.blocked.find((rect) => inRect(rect, c, r));
      if (hit) {
        reasons[r]![c] = hit.why ?? "blocked by hand";
        continue;
      }

      const why = classify(cellSample(img, c, r), spec.classify);
      if (why) {
        reasons[r]![c] = why;
        auto += 1;
        continue;
      }
      mask[r]![c] = true;
    }
  }

  // Anything the rectangles want back, such as a bridge over a blocked stream.
  for (const rect of spec.reopen ?? []) {
    for (let r = rect.r; r < rect.r + rect.h; r += 1) {
      for (let c = rect.c; c < rect.c + rect.w; c += 1) {
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        mask[r]![c] = true;
        reasons[r]![c] = "";
      }
    }
  }

  const walkableCount = mask.flat().filter(Boolean).length;
  console.log(
    `  ${spec.id.padEnd(16)} ${walkableCount} walkable of ${COLS * ROWS} cells ` +
      `(${auto} removed by looking at the paint)`,
  );

  // --- the things that have to be reachable --------------------------------
  const spawn = { tileX: spec.spawn.c, tileY: spec.spawn.r };
  if (!mask[spawn.tileY]?.[spawn.tileX]) {
    note(`${spec.id}: the spawn at ${spawn.tileX},${spawn.tileY} is not walkable`);
  }

  const reachable = floodFrom(mask, spawn.tileX, spawn.tileY);
  const stranded = walkableCount - reachable.flat().filter(Boolean).length;
  if (stranded > 0) {
    console.log(`  ${" ".repeat(16)} ${stranded} cell(s) walled off from the spawn, closed`);
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (mask[r]![c] && !reachable[r]![c]) {
          mask[r]![c] = false;
          reasons[r]![c] = "cut off from the spawn";
        }
      }
    }
  }

  const zones = spec.zones.map((zone) => ({
    ...zone,
    baseline: zone.baseline ?? zone.r + zone.h - 1,
  }));

  for (const zone of zones) {
    if (zone.kind === "scenery") continue;
    const approach = approachable(mask, zone);
    if (!approach) note(`${spec.id}: ${zone.id} cannot be reached from any walkable cell`);
  }

  const sectionNodes = SECTIONS.find((s) => s.index === spec.map)?.nodes ?? [];
  const nodes = spec.nodes.map((placed) => {
    const known = sectionNodes.find((n) => n.id === placed.id);
    if (!known) note(`${spec.id}: node ${placed.id} is not in sections.json`);
    return { id: placed.id, c: placed.c, r: placed.r, ingredient: known?.ingredient ?? "" };
  });

  for (const node of sectionNodes) {
    if (!spec.nodes.some((n) => n.id === node.id)) {
      note(`${spec.id}: ${node.id} is in sections.json but was never placed`);
    }
  }

  return {
    file: {
      _comment:
        "Generated by scripts/build-areas.ts from the painting and " +
        "scripts/area-layout.json, then corrected by hand in /dev/mapedit. " +
        "Re-running the generator overwrites hand corrections.",
      id: spec.id,
      map: spec.map,
      name: spec.name,
      image: spec.image,
      cell: CELL,
      cols: COLS,
      rows: ROWS,
      generatedAt: new Date().toISOString(),
      spawn: { col: spec.spawn.c, row: spec.spawn.r },
      zones,
      nodes: nodes.map(({ id, c, r }) => ({ id, c, r })),
      walkable: mask.map((row) => row.map((ok) => (ok ? "." : "#")).join("")),
    },
    mask,
    reasons,
  };
}

/** Every cell reachable from one starting cell, walking in eight directions. */
function floodFrom(mask: boolean[][], startC: number, startR: number): boolean[][] {
  const seen: boolean[][] = mask.map((row) => row.map(() => false));
  if (!mask[startR]?.[startC]) return seen;

  const stack = [[startC, startR] as const];
  seen[startR]![startC] = true;

  while (stack.length > 0) {
    const [c, r] = stack.pop()!;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dc === 0 && dr === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
        if (seen[nr]![nc] || !mask[nr]![nc]) continue;
        // A diagonal that squeezes between two blocked corners is not a step.
        if (dc !== 0 && dr !== 0 && !mask[r]![nc] && !mask[nr]![c]) continue;
        seen[nr]![nc] = true;
        stack.push([nc, nr]);
      }
    }
  }
  return seen;
}

/** A walkable cell within reach of a zone, or null if there is none. */
function approachable(mask: boolean[][], zone: { c: number; r: number; w: number; h: number }) {
  const reach = 2;
  for (let r = zone.r - reach; r < zone.r + zone.h + reach; r += 1) {
    for (let c = zone.c - reach; c < zone.c + zone.w + reach; c += 1) {
      if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
      if (mask[r]![c]) return { c, r };
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Checking the placements
// --------------------------------------------------------------------------

function checkPlacements(spec: AreaSpec, mask: boolean[][]) {
  const chebyshev = (a: { c: number; r: number }, b: { c: number; r: number }) =>
    Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));

  for (const node of spec.nodes) {
    if (!mask[node.r]?.[node.c]) {
      note(`${spec.id}: node ${node.id} at ${node.c},${node.r} is not on walkable ground`);
    }

    // A node needs a cell beside it to be gathered from.
    const beside = [-1, 0, 1].some((dr) =>
      [-1, 0, 1].some((dc) => (dc !== 0 || dr !== 0) && mask[node.r + dr]?.[node.c + dc]),
    );
    if (!beside) note(`${spec.id}: node ${node.id} has nowhere to stand beside it`);

    for (const other of spec.nodes) {
      if (other.id === node.id) continue;
      if (chebyshev(node, other) < 2) {
        note(`${spec.id}: nodes ${node.id} and ${other.id} are fewer than 2 cells apart`);
      }
    }

    for (const zone of spec.zones) {
      const dx = Math.max(zone.c - node.c, 0, node.c - (zone.c + zone.w - 1));
      const dy = Math.max(zone.r - node.r, 0, node.r - (zone.r + zone.h - 1));
      if (Math.max(dx, dy) < 2) {
        note(`${spec.id}: node ${node.id} is fewer than 2 cells from zone ${zone.id}`);
      }
    }
  }

  for (const zone of spec.zones) {
    for (const other of spec.zones) {
      if (other.id === zone.id) continue;
      const overlaps =
        zone.c < other.c + other.w &&
        other.c < zone.c + zone.w &&
        zone.r < other.r + other.h &&
        other.r < zone.r + zone.h;
      if (overlaps) note(`${spec.id}: zones ${zone.id} and ${other.id} overlap`);
    }
  }
}

// --------------------------------------------------------------------------
// A picture of what it decided
// --------------------------------------------------------------------------

function preview(spec: AreaSpec, mask: boolean[][]) {
  const CELL_PX = 26;
  const img = load(path.join(MAPS, spec.image));
  const w = COLS * CELL_PX;
  const h = ROWS * CELL_PX;
  const out: Img = { width: w, height: h, data: Buffer.alloc(w * h * 4, 255) };

  const put = (x: number, y: number, r: number, g: number, b: number, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    const alpha = a / 255;
    out.data[i] = Math.round(out.data[i]! * (1 - alpha) + r * alpha);
    out.data[i + 1] = Math.round(out.data[i + 1]! * (1 - alpha) + g * alpha);
    out.data[i + 2] = Math.round(out.data[i + 2]! * (1 - alpha) + b * alpha);
    out.data[i + 3] = 255;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
      const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
      const si = (sy * img.width + sx) * 4;
      const i = (y * w + x) * 4;
      out.data[i] = img.data[si]!;
      out.data[i + 1] = img.data[si + 1]!;
      out.data[i + 2] = img.data[si + 2]!;
      out.data[i + 3] = 255;
    }
  }

  // Blocked cells get a red wash; walkable ones stay as they are.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (mask[r]![c]) continue;
      for (let y = 0; y < CELL_PX; y += 1) {
        for (let x = 0; x < CELL_PX; x += 1) {
          if ((x + y) % 4 !== 0) continue;
          put(c * CELL_PX + x, r * CELL_PX + y, 255, 40, 40, 190);
        }
      }
    }
  }

  const box = (c: number, r: number, cw: number, ch: number, col: [number, number, number]) => {
    for (let x = 0; x < cw * CELL_PX; x += 1) {
      put(c * CELL_PX + x, r * CELL_PX, ...col);
      put(c * CELL_PX + x, (r + ch) * CELL_PX - 1, ...col);
    }
    for (let y = 0; y < ch * CELL_PX; y += 1) {
      put(c * CELL_PX, r * CELL_PX + y, ...col);
      put((c + cw) * CELL_PX - 1, r * CELL_PX + y, ...col);
    }
  };

  for (const zone of spec.zones) {
    const colour: [number, number, number] =
      zone.kind === "portal" ? [80, 200, 255] : zone.kind === "building" ? [255, 220, 80] : [200, 120, 255];
    box(zone.c, zone.r, zone.w, zone.h, colour);
  }

  for (const node of spec.nodes) {
    for (let y = 4; y < CELL_PX - 4; y += 1) {
      for (let x = 4; x < CELL_PX - 4; x += 1) {
        put(node.c * CELL_PX + x, node.r * CELL_PX + y, 120, 255, 120, 200);
      }
    }
  }

  for (let y = 0; y < CELL_PX; y += 1) {
    for (let x = 0; x < CELL_PX; x += 1) {
      put(spec.spawn.c * CELL_PX + x, spec.spawn.r * CELL_PX + y, 255, 255, 255, 170);
    }
  }

  const file = path.join(ROOT, "scripts", "preview", `${spec.id}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(out));
  console.log(`  ${" ".repeat(16)} preview -> scripts/preview/${spec.id}.png`);
}

/** pngjs round trip, kept local so lib/image stays about sprites. */
function encodePng(img: Img): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

// --------------------------------------------------------------------------

function main() {
  console.log("build-areas\n");
  console.log(`  ${COLS}x${ROWS} cells of ${CELL}px = ${COLS * CELL}x${ROWS * CELL} world\n`);

  fs.mkdirSync(OUT, { recursive: true });
  const wantPreview = process.argv.includes("--preview");

  const known = new Set(INGREDIENTS.map((i) => i.id));
  for (const section of SECTIONS) {
    for (const node of section.nodes) {
      if (!known.has(node.ingredient)) note(`${node.id} grows an unknown ingredient`);
    }
  }

  for (const spec of layout.areas) {
    const built = buildArea(spec);
    checkPlacements(spec, built.mask);
    fs.writeFileSync(
      path.join(OUT, `${spec.id}.json`),
      `${JSON.stringify(built.file, null, 2)}\n`,
    );
    if (wantPreview) preview(spec, built.mask);
  }

  console.log("");
  if (problems.length === 0) {
    console.log("build-areas: OK");
    return;
  }
  console.log(`build-areas: ${problems.length} problem(s)`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}

main();
