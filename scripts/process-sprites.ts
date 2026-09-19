/**
 * Turns the generated art drops into game-ready sprites.
 *
 *   npm run sprites
 *
 * Reads client/public/assets/sprites/** and writes client/public/assets/
 * generated/**. Source files are never touched. Anything missing is reported
 * and skipped, not treated as an error - most of the folders are still empty.
 *
 * The three interesting jobs:
 *
 *   characters  each drop is a 2x2 grid of separate drawings. The frames are
 *               found as connected blobs rather than by cutting the image in
 *               quarters, because the drawings do not sit in exact quadrants.
 *   overlays    each hat is the whole chef wearing it. The chef is aligned to
 *               the base body by correlation, subtracted, and what is left is
 *               the garment - then cropped to the head or torso so a stray
 *               neckerchief or a different hairstyle does not come along.
 *   props       buildings arrive smooth and painterly; they are averaged down
 *               to a tile-sized footprint and quantised onto the game palette
 *               so they sit in the same world as the characters.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUANTISE_RAMP, RECIPES, INGREDIENTS, TERRAIN, decorFor } from "@crazycauldron/shared";

/**
 * Decor is still cut to a "tile" of 32px.
 *
 * The game no longer has tiles - the maps are paintings - but the pack
 * scenery this cuts is 32px art and the sizes in terrain.json are written
 * in those units. Nothing on a painted map draws it any more; the pipeline
 * keeps producing it so the assets survive a decision to use them again.
 */
const TILE_WIDTH = 32;
import {
  alphaBounds,
  blank,
  blit,
  clearPixel,
  crop,
  denoise,
  dominantColours,
  downscaleAveraged,
  findBlobs,
  labelBlobs,
  load,
  quantise,
  readingOrder,
  removeChroma,
  save,
  scaleNearest,
  type Img,
  type Rect,
} from "./lib/image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const SRC = path.join(ASSETS, "sprites");
const OUT = path.join(ASSETS, "generated");

/** Body frames are this size; 48 tall is the figure, 32 wide fits the widest pose. */
const BODY_W = 32;
const BODY_H = 48;

const DIRECTIONS = ["down", "up", "left", "right"] as const;
type Direction = (typeof DIRECTIONS)[number];

const found: string[] = [];
const skipped: string[] = [];
const made: string[] = [];
/** Outputs that were produced but look wrong enough to mention. */
const suspect: string[] = [];

const exists = (file: string) => fs.existsSync(file);
const listPngs = (dir: string): string[] =>
  exists(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort() : [];

function note(kind: "found" | "skipped" | "made", what: string) {
  ({ found, skipped, made })[kind].push(what);
}

// --------------------------------------------------------------------------
// Characters
// --------------------------------------------------------------------------

interface Frame {
  name: string;
  img: Img;
}

/** Cleans a drop and returns its four drawings in reading order. */
function readGrid(file: string): { clean: Img; cells: Rect[] } | null {
  const clean = denoise(removeChroma(load(file)));
  const blobs = findBlobs(clean, 2000);
  if (blobs.length < 4) {
    note("skipped", `${path.basename(file)} - found ${blobs.length} drawings, expected 4`);
    return null;
  }
  return { clean, cells: readingOrder(blobs.slice(0, 4)) };
}

/**
 * Every frame of one body, each scaled to the same height.
 *
 * Per frame rather than per body. A single shared scale preserves the bob the
 * artist drew, but it also preserves any difference in how large the figure was
 * drawn between one drop and another - and the female idle came in visibly
 * shorter than her walk, which pushed hat and cloak offsets out of line the
 * moment she started moving. Normalising each frame to exactly 48px and
 * anchoring at the feet means a garment offset is true in every frame; the bob
 * is supplied procedurally instead.
 */
function buildBody(body: "male" | "female"): { frames: Frame[]; scale: number } | null {
  const idleFile = path.join(SRC, "characters", `${body}_idle.png`);
  if (!exists(idleFile)) {
    note("skipped", `${body}_idle.png - missing, cannot build ${body}`);
    return null;
  }

  const sources: { key: string; file: string }[] = [{ key: "idle", file: idleFile }];
  for (const direction of DIRECTIONS) {
    const file = path.join(SRC, "characters", `${body}_walk_${direction}.png`);
    if (exists(file)) sources.push({ key: `walk_${direction}`, file });
    else note("skipped", `${body}_walk_${direction}.png - missing`);
  }

  const grids = new Map<string, { clean: Img; cells: Rect[] }>();
  for (const source of sources) {
    const grid = readGrid(source.file);
    if (!grid) continue;
    note("found", path.relative(ASSETS, source.file));
    grids.set(source.key, grid);
  }
  if (!grids.has("idle")) return null;

  const frames: Frame[] = [];
  /** Where the head starts in each finished frame, for the spread check. */
  const headTops: { name: string; y: number }[] = [];
  let scale = 0;

  const place = (clean: Img, cell: Rect, name: string) => {
    // The cell is the blob's bounding box: head top to foot bottom, already
    // tight because the chroma key removed everything else.
    const cut = crop(clean, cell);
    const frameScale = BODY_H / cut.height;
    scale = frameScale; // Reported for reference; each frame has its own.

    const w = Math.max(1, Math.round(cut.width * frameScale));
    const small = scaleNearest(cut, w, BODY_H);

    const canvas = blank(BODY_W, BODY_H);
    // Feet on the baseline, centred horizontally.
    blit(canvas, small, Math.round((BODY_W - w) / 2), 0);

    const bounds = alphaBounds(canvas);
    headTops.push({ name, y: bounds ? bounds.y : 0 });
    frames.push({ name, img: canvas });
  };

  // Idle: one pose per direction, in the documented order.
  const idle = grids.get("idle")!;
  DIRECTIONS.forEach((direction, i) => {
    const cell = idle.cells[i];
    if (cell) place(idle.clean, cell, `${body}_idle_${direction}`);
  });

  // Walk: four frames of one direction, read left to right, top to bottom.
  for (const direction of DIRECTIONS) {
    const grid = grids.get(`walk_${direction}`);
    if (!grid) continue;
    grid.cells.forEach((cell, i) => place(grid.clean, cell, `${body}_walk_${direction}_${i}`));
  }

  /*
   * Every frame is scaled to the same height, so the head should start on the
   * same row in all of them. A frame that does not is a drawing whose figure
   * is cropped differently from its siblings, and it will make a hat jump.
   */
  const sorted = [...headTops].map((h) => h.y).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const outliers = headTops.filter((h) => Math.abs(h.y - median) > 2);
  const spread = (sorted[sorted.length - 1] ?? 0) - (sorted[0] ?? 0);

  note("made", `${body}: head-top spread ${spread}px across ${frames.length} frames (median row ${median})`);
  for (const outlier of outliers) {
    suspect.push(
      `${outlier.name} has its head at row ${outlier.y}, ${Math.abs(outlier.y - median)}px off the median ${median}`,
    );
  }

  return { frames, scale };
}

interface AtlasFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
}

/** Packs frames into a grid sheet and writes the Phaser JSON atlas beside it. */
function writeSheet(name: string, frames: Frame[]): void {
  if (frames.length === 0) return;
  const columns = Math.min(8, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheet = blank(columns * BODY_W, rows * BODY_H);

  const atlas: AtlasFrame[] = frames.map((frame, i) => {
    const x = (i % columns) * BODY_W;
    const y = Math.floor(i / columns) * BODY_H;
    blit(sheet, frame.img, x, y);
    return {
      filename: frame.name,
      frame: { x, y, w: BODY_W, h: BODY_H },
      sourceSize: { w: BODY_W, h: BODY_H },
      spriteSourceSize: { x: 0, y: 0, w: BODY_W, h: BODY_H },
      rotated: false,
      trimmed: false,
    };
  });

  save(path.join(OUT, "characters", `${name}.png`), sheet);
  fs.writeFileSync(
    path.join(OUT, "characters", `${name}.json`),
    `${JSON.stringify(
      {
        frames: atlas,
        meta: {
          app: "scripts/process-sprites.ts",
          image: `${name}.png`,
          format: "RGBA8888",
          size: { w: sheet.width, h: sheet.height },
          scale: "1",
        },
      },
      null,
      2,
    )}\n`,
  );
  note("made", `generated/characters/${name}.png + .json (${frames.length} frames)`);
}

// --------------------------------------------------------------------------
// Overlays
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Walk cycles
// --------------------------------------------------------------------------

/** How the four frames of one direction are played. */
interface WalkCycle {
  /** Source frame numbers, in the order they are played. */
  order: number[];
  frameRate: number;
  pingPong: boolean;
  /** Pairs of frames too alike to read as separate poses. */
  duplicates: [number, number][];
  /** Every pair, for the report and for anyone deciding to redraw a sheet. */
  pairs: { a: number; b: number; silhouette: number; intensity: number }[];
}

/**
 * Two frames are the same pose twice when the outline barely moves and the
 * pixels barely change.
 *
 * Both tests, not either. A pixel count on its own is useless here: these are
 * four independently hand-drawn poses scaled down to 32x48, so almost every
 * pixel is a different blend and a naive count calls frames 50% different
 * when they are plainly the same walk. Silhouette catches a leg that did not
 * move; intensity catches shading that did not change. A pair that fails
 * neither is a frame the animation gets nothing from.
 */
const DUPLICATE_SILHOUETTE = 0.04;
const DUPLICATE_INTENSITY = 16;

/** Frames per second. Fast enough to read as walking at this stride length. */
const WALK_FPS = 10;

/**
 * How different two frames are, measured two ways.
 *
 * silhouette: the fraction of covered pixels one frame has and the other does
 * not, over the union - the shape of the motion, which is what reads at this
 * size.
 *
 * intensity: the mean per-channel difference over those same pixels - the
 * shading, which is what makes a redrawn pose feel redrawn.
 */
function compareFrames(a: Img, b: Img): { silhouette: number; intensity: number } {
  let differing = 0;
  let union = 0;
  let sum = 0;

  const pixels = Math.min(a.data.length, b.data.length) / 4;
  for (let i = 0; i < pixels; i += 1) {
    const at = i * 4;
    const aCovered = a.data[at + 3]! >= 8;
    const bCovered = b.data[at + 3]! >= 8;
    if (!aCovered && !bCovered) continue;

    union += 1;
    if (aCovered !== bCovered) differing += 1;
    for (let c = 0; c < 4; c += 1) sum += Math.abs(a.data[at + c]! - b.data[at + c]!);
  }

  if (union === 0) return { silhouette: 0, intensity: 0 };
  return { silhouette: differing / union, intensity: sum / union / 4 };
}

/**
 * Decides how one direction's cycle is played, and says why.
 *
 * Four distinct poses loop 0-1-2-3. When two of them are the same pose twice
 * the loop has three poses in four slots and the stride visibly hitches, so it
 * is played as a ping-pong instead - 0-1-2-3-2-1 - which turns the dead frame
 * into a turning point rather than a stumble. It is not a fix; it is what
 * makes a weak sheet usable until it is redrawn.
 */
function analyseWalk(frames: Img[]): WalkCycle {
  const pairs: WalkCycle["pairs"] = [];
  const duplicates: [number, number][] = [];

  for (let a = 0; a < frames.length; a += 1) {
    for (let b = a + 1; b < frames.length; b += 1) {
      const { silhouette, intensity } = compareFrames(frames[a]!, frames[b]!);
      pairs.push({ a, b, silhouette, intensity });
      if (silhouette <= DUPLICATE_SILHOUETTE && intensity <= DUPLICATE_INTENSITY) {
        duplicates.push([a, b]);
      }
    }
  }

  const pingPong = duplicates.length > 0 && frames.length === 4;
  return {
    order: pingPong ? [0, 1, 2, 3, 2, 1] : frames.map((_, i) => i),
    frameRate: WALK_FPS,
    pingPong,
    duplicates,
    pairs,
  };
}

/**
 * The report the brief asks for: every pair of every cycle, so a weak sheet
 * can be found and redrawn rather than guessed at.
 */
function auditWalkCycles(cycles: Record<string, Record<string, WalkCycle>>): void {
  console.log("\n  walk cycles - how different each frame is from the others:");
  console.log(
    "    (silhouette = outline that moved, intensity = mean pixel change; a pair under " +
      Math.round(DUPLICATE_SILHOUETTE * 100) + "% and " + DUPLICATE_INTENSITY +
      " is the same pose twice)",
  );

  for (const [body, directions] of Object.entries(cycles)) {
    console.log("\n    " + body);
    for (const [direction, cycle] of Object.entries(directions)) {
      const worst = [...cycle.pairs].sort(
        (x, y) => x.silhouette + x.intensity / 400 - (y.silhouette + y.intensity / 400),
      )[0];

      const line = cycle.pairs
        .map(
          (pair) =>
            pair.a + "-" + pair.b + " " +
            Math.round(pair.silhouette * 100) + "%/" + Math.round(pair.intensity),
        )
        .join("  ");

      console.log("      " + direction.padEnd(6) + line);

      if (cycle.duplicates.length > 0) {
        const named = cycle.duplicates.map(([a, b]) => "frames " + a + " and " + b).join(", ");
        console.log(
          "      " + "".padEnd(6) + "-> ping-pong " + cycle.order.join("-") + " at " +
            cycle.frameRate + " fps; " + named + " are near-duplicates",
        );
        suspect.push(
          body + " walk_" + direction + ": " + named + " are near-duplicates - the sheet " +
            "is worth redrawing; played as a ping-pong until it is",
        );
      } else {
        console.log(
          "      " + "".padEnd(6) + "-> " + cycle.order.join("-") + " at " + cycle.frameRate +
            " fps; all four distinct" +
            (worst
              ? " (closest pair " + worst.a + "-" + worst.b + " at " +
                Math.round(worst.silhouette * 100) + "%/" + Math.round(worst.intensity) + ")"
              : ""),
        );
      }
    }
  }
}


interface OverlayResult {
  id: string;
  width: number;
  height: number;
  /** Where the overlay sits relative to the body frame, top-left to top-left. */
  offset: { x: number; y: number };
  /** True when an <id>_back.png was processed for the up direction. */
  back?: boolean;
  /** Finished width as a fraction of the body figure's own width. */
  widthPct: number;
}

/** How one cosmetic is fitted to the body. */
interface Fit {
  widthPx: number;
  /** Hats: the row the brim lands on. */
  bottomRow?: number;
  /** Cloaks: the row the garment's neckline lands on. */
  topRow?: number;
  /** Cloaks: the row the hem lands on. */
  hemRow?: number;
}

interface FitFile {
  defaults: Record<"hat" | "cloak", Fit>;
  items: Record<string, Partial<Fit>>;
}

const FITS = JSON.parse(
  fs.readFileSync(path.join(here, "overlay-bands.json"), "utf8"),
) as FitFile;

function fitFor(kind: "hat" | "cloak", id: string): Fit {
  return { ...FITS.defaults[kind], ...(FITS.items[id] ?? {}) };
}

/** The body an overlay is fitted to, measured once from the finished sheet. */
interface OverlayBase {
  /** The figure's own width inside the 32px frame; the audit denominator. */
  figureWidth: number;
  /** Horizontal centre of the figure, in frame pixels. */
  centreX: number;
}

/** Fragments smaller than this are speckle left by the chroma key. */
const MIN_ISLAND_PX = 6;

/**
 * Fits one cosmetic to the body.
 *
 * The items arrive as standalone art on magenta - a hat, a cloak, nothing else
 * - so there is no character to subtract and no band to guess at. Three steps:
 * key the magenta, drop the speckle it leaves behind, and scale what is left
 * to a stated width.
 *
 * Where it sits comes from the body's own rows rather than from a fraction. A
 * hat's brim lands on the crown at row 11; a cloak's neckline lands at the
 * throat on row 22, with the shoulders covered below it. Those are measured
 * numbers, written down in overlay-bands.json next to the row profile they
 * came from.
 *
 * One file per cloak. It was three for a while - a collar in front of the
 * body and a drape behind it, so the garment hung off the shoulders - but at
 * 26 pixels wide the seam cost more than the depth bought: the body showed
 * through a cloak that is meant to be closed at the front. A cloak is now a
 * full-front garment, drawn whole and drawn in front.
 */
function buildOverlay(
  file: string,
  id: string,
  kind: "hat" | "cloak",
  base: OverlayBase,
): OverlayResult | null {
  const folder = kind === "hat" ? "hats" : "cloaks";
  const cut = cutItem(file, kind, id, base);
  if (!cut) return null;

  save(path.join(OUT, folder, id + ".png"), cut.image);

  /*
   * The same item drawn from behind, when the artist has provided one.
   *
   * Hats only. A cloak is closed at the front and roughly symmetric from
   * behind, so the up view uses the same image rather than a second drawing
   * that would have to be kept in step with the first.
   */
  const backFile = kind === "hat" ? file.replace(/\.png$/i, "_back.png") : "";
  let back = false;
  if (backFile && exists(backFile)) {
    const rear = cutItem(backFile, kind, id, base);
    if (rear) {
      save(path.join(OUT, folder, id + "_back.png"), rear.image);
      note("found", path.relative(ASSETS, backFile));
      back = true;
    }
  }

  const widthPct = cut.width / base.figureWidth;
  note(
    "made",
    "generated/" + folder + "/" + id + ".png " + cut.width + "x" + cut.height +
      " at (" + cut.offset.x + "," + cut.offset.y + ") - " +
      Math.round(widthPct * 100) + "% of body width" +
      (back ? ", with a back view" : "") +
      (cut.dropped > 0 ? ", " + cut.dropped + " speckle(s) dropped" : ""),
  );

  return {
    id,
    width: cut.width,
    height: cut.height,
    offset: cut.offset,
    widthPct,
    ...(back ? { back: true } : {}),
  };
}

interface Cut {
  image: Img;
  width: number;
  height: number;
  offset: { x: number; y: number };
  dropped: number;
}

function cutItem(
  file: string,
  kind: "hat" | "cloak",
  id: string,
  base: OverlayBase,
): Cut | null {
  const keyed = denoise(removeChroma(load(file)));

  /*
   * A chroma key on a 2048px drawing leaves a scatter of single pixels around
   * the edge. Left in, they widen the bounding box and the whole item is
   * scaled down to make room for dust.
   */
  let dropped = 0;
  for (const blob of labelBlobs(keyed)) {
    if (blob.pixels.length >= MIN_ISLAND_PX * 40) continue;
    for (const pixel of blob.pixels) clearPixel(keyed, pixel);
    dropped += 1;
  }

  const bounds = alphaBounds(keyed);
  if (!bounds || bounds.width < 8 || bounds.height < 8) {
    note("skipped", path.basename(file) + " - nothing left after keying");
    return null;
  }

  const tight = crop(keyed, bounds);
  const fit = fitFor(kind, id);
  const w = Math.max(1, fit.widthPx);

  /*
   * A hat keeps the proportions it was drawn at. A cloak does not, and the
   * reason is arithmetic rather than taste: the drawings are portrait, about
   * 1.3 times as tall as they are wide, while this body is chibi - 25px
   * across, 46 tall, with shoulders to shins spanning 22 rows. Scaled
   * uniformly to 26px wide a cloak finishes 30-37 rows tall and its hem lands
   * below the feet; scaled uniformly to 22 rows tall it finishes 16px wide
   * and does not cover the shoulders it is supposed to hang from.
   *
   * So both axes are fitted. On a trapezoid of cloth the squash does not
   * read; a hem trailing under the boots very much does.
   */
  const h =
    kind === "cloak"
      ? Math.max(1, (fit.hemRow ?? 44) - (fit.topRow ?? 22))
      : Math.max(1, Math.round((tight.height / tight.width) * w));

  // Averaged down, not nearest: these are 2048px drawings going to 24px, and
  // nearest at that ratio throws away nine pixels in ten and shimmers.
  const small = downscaleAveraged(tight, w, h);
  const palette = [...QUANTISE_RAMP, ...dominantColours(small, 10)];
  const image = quantise(small, palette);

  const offsetX = Math.round(base.centreX - w / 2);
  const offsetY = kind === "hat" ? (fit.bottomRow ?? 11) - h : (fit.topRow ?? 22);

  return { image, width: w, height: h, offset: { x: offsetX, y: offsetY }, dropped };
}

/**
 * The audit the brief asks for: every finished cosmetic measured against the
 * body it will sit on, with anything outside the plausible range named.
 */
function auditOverlays(overlays: { hats: OverlayResult[]; cloaks: OverlayResult[] }): void {
  const ranges = { hat: [0.6, 1.2], cloak: [0.8, 1.3] } as const;

  console.log("\n  cosmetic width against the body figure:");
  for (const [kind, list] of [
    ["hat", overlays.hats],
    ["cloak", overlays.cloaks],
  ] as const) {
    const [low, high] = ranges[kind];
    for (const item of list) {
      const pct = item.widthPct;
      const ok = pct >= low && pct <= high;
      console.log(
        "    " + (ok ? "ok  " : "FLAG") + " " + item.id.padEnd(20) +
          String(Math.round(pct * 100)).padStart(4) + "%  " + item.width + "x" + item.height +
          " at y" + item.offset.y +
          "  covers rows " + item.offset.y + "-" + (item.offset.y + item.height) +
          (item.back ? "  +back" : ""),
      );
      if (!ok) {
        suspect.push(
          item.id + " is " + Math.round(pct * 100) + "% of the body's width, outside the " +
            Math.round(low * 100) + "-" + Math.round(high * 100) + "% a " + kind + " should be",
        );
      }
    }
  }
}

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

/** Buildings take a 2x2 tile footprint, portals 1x2, small props one. Height is free. */
function buildProp(file: string, id: string, footprint: "building" | "portal" | "small"): void {
  const cleaned = denoise(removeChroma(load(file)));
  const bounds = alphaBounds(cleaned);
  if (!bounds) {
    note("skipped", `${path.basename(file)} - nothing left after keying`);
    return;
  }

  const cut = crop(cleaned, bounds);
  const targetW = footprint === "building" ? 64 : 32;
  const height = Math.max(16, Math.round((cut.height / cut.width) * targetW));

  const small = downscaleAveraged(cut, targetW, height);
  const palette = [...QUANTISE_RAMP, ...dominantColours(small, 8)];
  const flat = quantise(small, palette);

  save(path.join(OUT, "props", `${id}.png`), flat);
  note("made", `generated/props/${id}.png ${targetW}x${height}`);
}

interface DecorOut {
  map: number;
  items: { id: string; width: number; height: number }[];
}

/**
 * Scenery from the CC0 packs, one sprite per piece per map.
 *
 * Cut per map rather than once per pack because the maps tint differently and
 * a piece is only ever drawn on the map that lists it - so a missing file
 * costs that map one shrub rather than failing the pack for everyone.
 */
function buildDecor(): DecorOut[] {
  const out: DecorOut[] = [];

  for (const map of TERRAIN.maps) {
    const items: DecorOut["items"] = [];

    for (const piece of decorFor(map.map)) {
      const file = path.join(ASSETS, piece.file);
      if (!exists(file)) {
        note("skipped", `decor ${piece.id} - ${piece.file} is missing`);
        continue;
      }

      const cleaned = denoise(removeChroma(load(file)));
      const bounds = alphaBounds(cleaned);
      if (!bounds) {
        note("skipped", `decor ${piece.id} - nothing left after keying`);
        continue;
      }

      const cut = crop(cleaned, bounds);
      const width = Math.max(4, Math.round(piece.tiles * TILE_WIDTH));
      const height = Math.max(4, Math.round((cut.height / cut.width) * width));

      // Pack art is already pixel art at roughly this size, so nearest keeps
      // the edges crisp where the painterly building drops needed averaging.
      const small = width >= cut.width ? scaleNearest(cut, width, height) : downscaleAveraged(cut, width, height);
      save(path.join(OUT, "decor", `${map.map}_${piece.id}.png`), small);
      items.push({ id: piece.id, width, height });
    }

    if (items.length === 0) continue;
    note("made", `generated/decor/map ${map.map}: ${items.map((i) => i.id).join(", ")}`);
    out.push({ map: map.map, items });
  }

  return out;
}


// --------------------------------------------------------------------------
// Terrain
// --------------------------------------------------------------------------

interface TerrainOut {
  map: number;
  name: string;
  tint: string;
  /** Rows in each 32px cell where the diamond is widest - its visual centre. */
  anchors: number[];
}

/**
 * The row where a tile's diamond is widest.
 *
 * The packs mix tiles whose top face sits high in the cell (with a tall side
 * skirt below) and flat ones where it sits near the bottom. Drawing both at the
 * same offset leaves the floor visibly stepped, so the centre is measured here
 * and the client seats each tile by it.
 */
function diamondCentre(tile: Img): number {
  let widest = 0;
  let at = Math.floor(tile.height / 2);
  for (let y = 0; y < tile.height; y += 1) {
    let span = 0;
    for (let x = 0; x < tile.width; x += 1) {
      if (tile.data[idxOf(tile, x, y) + 3]! > 128) span += 1;
    }
    if (span > widest) {
      widest = span;
      at = y;
    }
  }
  return at;
}

const idxOf = (img: Img, x: number, y: number) => (y * img.width + x) * 4;

/**
 * Builds a three-tile strip per map - grass, path, rock - from the CC0 packs.
 *
 * One strip rather than the whole pack: the maps only use three tiles each, and
 * a 96x32 image costs nothing to load next to a 320x320 atlas.
 */
function buildTerrain(): TerrainOut[] {
  const out: TerrainOut[] = [];

  for (const map of TERRAIN.maps) {
    const pack = TERRAIN.packs[map.pack];
    if (!pack) {
      note("skipped", `terrain ${map.name} - no pack named "${map.pack}"`);
      continue;
    }

    const atlasFile = path.join(ASSETS, pack.atlas);
    if (!exists(atlasFile)) {
      note("skipped", `terrain ${map.name} - ${pack.atlas} is missing`);
      continue;
    }

    const atlas = load(atlasFile);
    const size = pack.tileSize;
    const columns = Math.floor(atlas.width / size);

    const order: (keyof typeof map.tiles)[] = ["grass", "path", "rock"];
    const strip = blank(size * order.length, size);
    const anchors: number[] = [];

    for (let i = 0; i < order.length; i += 1) {
      const index = map.tiles[order[i]!];
      const cut = crop(atlas, {
        x: (index % columns) * size,
        y: Math.floor(index / columns) * size,
        width: size,
        height: size,
      });
      anchors.push(diamondCentre(cut));
      blit(strip, cut, i * size, 0);
    }

    save(path.join(OUT, "terrain", `map${map.map}.png`), strip);
    note("found", pack.atlas);
    note(
      "made",
      `generated/terrain/map${map.map}.png (${map.name}: ${order
        .map((k, i) => `${k} #${map.tiles[k]} @y${anchors[i]}`)
        .join(", ")})`,
    );
    out.push({ map: map.map, name: map.name, tint: map.tint, anchors });
  }

  return out;
}


// --------------------------------------------------------------------------
// Dishes
// --------------------------------------------------------------------------

/** Inventory and codex icons are this square. */
const DISH_SIZE = 32;

/**
 * Turns the dish drops into icons.
 *
 * They arrive at 2048x2048 like everything else, which is roughly 3MB apiece -
 * sixty megabytes of PNG to show twenty thumbnails. Keyed, trimmed, averaged
 * down to 32px and quantised onto the palette, the whole set is a few
 * kilobytes and matches the rest of the art.
 */
function buildDishes(): string[] {
  const made: string[] = [];
  const dir = path.join(SRC, "dishes");

  for (let i = 0; i < RECIPES.length; i += 1) {
    const recipe = RECIPES[i]!;
    const file = path.join(dir, recipeFileName(i));
    if (!exists(file)) continue;

    note("found", `sprites/dishes/${recipeFileName(i)}`);
    const cleaned = denoise(removeChroma(load(file)));

    const flat = toIcon(cleaned, DISH_SIZE, true);
    if (!flat) {
      note("skipped", `${recipeFileName(i)} - nothing left after keying`);
      continue;
    }
    save(path.join(OUT, "dishes", `${recipe.id}.png`), flat);
    made.push(recipe.id);
  }

  if (made.length === 0) {
    note("skipped", "sprites/dishes/ - empty, the game will draw placeholders");
  } else {
    note("made", `generated/dishes/ - ${made.length} icons at ${DISH_SIZE}x${DISH_SIZE}`);
  }
  return made;
}

const recipeFileName = (index: number) => `recipe_${String(index + 1).padStart(2, "0")}.png`;


// --------------------------------------------------------------------------
// Nodes and ingredients
// --------------------------------------------------------------------------

/** Gather nodes occupy a single tile. */
const NODE_W = 32;
/** Inventory and codex icons. */
const ITEM_SIZE = 32;

/** Shrinks a cleaned drawing to a target width and puts it on the palette. */
function toIcon(img: Img, width: number, square: boolean): Img | null {
  const bounds = alphaBounds(img);
  if (!bounds) return null;

  const region = square
    ? (() => {
        const side = Math.max(bounds.width, bounds.height);
        return {
          x: bounds.x + Math.round((bounds.width - side) / 2),
          y: bounds.y + Math.round((bounds.height - side) / 2),
          width: side,
          height: side,
        };
      })()
    : bounds;

  const cut = crop(img, region);
  const height = Math.max(1, Math.round((cut.height / cut.width) * width));
  const small = downscaleAveraged(cut, width, height);
  return quantise(small, [...QUANTISE_RAMP, ...dominantColours(small, 10)]);
}

/**
 * Splits each node drop into its full and depleted states.
 *
 * Each drop holds both states in one image. Which way round they sit is not
 * assumed: the two largest blobs decide the axis, and the whole image is then
 * cut on that axis - so the loose sparkles several of these have travel with
 * the state they belong to instead of being dropped or landing on the wrong
 * half. The first state along that axis is the full one.
 */
function buildNodes(): { id: string; layout: string }[] {
  const dir = path.join(SRC, "nodes");
  const made: { id: string; layout: string }[] = [];

  for (const file of listPngs(dir)) {
    const id = file.replace(/\.png$/i, "").replace(/^node_/, "");
    note("found", `sprites/nodes/${file}`);

    const clean = denoise(removeChroma(load(path.join(dir, file))));
    const bounds = alphaBounds(clean);
    const blobs = findBlobs(clean, 3000).slice(0, 2);
    if (!bounds || blobs.length < 2) {
      note("skipped", `${file} - expected two states, found ${blobs.length}`);
      continue;
    }

    const [a, b] = blobs as [Rect, Rect];
    const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    const ca = centre(a);
    const cb = centre(b);
    const horizontal = Math.abs(ca.x - cb.x) >= Math.abs(ca.y - cb.y);
    const mid = Math.round(horizontal ? (ca.x + cb.x) / 2 : (ca.y + cb.y) / 2);

    const halves: Rect[] = horizontal
      ? [
          { x: bounds.x, y: bounds.y, width: mid - bounds.x, height: bounds.height },
          { x: mid, y: bounds.y, width: bounds.x + bounds.width - mid, height: bounds.height },
        ]
      : [
          { x: bounds.x, y: bounds.y, width: bounds.width, height: mid - bounds.y },
          { x: bounds.x, y: mid, width: bounds.width, height: bounds.y + bounds.height - mid },
        ];

    const names = [`node_${id}`, `node_${id}_empty`];
    let ok = true;
    for (let i = 0; i < 2; i += 1) {
      const icon = toIcon(crop(clean, halves[i]!), NODE_W, false);
      if (!icon) {
        note("skipped", `${file} - ${i === 0 ? "full" : "depleted"} half is empty`);
        ok = false;
        break;
      }
      save(path.join(OUT, "nodes", `${names[i]}.png`), icon);
    }
    if (!ok) continue;

    const layout = horizontal ? "left/right" : "top/bottom";
    made.push({ id, layout });
    note("made", `generated/nodes/node_${id}{,_empty}.png (${layout})`);
  }

  if (made.length === 0) {
    note("skipped", "sprites/nodes/ - empty, the game will draw placeholders");
  }
  return made;
}

/** Ingredient icons, same treatment as dishes. */
function buildIngredients(): string[] {
  const dir = path.join(SRC, "ingredients");
  const made: string[] = [];

  for (const ing of INGREDIENTS) {
    const file = path.join(dir, `${ing.id}.png`);
    if (!exists(file)) continue;

    note("found", `sprites/ingredients/${ing.id}.png`);
    const icon = toIcon(denoise(removeChroma(load(file))), ITEM_SIZE, true);
    if (!icon) {
      note("skipped", `${ing.id}.png - nothing left after keying`);
      continue;
    }
    save(path.join(OUT, "ingredients", `${ing.id}.png`), icon);
    made.push(ing.id);
  }

  if (made.length === 0) {
    note("skipped", "sprites/ingredients/ - empty, the game will draw placeholders");
  } else {
    note("made", `generated/ingredients/ - ${made.length} icons at ${ITEM_SIZE}px`);
  }
  return made;
}

// --------------------------------------------------------------------------
// Optional art
// --------------------------------------------------------------------------

/**
 * Records which of the not-yet-drawn folders have art in them.
 *
 * The client loads these by convention and falls back to generated placeholders
 * when they are absent, so an empty folder here is information, not a failure.
 */
function surveyOptional(): Record<string, string[]> {
  const wanted: Record<string, string[]> = {
    ui: ["scroll_card", "ribbon", "button", "slot", "xp_bar", "heat_bar"].map((n) => `${n}.png`),
    effects: ["steam", "sizzle", "sparkle", "levelup"].map((n) => `${n}.png`),
  };

  const present: Record<string, string[]> = {};
  for (const [folder, names] of Object.entries(wanted)) {
    const have = new Set(listPngs(path.join(SRC, folder)));
    const hits = names.filter((n) => have.has(n));
    present[folder] = hits;
    for (const hit of hits) note("found", `sprites/${folder}/${hit}`);
    if (hits.length === 0) {
      note("skipped", `sprites/${folder}/ - empty, the game will draw placeholders`);
    }
  }
  return present;
}

// --------------------------------------------------------------------------
// Pipeline
// --------------------------------------------------------------------------

/**
 * Re-cut one item only.
 *
 * The alignment workbench's Reset button uses this: an overlay that has been
 * erased by hand has no undo beyond going back to the source, and re-running
 * the whole pipeline to recover one hat would also overwrite the other fifteen
 * a user may have already cleaned.
 */
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;

function main() {
  console.log("process-sprites" + (only ? " (only " + only + ")" : "") + "\n");
  fs.mkdirSync(OUT, { recursive: true });

  // --- bodies -------------------------------------------------------------
  const bodies: Record<
    string,
    { scale: number; frames: string[]; walk: Record<string, WalkCycle> }
  > = {};
  const cycles: Record<string, Record<string, WalkCycle>> = {};
  let baseForOverlays: OverlayBase | null = null;

  for (const body of ["male", "female"] as const) {
    const built = buildBody(body);
    if (!built) continue;
    writeSheet(body, built.frames);

    /*
     * How each direction is played, decided from the finished frames rather
     * than assumed. The client reads this out of the manifest, so a sheet
     * with a dead frame in it gets a ping-pong without anybody editing code.
     */
    const walk: Record<string, WalkCycle> = {};
    for (const direction of DIRECTIONS) {
      const ordered = [0, 1, 2, 3]
        .map((i) => built.frames.find((f) => f.name === body + "_walk_" + direction + "_" + i))
        .filter((f): f is Frame => f !== undefined);
      if (ordered.length === 4) walk[direction] = analyseWalk(ordered.map((f) => f.img));
    }
    cycles[body] = walk;

    bodies[body] = { scale: built.scale, frames: built.frames.map((f) => f.name), walk };

    // The overlays are diffed against the male front pose, which is the figure
    // every hat and cloak drop is fitted against.
    if (body === "male" && !baseForOverlays) {
      const grid = readGrid(path.join(SRC, "characters", "male_idle.png"));
      if (grid) {
        // The front idle cell, cropped exactly as buildBody crops it, so the
        // overlay is cut in the same pixels and scaled by the same factor.
        /*
         * Measured off the finished frame, not the source drawing.
         *
         * The body sheet is what a cosmetic actually sits on, so the figure's
         * width and centre are read from the frame the pipeline just wrote -
         * 25px wide, centred on x=16 - rather than derived from the 2048px
         * drawing it came from.
         */
        const front = crop(grid.clean, grid.cells[0]!);
        const frameScale = BODY_H / front.height;
        const figureWidth = Math.max(1, Math.round(front.width * frameScale));
        baseForOverlays = {
          figureWidth,
          centreX: Math.round(BODY_W / 2),
        };
      }
    }
  }

  // --- overlays -----------------------------------------------------------
  const overlays: { hats: OverlayResult[]; cloaks: OverlayResult[] } = { hats: [], cloaks: [] };

  if (baseForOverlays) {
    console.log(
      "  body: figure " + baseForOverlays.figureWidth + "px wide in a " + BODY_W + "x" +
        BODY_H + " frame, centred on x" + baseForOverlays.centreX,
    );
    for (const [folder, kind] of [
      ["hats", "hat"],
      ["cloaks", "cloak"],
    ] as const) {
      for (const file of listPngs(path.join(SRC, folder))) {
        // A back view belongs to the item in front of it, not to itself.
        if (/_back\.png$/i.test(file)) continue;
        const id = file.replace(/\.png$/i, "");
        if (only && id !== only) continue;
        note("found", `sprites/${folder}/${file}`);
        const result = buildOverlay(path.join(SRC, folder, file), id, kind, baseForOverlays);
        if (result) overlays[folder].push(result);
      }
    }
    auditOverlays(overlays);
  } else {
    note("skipped", "hats and cloaks - no base body to size against");
  }

  if (Object.keys(cycles).length > 0) auditWalkCycles(cycles);

  if (only) return finishOne(overlays);

  // --- props --------------------------------------------------------------
  const propSpec: [string, "building" | "portal" | "small"][] = [
    ["kitchen", "building"],
    ["tavern", "building"],
    ["shop", "building"],
    ["portal_meadows", "portal"],
    ["portal_forest", "portal"],
    ["portal_caves", "portal"],
    // Named plaza dressing. Absent art costs the hub one prop, nothing else.
    ["prop_well", "small"],
    ["prop_lantern", "small"],
    ["prop_campfire", "small"],
    ["prop_signpost", "small"],
    ["prop_cottage", "building"],
    ["prop_cart", "small"],
  ];
  const props: string[] = [];
  /*
   * The building drops landed in assets/buildings/ rather than
   * assets/sprites/buildings/. Both are accepted: which folder art arrives in
   * is not worth a manual move, and the report says where each one was found.
   */
  const buildingDirs = [path.join(SRC, "buildings"), path.join(ASSETS, "buildings")];
  for (const [id, footprint] of propSpec) {
    const file = buildingDirs.map((dir) => path.join(dir, `${id}.png`)).find(exists);
    if (!file) {
      note(
        "skipped",
        `${id}.png - not in sprites/buildings/ or buildings/, the game will draw a placeholder`,
      );
      continue;
    }
    note("found", path.relative(ASSETS, file));
    buildProp(file, id, footprint);
    props.push(id);
  }

  // --- dishes, ingredients and nodes ---------------------------------------
  const dishes = buildDishes();
  const ingredientIcons = buildIngredients();
  const nodes = buildNodes();

  // --- terrain ------------------------------------------------------------
  const terrain = buildTerrain();
  const decor = buildDecor();

  // --- manifest -----------------------------------------------------------
  const optional = surveyOptional();
  const manifest = {
    generatedAt: new Date().toISOString(),
    bodyFrame: { width: BODY_W, height: BODY_H },
    bodies,
    hats: overlays.hats,
    cloaks: overlays.cloaks,
    props,
    dishes,
    ingredients: ingredientIcons,
    nodes,
    terrain,
    decor,
    optional,
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  note("made", "generated/manifest.json");

  report();
}

function report() {
  console.log(`  found   ${found.length} source file(s)`);
  for (const f of found) console.log(`    + ${f}`);
  console.log(`\n  made    ${made.length} output(s)`);
  for (const m of made) console.log(`    > ${m}`);
  if (skipped.length > 0) {
    console.log(`\n  skipped ${skipped.length}`);
    for (const s of skipped) console.log(`    - ${s}`);
  }
  if (suspect.length > 0) {
    console.log(`\n  SUSPECT ${suspect.length} - written, but they do not look right`);
    for (const item of suspect) console.log(`    ! ${item}`);
  }
  console.log("\nprocess-sprites: done");
}

/**
 * Merges a single re-cut overlay back into the manifest already on disk.
 *
 * Rewriting the whole manifest from a partial run would drop every prop, dish
 * and terrain entry the last full run produced.
 */
function finishOne(overlays: { hats: OverlayResult[]; cloaks: OverlayResult[] }) {
  const file = path.join(OUT, "manifest.json");
  if (!exists(file)) {
    console.log("  no manifest.json yet - run the whole pipeline once first");
    report();
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as {
    hats: OverlayResult[];
    cloaks: OverlayResult[];
    generatedAt: string;
  };

  for (const kind of ["hats", "cloaks"] as const) {
    for (const entry of overlays[kind]) {
      const at = manifest[kind].findIndex((e) => e.id === entry.id);
      if (at >= 0) manifest[kind][at] = entry;
      else manifest[kind].push(entry);
    }
  }
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  note("made", "generated/manifest.json (one entry merged)");
  report();
}

main();
