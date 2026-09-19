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
import { QUANTISE_RAMP, RECIPES, INGREDIENTS, TERRAIN } from "@crazycauldron/shared";
import {
  alphaBounds,
  blank,
  blit,
  crop,
  denoise,
  dominantColours,
  downscaleAveraged,
  findBlobs,
  load,
  quantise,
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
const ASSETS = path.join(ROOT, "client", "public", "assets");
const SRC = path.join(ASSETS, "sprites");
const OUT = path.join(ASSETS, "generated");

/** Body frames are this size; 48 tall is the figure, 32 wide fits the widest pose. */
const BODY_W = 32;
const BODY_H = 48;

/** Hats that reach well past the head outline and must not be clipped. */
const TALL_HATS = new Set(["hat_06_dragonscale", "hat_07_moonpetal"]);
const HAT_W = 32;
const HAT_H = 28;
const TALL_HAT_W = 44;
const TALL_HAT_H = 40;
const APRON_W = 32;
const APRON_H = 30;

/**
 * How much of each figure a garment band covers, as fractions.
 *
 * HAT_BAND is measured down from the top of the head: 0.62 stops at the brow,
 * keeping hat and hairline but not the face. The apron band runs from just
 * below the shoulders to the hip.
 */
const HAT_BAND = 0.62;
const APRON_TOP = 0.1;
const APRON_BOTTOM = 0.62;

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
 * Every frame of one body, at a single scale.
 *
 * The scale comes from the tallest drawing across all of that body's files, so
 * a walk cycle keeps its bob instead of every frame being stretched to the same
 * height. Frames are anchored bottom-centre, which is where a character's feet
 * are and therefore what must not wander between frames.
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
  let tallest = 0;
  for (const source of sources) {
    const grid = readGrid(source.file);
    if (!grid) continue;
    note("found", path.relative(ASSETS, source.file));
    grids.set(source.key, grid);
    for (const cell of grid.cells) tallest = Math.max(tallest, cell.height);
  }
  if (!grids.has("idle")) return null;

  const scale = BODY_H / tallest;
  const frames: Frame[] = [];

  const place = (clean: Img, cell: Rect, name: string) => {
    const cut = crop(clean, cell);
    const w = Math.max(1, Math.round(cut.width * scale));
    const h = Math.max(1, Math.round(cut.height * scale));
    const small = scaleNearest(cut, w, h);

    const canvas = blank(BODY_W, BODY_H);
    blit(canvas, small, Math.round((BODY_W - w) / 2), BODY_H - h);
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

/**
 * Where the shoulders start, as a row index into the body drawing.
 *
 * Walking down the figure, the silhouette is narrow through the hat and head
 * and then widens sharply at the shoulders. The first row past the halfway
 * mark of the head that is much wider than the head is a good enough seam, and
 * it is what keeps a neckerchief out of a hat overlay.
 */
function shoulderRow(body: Img, bounds: Rect): number {
  const widths = rowWidths(body);
  const headBand = widths.slice(bounds.y, bounds.y + Math.round(bounds.height * 0.35));
  const headWidth = Math.max(1, Math.max(...headBand));

  for (let y = bounds.y + Math.round(bounds.height * 0.15); y < bounds.y + bounds.height; y += 1) {
    if ((widths[y] ?? 0) > headWidth * 1.25) return y;
  }
  return bounds.y + Math.round(bounds.height * 0.42);
}

interface OverlayResult {
  id: string;
  width: number;
  height: number;
  /** Where the overlay sits relative to the body frame, top-left to top-left. */
  offset: { x: number; y: number };
}

/**
 * Widest row in the lower half of a figure - its shoulders.
 *
 * Used as the scale reference between drawings, because it is the one
 * measurement both a bust and a full-body pose share, whatever is on the head.
 */
function torsoWidth(img: Img, bounds: Rect): number {
  const widths = rowWidths(img);
  const from = bounds.y + Math.round(bounds.height * 0.4);
  let widest = 1;
  for (let y = from; y < bounds.y + bounds.height; y += 1) {
    widest = Math.max(widest, widths[y] ?? 0);
  }
  return widest;
}

/**
 * Cuts a garment out of a character drawing by anatomy rather than by
 * subtraction.
 *
 * Subtracting the base body was the plan, and it cannot work with these drops:
 * they are not the same figure re-dressed. The hats are head-and-shoulders
 * portraits, the aprons are full-body but in a different pose holding a spoon,
 * and both have different hair - so after scaling and aligning, fewer than one
 * pixel in five of the shared torso agrees, and the difference keeps the whole
 * character. scripts/debug-overlay.ts renders the evidence.
 *
 * What does work is cutting the band the garment lives in: the top of the head
 * for a hat, the chest-to-hip for an apron. The hairline comes along with a
 * hat, which composites acceptably because it is the same character design,
 * and /dev/align exists to put the result exactly where it belongs.
 */
function buildOverlay(
  file: string,
  id: string,
  kind: "hat" | "apron",
  base: { img: Img; bounds: Rect; shoulder: number },
  bodyScale: number,
): OverlayResult | null {
  const dressed = denoise(removeChroma(load(file)));
  const bounds = alphaBounds(dressed);
  if (!bounds) {
    note("skipped", `${path.basename(file)} - nothing left after keying`);
    return null;
  }

  /*
   * Two factors, both needed. The first matches the drawings to each other by
   * shoulder width - the drops are drawn far larger than the 2x2 idle sheet,
   * roughly 4x for a bust and 2x for a full body. The second takes the base
   * drawing down to the 32x48 body frame. Applying only the first leaves a hat
   * ten times too big, which is exactly what it did.
   */
  const matchBase = torsoWidth(base.img, base.bounds) / torsoWidth(dressed, bounds);
  const scale = matchBase * bodyScale;
  const shoulder = shoulderRow(dressed, bounds);

  const headHeight = Math.max(1, shoulder - bounds.y);
  const bodyHeight = Math.max(1, bounds.y + bounds.height - shoulder);

  // The band the garment occupies, as rows of the source drawing.
  const band: Rect =
    kind === "hat"
      ? {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          // Down to the brow: everything above the eyes is hat and hairline.
          height: Math.round(headHeight * HAT_BAND),
        }
      : {
          x: bounds.x,
          y: shoulder + Math.round(bodyHeight * APRON_TOP),
          width: bounds.width,
          height: Math.round(bodyHeight * (APRON_BOTTOM - APRON_TOP)),
        };

  const cut = crop(denoise(dressed, 4), band);
  const trimmed = alphaBounds(cut);
  if (!trimmed || trimmed.width < 8 || trimmed.height < 4) {
    note("skipped", `${path.basename(file)} - no ${kind} pixels in the expected band`);
    return null;
  }

  const tight = crop(cut, trimmed);
  const w = Math.max(1, Math.round(tight.width * scale));
  const h = Math.max(1, Math.round(tight.height * scale));
  const small = scaleNearest(tight, w, h);

  const canvas = blank(w, h);
  blit(canvas, small, 0, 0);

  /*
   * Default placement, in body-frame pixels. A hat hangs from the brow line, an
   * apron from the shoulder line - both measured on the base figure, so the
   * defaults are already close and the alignment tool only has to nudge.
   */
  const baseHead = Math.max(1, base.shoulder - base.bounds.y);
  const frameOf = (rows: number) => Math.round((rows / base.bounds.height) * BODY_H);

  const offsetY =
    kind === "hat"
      ? frameOf(baseHead * HAT_BAND) - h
      : frameOf(base.shoulder - base.bounds.y + baseHead * 0.1);

  save(path.join(OUT, kind === "hat" ? "hats" : "aprons", `${id}.png`), canvas);
  note("made", `generated/${kind}s/${id}.png ${w}x${h}`);

  const plausibleW = kind === "hat" ? HAT_W * 1.5 : APRON_W * 1.5;
  const plausibleH = kind === "hat" ? TALL_HAT_H : APRON_H * 1.6;
  if (w > plausibleW || h > plausibleH) {
    suspect.push(
      `${id} came out ${w}x${h}, expected about ${
        kind === "hat" ? `${HAT_W}x${HAT_H}` : `${APRON_W}x${APRON_H}`
      } - the band kept more than the ${kind}`,
    );
  }

  return {
    id,
    width: w,
    height: h,
    offset: { x: Math.round((BODY_W - w) / 2), y: offsetY },
  };
}

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

/** Buildings take a 2x2 tile footprint, portals 1x2. Height is free. */
function buildProp(file: string, id: string, footprint: "building" | "portal"): void {
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

function main() {
  console.log("process-sprites\n");
  fs.mkdirSync(OUT, { recursive: true });

  // --- bodies -------------------------------------------------------------
  const bodies: Record<string, { scale: number; frames: string[] }> = {};
  let baseForOverlays: { img: Img; bounds: Rect; shoulder: number; scale: number } | null = null;

  for (const body of ["male", "female"] as const) {
    const built = buildBody(body);
    if (!built) continue;
    writeSheet(body, built.frames);
    bodies[body] = { scale: built.scale, frames: built.frames.map((f) => f.name) };

    // The overlays are diffed against the male front pose, which is the figure
    // every hat and apron drop was drawn from.
    if (body === "male" && !baseForOverlays) {
      const grid = readGrid(path.join(SRC, "characters", "male_idle.png"));
      if (grid) {
        const frontCell = grid.cells[0]!;
        const front = blank(grid.clean.width, grid.clean.height);
        blit(front, crop(grid.clean, frontCell), frontCell.x, frontCell.y);
        const bounds = alphaBounds(front)!;
        baseForOverlays = {
          img: front,
          bounds,
          shoulder: shoulderRow(front, bounds),
          scale: built.scale,
        };
      }
    }
  }

  // --- overlays -----------------------------------------------------------
  const overlays: { hats: OverlayResult[]; aprons: OverlayResult[] } = { hats: [], aprons: [] };

  if (baseForOverlays) {
    console.log(`  base front pose: shoulder seam at row ${baseForOverlays.shoulder}\n`);
    for (const [folder, kind] of [
      ["hats", "hat"],
      ["aprons", "apron"],
    ] as const) {
      for (const file of listPngs(path.join(SRC, folder))) {
        const id = file.replace(/\.png$/i, "");
        note("found", `sprites/${folder}/${file}`);
        const result = buildOverlay(
          path.join(SRC, folder, file),
          id,
          kind,
          baseForOverlays,
          baseForOverlays.scale,
        );
        if (result) overlays[folder].push(result);
      }
    }
  } else {
    note("skipped", "hats and aprons - no base body to diff against");
  }

  // --- props --------------------------------------------------------------
  const propSpec: [string, "building" | "portal"][] = [
    ["kitchen", "building"],
    ["tavern", "building"],
    ["shop", "building"],
    ["portal_meadows", "portal"],
    ["portal_forest", "portal"],
    ["portal_caves", "portal"],
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

  // --- manifest -----------------------------------------------------------
  const optional = surveyOptional();
  const manifest = {
    generatedAt: new Date().toISOString(),
    bodyFrame: { width: BODY_W, height: BODY_H },
    bodies,
    hats: overlays.hats,
    aprons: overlays.aprons,
    props,
    dishes,
    ingredients: ingredientIcons,
    nodes,
    terrain,
    optional,
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  note("made", "generated/manifest.json");

  // --- report -------------------------------------------------------------
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

main();
