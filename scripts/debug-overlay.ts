/**
 * Shows what the overlay subtraction is actually doing.
 *
 * Writes a contact sheet per garment - base pose, the dressed figure after
 * alignment, and the difference that survives - so a bad overlay can be looked
 * at rather than guessed about.
 *
 *   npx tsx scripts/debug-overlay.ts hat_01_chef
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  alphaBounds,
  bestAlignment,
  blank,
  blit,
  crop,
  denoise,
  differenceMask,
  findBlobs,
  load,
  readingOrder,
  removeChroma,
  rowWidths,
  save,
  scaleNearest,
  type Img,
  type Rect,
} from "./lib/image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const SRC = path.join(ROOT, "client", "public", "assets", "sprites");
const OUT = path.join(ROOT, "client", "public", "assets", "generated", "_debug");

function shoulderRow(body: Img, bounds: Rect): number {
  const widths = rowWidths(body);
  const headBand = widths.slice(bounds.y, bounds.y + Math.round(bounds.height * 0.35));
  const headWidth = Math.max(1, Math.max(...headBand));
  for (let y = bounds.y + Math.round(bounds.height * 0.15); y < bounds.y + bounds.height; y += 1) {
    if ((widths[y] ?? 0) > headWidth * 1.25) return y;
  }
  return bounds.y + Math.round(bounds.height * 0.42);
}

const target = process.argv[2] ?? "hat_01_chef";
const kind = target.startsWith("hat") ? "hats" : "aprons";

const idle = denoise(removeChroma(load(path.join(SRC, "characters", "male_idle.png"))));
const cells = readingOrder(findBlobs(idle, 2000).slice(0, 4));
const frontCell = cells[0]!;
const base = blank(idle.width, idle.height);
blit(base, crop(idle, frontCell), frontCell.x, frontCell.y);
const baseBounds = alphaBounds(base)!;
const shoulder = shoulderRow(base, baseBounds);

const dressed = denoise(removeChroma(load(path.join(SRC, kind, `${target}.png`))));
const dressedBounds = alphaBounds(dressed)!;

console.log(`base   bbox ${JSON.stringify(baseBounds)}  shoulder row ${shoulder}`);
console.log(`${target} bbox ${JSON.stringify(dressedBounds)}`);

/*
 * Scale first. The drops are single large portraits while the idle sheet packs
 * four small figures into one canvas, so they differ by roughly 4x - and a
 * translation-only search can never reconcile that.
 *
 * The reference is the widest row in the lower part of the figure: shoulders
 * and torso, which both drawings share whatever is on the head.
 */
function bodyWidth(img: Img, bounds: Rect): number {
  const widths = rowWidths(img);
  const from = bounds.y + Math.round(bounds.height * 0.4);
  const to = bounds.y + bounds.height;
  let widest = 1;
  for (let y = from; y < to; y += 1) widest = Math.max(widest, widths[y] ?? 0);
  return widest;
}

const baseBody = bodyWidth(base, baseBounds);
const dressedBody = bodyWidth(dressed, dressedBounds);
const scale = baseBody / dressedBody;
console.log(`torso width: base ${baseBody}, ${target} ${dressedBody} -> scale ${scale.toFixed(4)}`);

const scaledW = Math.max(1, Math.round(dressed.width * scale));
const scaledH = Math.max(1, Math.round(dressed.height * scale));
const scaled = scaleNearest(dressed, scaledW, scaledH);
const padded = blank(base.width, base.height);
blit(padded, scaled, 0, 0);

const compare: Rect = {
  x: baseBounds.x,
  y: shoulder,
  width: baseBounds.width,
  height: Math.round(baseBounds.height * 0.35),
};
const offset = bestAlignment(base, padded, compare, 8, 400);
console.log(`alignment dx ${offset.dx} dy ${offset.dy} score ${Math.round(offset.score)}`);

// How much of the shared torso actually agrees once aligned?
let same = 0;
let differ = 0;
for (let y = compare.y; y < compare.y + compare.height; y += 1) {
  for (let x = compare.x; x < compare.x + compare.width; x += 1) {
    const bi = (y * base.width + x) * 4;
    const mi = ((y + offset.dy) * padded.width + (x + offset.dx)) * 4;
    if (base.data[bi + 3]! < 24 || padded.data[mi + 3]! < 24) continue;
    const dr = base.data[bi]! - padded.data[mi]!;
    const dg = base.data[bi + 1]! - padded.data[mi + 1]!;
    const db = base.data[bi + 2]! - padded.data[mi + 2]!;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > 60) differ += 1;
    else same += 1;
  }
}
const agreement = same / Math.max(same + differ, 1);
console.log(
  `torso agreement after alignment: ${(agreement * 100).toFixed(1)}% ` +
    `(${same} same, ${differ} differ)`,
);

const diff = differenceMask(base, padded, offset);
const diffBounds = alphaBounds(denoise(diff, 4));
console.log(`diff bbox ${JSON.stringify(diffBounds)}`);

// Contact sheet, scaled down so it is viewable.
const shrink = 4;
const panelW = Math.round(base.width / shrink);
const panelH = Math.round(base.height / shrink);
const sheet = blank(panelW * 3, panelH);

const shifted = blank(padded.width, padded.height);
for (let y = 0; y < padded.height; y += 1) {
  for (let x = 0; x < padded.width; x += 1) {
    const sx = x + offset.dx;
    const sy = y + offset.dy;
    if (sx < 0 || sy < 0 || sx >= padded.width || sy >= padded.height) continue;
    const si = (sy * padded.width + sx) * 4;
    padded.data.copy(shifted.data, (y * shifted.width + x) * 4, si, si + 4);
  }
}

blit(sheet, scaleNearest(base, panelW, panelH), 0, 0);
blit(sheet, scaleNearest(shifted, panelW, panelH), panelW, 0);
blit(sheet, scaleNearest(diff, panelW, panelH), panelW * 2, 0);

fs.mkdirSync(OUT, { recursive: true });
save(path.join(OUT, `${target}.png`), sheet);
console.log(`\nwrote generated/_debug/${target}.png (base | aligned | diff)`);
