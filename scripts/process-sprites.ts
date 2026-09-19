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
import { QUANTISE_RAMP, RECIPES, INGREDIENTS } from "@crazycauldron/shared";
import {
  alphaBounds,
  bestAlignment,
  blank,
  blit,
  crop,
  denoise,
  differenceMask,
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
 * Extracts one garment by subtracting the base body from the dressed figure.
 *
 * `region` decides what survives the crop: a hat keeps everything above the
 * shoulder seam, an apron everything below it.
 */
function buildOverlay(
  file: string,
  id: string,
  kind: "hat" | "apron",
  base: { img: Img; bounds: Rect; shoulder: number },
  scale: number,
): OverlayResult | null {
  const dressed = denoise(removeChroma(load(file)));
  const dressedBounds = alphaBounds(dressed);
  if (!dressedBounds) {
    note("skipped", `${path.basename(file)} - nothing left after keying`);
    return null;
  }

  // Match on the lower face and torso: the part both drawings share whatever
  // is on the head.
  const compare: Rect = {
    x: base.bounds.x,
    y: base.shoulder,
    width: base.bounds.width,
    height: Math.round(base.bounds.height * 0.35),
  };
  const offset = bestAlignment(base.img, dressed, compare);
  const diff = differenceMask(base.img, dressed, offset);

  // Keep only the half of the figure this garment belongs to.
  const margin = Math.round(base.bounds.height * 0.06);
  const band: Rect =
    kind === "hat"
      ? { x: 0, y: 0, width: diff.width, height: base.shoulder + margin }
      : {
          x: 0,
          y: base.shoulder - margin,
          width: diff.width,
          height: diff.height - (base.shoulder - margin),
        };

  const banded = blank(diff.width, diff.height);
  blit(banded, crop(diff, band), band.x, band.y);

  const cleaned = denoise(banded, 4);
  const bounds = alphaBounds(cleaned);
  if (!bounds || bounds.width < 8 || bounds.height < 8) {
    note("skipped", `${path.basename(file)} - diff produced no ${kind} region`);
    return null;
  }

  const cut = crop(cleaned, bounds);
  const w = Math.max(1, Math.round(cut.width * scale));
  const h = Math.max(1, Math.round(cut.height * scale));
  const small = scaleNearest(cut, w, h);

  // The canvas is generous for the two hats that reach past the head, so they
  // are never clipped.
  const tall = TALL_HATS.has(id);
  const canvasW = kind === "hat" ? (tall ? TALL_HAT_W : HAT_W) : APRON_W;
  const canvasH = kind === "hat" ? (tall ? TALL_HAT_H : HAT_H) : APRON_H;
  const canvas = blank(Math.max(canvasW, w), Math.max(canvasH, h));
  const dx = Math.round((canvas.width - w) / 2);
  const dy = kind === "hat" ? Math.max(0, canvas.height - h) : 0;
  blit(canvas, small, dx, dy);

  // Offset relative to the body frame: where this garment's box sat on the
  // base figure, in body-frame pixels.
  const bodyLeft = base.bounds.x;
  const bodyBottom = base.bounds.y + base.bounds.height;
  const offsetX = Math.round((bounds.x - bodyLeft) * scale) - dx +
    Math.round((BODY_W - base.bounds.width * scale) / 2);
  const offsetY = BODY_H - Math.round((bodyBottom - bounds.y) * scale) - dy;

  save(path.join(OUT, kind === "hat" ? "hats" : "aprons", `${id}.png`), canvas);
  note("made", `generated/${kind}s/${id}.png ${canvas.width}x${canvas.height}`);

  /*
   * A garment much bigger than the body it sits on means the subtraction found
   * more than the garment - usually because the drop was drawn on a different
   * base than the one being diffed against. Worth saying out loud rather than
   * shipping a hat that is three heads wide.
   */
  const plausibleW = kind === "hat" ? HAT_W * 1.5 : APRON_W * 1.5;
  const plausibleH = kind === "hat" ? TALL_HAT_H : APRON_H * 1.4;
  if (canvas.width > plausibleW || canvas.height > plausibleH) {
    suspect.push(
      `${id} came out ${canvas.width}x${canvas.height}, expected about ${
        kind === "hat" ? `${HAT_W}x${HAT_H}` : `${APRON_W}x${APRON_H}`
      } - the diff kept more than the ${kind}`,
    );
  }

  return {
    id,
    width: canvas.width,
    height: canvas.height,
    offset: { x: offsetX, y: offsetY },
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
    ingredients: INGREDIENTS.map((i) => `${i.id}.png`),
    dishes: RECIPES.map((_, i) => `recipe_${String(i + 1).padStart(2, "0")}.png`),
    nodes: INGREDIENTS.flatMap((i) => [`node_${i.id}.png`, `node_${i.id}_empty.png`]),
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

  // --- manifest -----------------------------------------------------------
  const optional = surveyOptional();
  const manifest = {
    generatedAt: new Date().toISOString(),
    bodyFrame: { width: BODY_W, height: BODY_H },
    bodies,
    hats: overlays.hats,
    aprons: overlays.aprons,
    props,
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
