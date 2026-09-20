/**
 * Web-sized copies of the four paintings, for the marketing site.
 *
 *   node scripts/build-site-art.mjs
 *
 * The paintings the game loads are 4.5 to 6.7 MB each - right for a map you
 * walk around in for an hour, catastrophic for a page somebody opens on a
 * phone and decides about in four seconds. The site's budget is 3 MB for
 * everything, so it cannot have even one of them.
 *
 * So each painting gets two JPEGs: a wide one for desktop and a narrow one for
 * phones, picked by `srcset` at request time. JPEG rather than PNG because
 * these are painted, not pixel art - there are no flat runs for PNG to exploit
 * and no hard edges for JPEG to ruin, and the difference is about tenfold.
 * The sprites stay PNG, at their own size, and are never touched by this.
 *
 * The output is committed like client/dist is, for the same reason: the deploy
 * host has 1 GB and no reason to own an image pipeline.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const FROM = path.join(ROOT, "client", "public", "assets", "maps");
const TO = path.join(ROOT, "client", "public", "assets", "site");
const BRAND = path.join(ROOT, "art", "brand");
const PUBLIC = path.join(ROOT, "client", "public");

/**
 * The two widths, and why they are these two.
 *
 * 1440 is wide enough to fill a laptop without the eye finding the softness;
 * 720 covers every phone at 2x and is what the narrow `srcset` entry serves.
 * A third size would be more correct and would also be a third of a megabyte
 * nobody asked for.
 */
const SIZES = [
  { suffix: "wide", width: 1440, quality: 72 },
  { suffix: "narrow", width: 720, quality: 68 },
];

const MAPS = ["map_hub", "map_meadows", "map_forest", "map_caves"];

/**
 * Box-filter downscale.
 *
 * Every source pixel that lands in a destination pixel is averaged into it,
 * which is the right answer when shrinking by a large factor - a nearest
 * sample would alias the brush texture into noise, and these are paintings
 * whose texture is most of what they are.
 */
function downscale(png, targetWidth) {
  const scale = targetWidth / png.width;
  const targetHeight = Math.max(1, Math.round(png.height * scale));
  const out = Buffer.alloc(targetWidth * targetHeight * 4);

  const xStep = png.width / targetWidth;
  const yStep = png.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = Math.floor(y * yStep);
    const y1 = Math.min(png.height, Math.max(y0 + 1, Math.floor((y + 1) * yStep)));

    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = Math.floor(x * xStep);
      const x1 = Math.min(png.width, Math.max(x0 + 1, Math.floor((x + 1) * xStep)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * png.width + sx) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          a += png.data[i + 3];
          n += 1;
        }
      }

      const o = (y * targetWidth + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }

  return { data: out, width: targetWidth, height: targetHeight };
}

/** JPEG has no alpha; the encoder reads the channel anyway, so flatten it. */
function opaque(image) {
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
}

/** Writes an RGBA buffer as a PNG. Used for the icons, which need alpha. */
function writePng(file, image) {
  const png = new PNG({ width: image.width, height: image.height });
  image.data.copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png));
  return fs.statSync(file).size;
}

/** Draws `top` over `base`, centred, at `scale` of the base's height. */
function compose(base, top, scale) {
  const size = Math.round(base.height * scale);
  const small = downscale({ ...top, data: top.data }, size);
  const offsetX = Math.round((base.width - small.width) / 2);
  const offsetY = Math.round((base.height - small.height) / 2);

  for (let y = 0; y < small.height; y += 1) {
    const by = y + offsetY;
    if (by < 0 || by >= base.height) continue;
    for (let x = 0; x < small.width; x += 1) {
      const bx = x + offsetX;
      if (bx < 0 || bx >= base.width) continue;
      const s = (y * small.width + x) * 4;
      const d = (by * base.width + bx) * 4;
      const alpha = small.data[s + 3] / 255;
      if (alpha === 0) continue;
      for (let c = 0; c < 3; c += 1) {
        base.data[d + c] = Math.round(base.data[d + c] * (1 - alpha) + small.data[s + c] * alpha);
      }
    }
  }
  return base;
}

/** Darkens every pixel, so the token reads against the painting behind it. */
function darken(image, amount) {
  for (let i = 0; i < image.data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) image.data[i + c] = Math.round(image.data[i + c] * amount);
  }
  return image;
}

/**
 * The share card and the icons.
 *
 * The token art is 2048 square and 2.6 MB - the right size for a source file
 * and the wrong one for everything that uses it. Open Graph wants 1200x630,
 * a favicon wants 64, and an iOS home screen wants 180, so all four are made
 * here from the one drawing rather than exported by hand and drifting apart.
 */
function brand() {
  const token = path.join(BRAND, "cook_token.png");
  if (!fs.existsSync(token)) {
    console.log("\nno art/brand/cook_token.png - skipping the share card and icons");
    return;
  }

  const drawing = PNG.sync.read(fs.readFileSync(token));
  const banner = path.join(BRAND, "banner.png");

  // The card: the hub painting, darkened, with the token over it.
  const source = PNG.sync.read(fs.readFileSync(fs.existsSync(banner) ? banner : path.join(FROM, "map_hub.png")));
  const card = darken(cover(source, 1200, 630), fs.existsSync(banner) ? 1 : 0.5);

  compose(card, drawing, 0.74);
  opaque(card);
  const cardFile = path.join(TO, "og.jpg");
  fs.writeFileSync(cardFile, jpeg.encode(card, 80).data);
  console.log(`og.jpg  ${card.width}x${card.height}  ${Math.round(fs.statSync(cardFile).size / 1024)} kB`);

  for (const [name, size, where] of [
    ["token.png", 256, TO],
    ["favicon.png", 64, PUBLIC],
    ["apple-touch-icon.png", 180, PUBLIC],
  ]) {
    const bytes = writePng(path.join(where, name), downscale(drawing, size));
    console.log(`${name}  ${size}x${size}  ${Math.round(bytes / 1024)} kB`);
  }
}

/**
 * Scale to fill an exact box, then centre-crop - the `object-fit: cover` of
 * this file. Scaling on width alone would leave the hub painting, which is
 * three times wider than it is tall, short of the card's height.
 */
function cover(image, width, height) {
  const scaleWidth = Math.max(width, Math.round((image.width * height) / image.height));
  return cropTo(downscale(image, scaleWidth), width, height);
}

/** Centre crop to an exact box, after the scale has already been chosen. */
function cropTo(image, width, height) {
  const out = Buffer.alloc(width * height * 4);
  const offsetY = Math.max(0, Math.round((image.height - height) / 2));
  const offsetX = Math.max(0, Math.round((image.width - width) / 2));

  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(image.height - 1, y + offsetY);
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, x + offsetX);
      const s = (sy * image.width + sx) * 4;
      const d = (y * width + x) * 4;
      out[d] = image.data[s];
      out[d + 1] = image.data[s + 1];
      out[d + 2] = image.data[s + 2];
      out[d + 3] = image.data[s + 3];
    }
  }
  return { data: out, width, height };
}

function main() {
  fs.mkdirSync(TO, { recursive: true });

  let total = 0;
  for (const name of MAPS) {
    const source = path.join(FROM, `${name}.png`);
    if (!fs.existsSync(source)) {
      console.error(`missing ${path.relative(ROOT, source)}`);
      process.exitCode = 1;
      continue;
    }

    const png = PNG.sync.read(fs.readFileSync(source));
    for (const size of SIZES) {
      const scaled = downscale(png, Math.min(size.width, png.width));
      opaque(scaled);
      const encoded = jpeg.encode(scaled, size.quality);
      const out = path.join(TO, `${name}-${size.suffix}.jpg`);
      fs.writeFileSync(out, encoded.data);
      total += encoded.data.length;
      const kb = Math.round(encoded.data.length / 1024);
      console.log(
        `${name}-${size.suffix}.jpg  ${scaled.width}x${scaled.height}  ${kb} kB`.padEnd(52) +
          `(from ${Math.round(fs.statSync(source).size / 1024)} kB)`,
      );
    }
  }

  console.log(`\nsite art: ${Math.round(total / 1024)} kB for ${MAPS.length} paintings`);
  brand();
}

main();
