import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, type Img } from "./lib/image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAPS = path.resolve(here, "..", "client", "public", "assets", "maps");
const COLS = 42, ROWS = 24;

function sample(img: Img, col: number, row: number) {
  const x0 = Math.floor((col / COLS) * img.width), x1 = Math.floor(((col + 1) / COLS) * img.width);
  const y0 = Math.floor((row / ROWS) * img.height), y1 = Math.floor(((row + 1) / ROWS) * img.height);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4;
    r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; n++;
  }
  r /= n; g /= n; b /= n;
  return { r, g, b, luma: 0.299 * r + 0.587 * g + 0.114 * b };
}

for (const [name, file, probes] of [
  ["hub", "map_hub.png", [[28, 12], [20, 17], [10, 8], [36, 18], [2, 2], [20, 3]]],
  ["meadows", "map_meadows.png", [[12, 4], [20, 12], [30, 16], [5, 6], [30, 2], [38, 20]]],
  ["deep_forest", "map_forest.png", [[16, 20], [20, 12], [28, 14], [3, 5], [11, 17], [24, 6]]],
  ["mystical_caves", "map_caves.png", [[16, 20], [20, 12], [10, 14], [27, 4], [1, 3], [33, 16]]],
] as const) {
  const img = load(path.join(MAPS, file));
  const all: number[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) all.push(sample(img, c, r).luma);
  const sorted = [...all].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor((p / 100) * (sorted.length - 1))]!.toFixed(0);
  console.log(`\n${name}: luma p5 ${pct(5)}  p25 ${pct(25)}  p50 ${pct(50)}  p75 ${pct(75)}  p95 ${pct(95)}`);
  for (const [c, r] of probes) {
    const s = sample(img, c, r);
    console.log(`   (${String(c).padStart(2)},${String(r).padStart(2)}) rgb ${s.r.toFixed(0)},${s.g.toFixed(0)},${s.b.toFixed(0)}  luma ${s.luma.toFixed(0)}  g/r ${(s.g / Math.max(1, s.r)).toFixed(2)}  b-r ${(s.b - s.r).toFixed(0)}`);
  }
}
