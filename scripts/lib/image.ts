/**
 * Small image toolkit for the sprite pipeline.
 *
 * Pure JavaScript on top of pngjs: this machine has no C++ toolchain, so a
 * native imaging library is not an option. Everything here works on plain RGBA
 * buffers and is deliberately dependency-light and synchronous - the pipeline
 * runs a few dozen 2048x2048 images once, not a render loop.
 */

import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

export interface Img {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Buffer;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function load(file: string): Img {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
}

export function save(file: string, img: Img): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png));
}

export function blank(width: number, height: number): Img {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

export const idx = (img: Img, x: number, y: number) => (y * img.width + x) * 4;

export function getPixel(img: Img, x: number, y: number): [number, number, number, number] {
  const i = idx(img, x, y);
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

export function setPixel(img: Img, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const i = idx(img, x, y);
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

// --------------------------------------------------------------------------
// Chroma key
// --------------------------------------------------------------------------

export interface KeyOptions {
  /** Distance at or below which a pixel is pure background. */
  inner: number;
  /** Distance beyond which a pixel is fully kept. Between the two, feathered. */
  outer: number;
}

const KEY = { r: 255, g: 0, b: 255 };

function keyDistance(r: number, g: number, b: number): number {
  // Weighted towards green, because the thing that separates magenta from skin
  // and cloth here is how little green it has.
  const dr = r - KEY.r;
  const dg = g - KEY.g;
  const db = b - KEY.b;
  return Math.sqrt(dr * dr + dg * dg * 2 + db * db);
}

/**
 * Knocks the magenta out and removes the coloured fringe it leaves behind.
 *
 * Two passes, because a hard threshold alone leaves a pink halo wherever the
 * generator anti-aliased the subject against the background. The feather turns
 * near-key pixels partly transparent, and the despill pulls the remaining
 * magenta cast out of edge pixels by clamping red and blue towards green.
 */
export function removeChroma(img: Img, options: KeyOptions = { inner: 110, outer: 210 }): Img {
  const out = blank(img.width, img.height);

  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    const a = img.data[i + 3]!;
    const distance = keyDistance(r, g, b);

    if (a === 0 || distance <= options.inner) continue; // Fully background.

    let alpha = a;
    if (distance < options.outer) {
      alpha = Math.round((a * (distance - options.inner)) / (options.outer - options.inner));
      if (alpha <= 2) continue;
    }

    // Despill: magenta fringe has r and b well above g. Pull them down towards
    // the green channel so the edge reads as the subject, not as pink.
    let nr = r;
    let nb = b;
    const spill = Math.min(r, b) - g;
    if (spill > 0) {
      const pull = Math.min(spill, 80);
      nr = Math.max(g, r - pull);
      nb = Math.max(g, b - pull);
    }

    out.data[i] = nr;
    out.data[i + 1] = g;
    out.data[i + 2] = nb;
    out.data[i + 3] = alpha;
  }
  return out;
}

/** Drops stray specks left by the key: opaque pixels with almost no neighbours. */
export function denoise(img: Img, minNeighbours = 3): Img {
  const out = { width: img.width, height: img.height, data: Buffer.from(img.data) };
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const i = idx(img, x, y);
      if (img.data[i + 3]! === 0) continue;

      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
          if (img.data[idx(img, nx, ny) + 3]! > 24) neighbours += 1;
        }
      }
      if (neighbours < minNeighbours) out.data[i + 3] = 0;
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Geometry
// --------------------------------------------------------------------------

/** Tight rectangle around everything at least `threshold` opaque. */
export function alphaBounds(img: Img, threshold = 24): Rect | null {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[idx(img, x, y) + 3]! < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function crop(img: Img, rect: Rect): Img {
  const out = blank(rect.width, rect.height);
  for (let y = 0; y < rect.height; y += 1) {
    const sy = rect.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < rect.width; x += 1) {
      const sx = rect.x + x;
      if (sx < 0 || sx >= img.width) continue;
      img.data.copy(out.data, idx(out, x, y), idx(img, sx, sy), idx(img, sx, sy) + 4);
    }
  }
  return out;
}

/** Nearest-neighbour resize. The only kind that keeps pixel art crisp. */
export function scaleNearest(img: Img, width: number, height: number): Img {
  const out = blank(width, height);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / width));
      img.data.copy(out.data, idx(out, x, y), idx(img, sx, sy), idx(img, sx, sy) + 4);
    }
  }
  return out;
}

/**
 * Area-average downscale, then a hard alpha cut.
 *
 * Nearest-neighbour on a smooth painterly source drops most of the detail and
 * keeps whichever pixel happened to land on the grid; averaging first keeps the
 * shape, and the pipeline quantises afterwards to put it back on a pixel-art
 * palette.
 */
export function downscaleAveraged(img: Img, width: number, height: number): Img {
  const out = blank(width, height);
  const xRatio = img.width / width;
  const yRatio = img.height / height;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1 && sy < img.height; sy += 1) {
        for (let sx = x0; sx < x1 && sx < img.width; sx += 1) {
          const i = idx(img, sx, sy);
          const pa = img.data[i + 3]!;
          // Weight colour by alpha so transparent pixels do not wash the edge out.
          r += img.data[i]! * pa;
          g += img.data[i + 1]! * pa;
          b += img.data[i + 2]! * pa;
          a += pa;
          n += 1;
        }
      }
      if (n === 0 || a === 0) continue;
      const alpha = a / n;
      if (alpha < 40) continue; // Hard cut: pixel art has no 8% opaque pixels.
      setPixel(out, x, y, Math.round(r / a), Math.round(g / a), Math.round(b / a), 255);
    }
  }
  return out;
}

/** Draws `src` onto `dst` at (dx,dy), simple source-over. */
export function blit(dst: Img, src: Img, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y += 1) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x += 1) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const si = idx(src, x, y);
      const sa = src.data[si + 3]!;
      if (sa === 0) continue;
      const ti = idx(dst, tx, ty);
      if (sa === 255) {
        src.data.copy(dst.data, ti, si, si + 4);
        continue;
      }
      const ta = dst.data[ti + 3]!;
      const outA = sa + (ta * (255 - sa)) / 255;
      for (let c = 0; c < 3; c += 1) {
        const sc = src.data[si + c]!;
        const tc = dst.data[ti + c]!;
        dst.data[ti + c] = Math.round((sc * sa + tc * ta * (1 - sa / 255)) / outA);
      }
      dst.data[ti + 3] = Math.round(outA);
    }
  }
}

// --------------------------------------------------------------------------
// Blobs
// --------------------------------------------------------------------------

/**
 * Connected opaque regions, largest first.
 *
 * The character sheets are 2x2 grids, but the drawings do not sit in exact
 * quadrants - so the frames are found by looking for separated islands of
 * pixels rather than by cutting the image in four.
 */
export function findBlobs(img: Img, minPixels = 400, threshold = 24): Rect[] {
  const { width, height } = img;
  const seen = new Uint8Array(width * height);
  const blobs: Rect[] = [];
  const stack: number[] = [];

  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start]) continue;
    if (img.data[start * 4 + 3]! < threshold) {
      seen[start] = 1;
      continue;
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;

    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 8-connected, so a diagonal hair pixel does not split a frame in two.
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (seen[q]) continue;
          seen[q] = 1;
          if (img.data[q * 4 + 3]! >= threshold) stack.push(q);
        }
      }
    }

    if (count >= minPixels) {
      blobs.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }

  return blobs.sort((a, b) => b.width * b.height - a.width * a.height);
}

/**
 * Orders four blobs into reading order: top-left, top-right, bottom-left,
 * bottom-right. Split by the midpoint of the centroids rather than of the
 * image, so an off-centre grid still reads correctly.
 */
export function readingOrder(blobs: Rect[]): Rect[] {
  if (blobs.length !== 4) return blobs;
  const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const midY = blobs.reduce((sum, r) => sum + centre(r).y, 0) / 4;

  const top = blobs.filter((r) => centre(r).y < midY).sort((a, b) => centre(a).x - centre(b).x);
  const bottom = blobs.filter((r) => centre(r).y >= midY).sort((a, b) => centre(a).x - centre(b).x);
  return [...top, ...bottom];
}

// --------------------------------------------------------------------------
// Comparison
// --------------------------------------------------------------------------

/** Per-row count of opaque pixels - the basis for finding a shoulder line. */
export function rowWidths(img: Img, threshold = 24): number[] {
  const widths: number[] = [];
  for (let y = 0; y < img.height; y += 1) {
    let n = 0;
    for (let x = 0; x < img.width; x += 1) {
      if (img.data[idx(img, x, y) + 3]! >= threshold) n += 1;
    }
    widths.push(n);
  }
  return widths;
}

export interface Offset {
  dx: number;
  dy: number;
  score: number;
}

/**
 * Finds the translation that best lines `moving` up with `base`.
 *
 * A coarse sweep followed by a fine one: the overlay art is the same character
 * redrawn, so it is close but never pixel-identical, and matching on the region
 * both images share (the face and torso) is far more reliable than trying to
 * match bounding boxes that the hat itself changes.
 */
export function bestAlignment(
  base: Img,
  moving: Img,
  compare: Rect,
  coarse = 8,
  range = 160,
): Offset {
  const score = (dx: number, dy: number): number => {
    let total = 0;
    let n = 0;
    for (let y = compare.y; y < compare.y + compare.height; y += 2) {
      for (let x = compare.x; x < compare.x + compare.width; x += 2) {
        const mx = x + dx;
        const my = y + dy;
        if (mx < 0 || my < 0 || mx >= moving.width || my >= moving.height) continue;
        const bi = idx(base, x, y);
        const mi = idx(moving, mx, my);
        const ba = base.data[bi + 3]!;
        const ma = moving.data[mi + 3]!;
        if (ba < 24 && ma < 24) continue;
        if (ba < 24 || ma < 24) {
          total += 3 * 255 * 255; // Silhouette mismatch costs as much as a colour miss.
          n += 1;
          continue;
        }
        for (let c = 0; c < 3; c += 1) {
          const d = base.data[bi + c]! - moving.data[mi + c]!;
          total += d * d;
        }
        n += 1;
      }
    }
    return n === 0 ? Infinity : total / n;
  };

  let best: Offset = { dx: 0, dy: 0, score: Infinity };
  for (let dy = -range; dy <= range; dy += coarse) {
    for (let dx = -range; dx <= range; dx += coarse) {
      const s = score(dx, dy);
      if (s < best.score) best = { dx, dy, score: s };
    }
  }
  for (let dy = best.dy - coarse; dy <= best.dy + coarse; dy += 1) {
    for (let dx = best.dx - coarse; dx <= best.dx + coarse; dx += 1) {
      const s = score(dx, dy);
      if (s < best.score) best = { dx, dy, score: s };
    }
  }
  return best;
}

/**
 * Pixels of `moving` (shifted by `offset`) that differ from `base`.
 *
 * This is what separates a hat from the chef wearing it: everything the two
 * images agree on is the body, and what is left is the garment.
 */
export function differenceMask(base: Img, moving: Img, offset: Offset, tolerance = 60): Img {
  const out = blank(base.width, base.height);

  for (let y = 0; y < base.height; y += 1) {
    for (let x = 0; x < base.width; x += 1) {
      const mx = x + offset.dx;
      const my = y + offset.dy;
      if (mx < 0 || my < 0 || mx >= moving.width || my >= moving.height) continue;

      const mi = idx(moving, mx, my);
      const ma = moving.data[mi + 3]!;
      if (ma < 24) continue;

      const bi = idx(base, x, y);
      const ba = base.data[bi + 3]!;

      let differs = ba < 24; // The overlay covers ground the base never did.
      if (!differs) {
        const dr = base.data[bi]! - moving.data[mi]!;
        const dg = base.data[bi + 1]! - moving.data[mi + 1]!;
        const db = base.data[bi + 2]! - moving.data[mi + 2]!;
        differs = Math.sqrt(dr * dr + dg * dg + db * db) > tolerance;
      }
      if (!differs) continue;

      moving.data.copy(out.data, idx(out, x, y), mi, mi + 4);
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Quantisation
// --------------------------------------------------------------------------

/** The n most frequent opaque colours, coarsely bucketed so near-duplicates merge. */
export function dominantColours(img: Img, n: number, bucket = 16): number[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < 128) continue;
    const r = Math.round(img.data[i]! / bucket) * bucket;
    const g = Math.round(img.data[i + 1]! / bucket) * bucket;
    const b = Math.round(img.data[i + 2]! / bucket) * bucket;
    const key = (Math.min(r, 255) << 16) | (Math.min(g, 255) << 8) | Math.min(b, 255);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([colour]) => colour);
}

/** Snaps every pixel to the nearest colour in `palette`. */
export function quantise(img: Img, palette: readonly number[]): Img {
  const out = { width: img.width, height: img.height, data: Buffer.from(img.data) };
  const parts = palette.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const);
  const cache = new Map<number, number>();

  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3]! < 128) {
      out.data[i + 3] = 0;
      continue;
    }
    const r = out.data[i]!;
    const g = out.data[i + 1]!;
    const b = out.data[i + 2]!;
    const key = (r << 16) | (g << 8) | b;

    let best = cache.get(key);
    if (best === undefined) {
      let bestDistance = Infinity;
      let bestIndex = 0;
      for (let p = 0; p < parts.length; p += 1) {
        const [pr, pg, pb] = parts[p]!;
        const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = p;
        }
      }
      best = palette[bestIndex]!;
      cache.set(key, best);
    }

    out.data[i] = (best >> 16) & 255;
    out.data[i + 1] = (best >> 8) & 255;
    out.data[i + 2] = best & 255;
    out.data[i + 3] = 255;
  }
  return out;
}
