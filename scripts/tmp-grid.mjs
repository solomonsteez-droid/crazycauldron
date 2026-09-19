import fs from "node:fs";
import { PNG } from "pngjs";

const COLS = 42;
const ROWS = 24;
/** Each cell drawn this big in the preview. */
const CELL = 26;

const src = PNG.sync.read(fs.readFileSync(process.argv[2]));
const w = COLS * CELL;
const h = ROWS * CELL;
const dst = new PNG({ width: w, height: h });

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor((x / w) * src.width));
    const sy = Math.min(src.height - 1, Math.floor((y / h) * src.height));
    const si = (sy * src.width + sx) * 4;
    const di = (y * w + x) * 4;
    dst.data[di] = src.data[si];
    dst.data[di + 1] = src.data[si + 1];
    dst.data[di + 2] = src.data[si + 2];
    dst.data[di + 3] = 255;
  }
}

const line = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  dst.data[i] = r;
  dst.data[i + 1] = g;
  dst.data[i + 2] = b;
};

for (let c = 0; c <= COLS; c++) {
  const bold = c % 5 === 0;
  for (let y = 0; y < h; y++) {
    if (!bold && y % 4 > 1) continue;
    line(c * CELL, y, bold ? 255 : 200, bold ? 60 : 200, bold ? 60 : 200);
  }
}
for (let r = 0; r <= ROWS; r++) {
  const bold = r % 5 === 0;
  for (let x = 0; x < w; x++) {
    if (!bold && x % 4 > 1) continue;
    line(x, r * CELL, bold ? 255 : 200, bold ? 60 : 200, bold ? 60 : 200);
  }
}

// A 3x5 digit stamp, so the bold lines can be counted without guessing.
const GLYPHS = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
};

function stamp(text, atX, atY) {
  let cursor = atX;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (glyph[gy][gx] !== "1") continue;
        for (let py = 0; py < 2; py++) {
          for (let px = 0; px < 2; px++) line(cursor + gx * 2 + px, atY + gy * 2 + py, 255, 255, 0);
        }
      }
    }
    cursor += 8;
  }
}

for (let c = 0; c <= COLS; c += 5) stamp(String(c), c * CELL + 2, 2);
for (let r = 5; r <= ROWS; r += 5) stamp(String(r), 2, r * CELL + 2);

fs.writeFileSync(process.argv[3], PNG.sync.write(dst));
console.log(`${process.argv[3]} ${w}x${h} (${COLS}x${ROWS} cells)`);
