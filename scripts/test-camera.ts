/**
 * Checks the camera maths at real viewport sizes.
 *
 * The camera itself needs a browser, but the decisions it makes - what zoom to
 * use, whether the map still fills the view, how far it may scroll before
 * showing past the edge - are pure functions. Those are what this asserts, so
 * "it fills the window at 3x and clamps to the map" is a claim with a check
 * behind it rather than a screenshot taken once.
 *
 *   npx tsx scripts/test-camera.ts
 */

import { MAP_SIZE, TILE_HEIGHT, TILE_WIDTH } from "@crazycauldron/shared";
import {
  DESKTOP_ZOOM,
  LABEL_SCREEN_PX,
  MAP_WORLD_BOUNDS,
  labelScale,
  planCamera,
  scrollRange,
  zoomForViewport,
} from "../client/src/map/camera.js";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

console.log("test-camera\n");

// --- the map rectangle -----------------------------------------------------
console.log("-- map bounds --");
check(
  "spans the full isometric diamond",
  MAP_WORLD_BOUNDS.width === MAP_SIZE * TILE_WIDTH &&
    MAP_WORLD_BOUNDS.height === MAP_SIZE * TILE_HEIGHT,
  `${MAP_WORLD_BOUNDS.width}x${MAP_WORLD_BOUNDS.height}`,
);
check(
  "is centred on x=0, where tileToWorld puts the grid",
  MAP_WORLD_BOUNDS.x + MAP_WORLD_BOUNDS.width / 2 === 0,
  `x ${MAP_WORLD_BOUNDS.x}`,
);

// --- zoom ------------------------------------------------------------------
console.log("\n-- zoom by viewport width --");
const zoomCases: [number, number, string][] = [
  [1920, 3, "desktop"],
  [1440, 3, "laptop"],
  [900, 3, "exactly 900 is not under 900"],
  [899, 2, "just under 900"],
  [768, 2, "tablet"],
  [601, 2, "just above the phone step"],
  [600, 2, "exactly 600 is not under 600"],
  [599, 1.5, "just under 600"],
  [390, 1.5, "phone"],
];
for (const [width, want, note] of zoomCases) {
  const got = zoomForViewport(width);
  check(`${String(width).padStart(4)}px -> ${want}x`, got === want, `${note}, got ${got}x`);
}
check("desktop constant matches the brief", DESKTOP_ZOOM === 3);

// --- tiles land on whole pixels -------------------------------------------
console.log("\n-- pixel alignment --");
for (const zoom of [1.5, 2, 3]) {
  const w = TILE_WIDTH * zoom;
  const h = TILE_HEIGHT * zoom;
  check(
    `a ${TILE_WIDTH}x${TILE_HEIGHT} tile at ${zoom}x is ${w}x${h}`,
    Number.isInteger(w) && Number.isInteger(h),
    "whole pixels",
  );
}

// --- filling the window ----------------------------------------------------
console.log("\n-- full-width window (1920x1080) --");
const wide = planCamera(1920, 1080);
check("uses 3x", wide.zoom === 3);
check(
  "map is wider than the view, so it scrolls horizontally",
  !wide.fitsX,
  `map ${MAP_WORLD_BOUNDS.width} vs view ${wide.view.width.toFixed(0)}`,
);
// 1080p at 3x sees 640x360 world px, and the map is 768x384 - so it is a
// little larger on BOTH axes and the camera scrolls in both.
check(
  "map is taller than the view too, so it also scrolls vertically",
  !wide.fitsY,
  `map ${MAP_WORLD_BOUNDS.height} vs view ${wide.view.height.toFixed(0)}`,
);
check("not entirely visible, so the camera follows", !wide.fitsEntirely);

const wideRange = scrollRange(wide);
check(
  "horizontal scroll stops at the map edges",
  wideRange.minX === MAP_WORLD_BOUNDS.x &&
    Math.round(wideRange.maxX) ===
      Math.round(MAP_WORLD_BOUNDS.x + MAP_WORLD_BOUNDS.width - wide.view.width),
  `${wideRange.minX.toFixed(0)}..${wideRange.maxX.toFixed(0)}`,
);
check(
  "vertical scroll stops at the map edges",
  wideRange.minY === MAP_WORLD_BOUNDS.y &&
    Math.round(wideRange.maxY) ===
      Math.round(MAP_WORLD_BOUNDS.y + MAP_WORLD_BOUNDS.height - wide.view.height),
  `${wideRange.minY.toFixed(0)}..${wideRange.maxY.toFixed(0)}`,
);
check(
  "the camera never scrolls past the right edge",
  wideRange.maxX + wide.view.width <= MAP_WORLD_BOUNDS.x + MAP_WORLD_BOUNDS.width + 0.001,
  "no empty space beyond the map",
);

// --- narrow window ---------------------------------------------------------
console.log("\n-- narrow window (800x900) --");
const narrow = planCamera(800, 900);
check("steps down to 2x", narrow.zoom === 2);
check(
  "map still wider than the view",
  !narrow.fitsX,
  `map ${MAP_WORLD_BOUNDS.width} vs view ${narrow.view.width.toFixed(0)}`,
);
check(
  "at 2x a 900px-tall window sees the whole map height",
  narrow.fitsY,
  `map ${MAP_WORLD_BOUNDS.height} vs view ${narrow.view.height.toFixed(0)}`,
);

// --- phone -----------------------------------------------------------------
console.log("\n-- phone (390x844) --");
const phone = planCamera(390, 844);
check("uses 1.5x", phone.zoom === 1.5);
check(
  "map is far wider than the view",
  !phone.fitsX,
  `view ${phone.view.width.toFixed(0)} world px`,
);
check(
  "sees at least 8 tiles across",
  phone.view.width / TILE_WIDTH >= 8,
  `${(phone.view.width / TILE_WIDTH).toFixed(1)} tiles`,
);

// --- a view larger than the map -------------------------------------------
console.log("\n-- a view larger than the map --");

// A 1440p monitor at 3x sees 853x480 world px, which swallows the 768x384 map
// whole. Nothing is left to scroll, so the map should be centred.
const big = planCamera(2560, 1440);
check(
  "1440p at 3x fits the entire map",
  big.fitsEntirely,
  `view ${big.view.width.toFixed(0)}x${big.view.height.toFixed(0)} vs map ${MAP_WORLD_BOUNDS.width}x${MAP_WORLD_BOUNDS.height}`,
);
const bigRange = scrollRange(big);
check(
  "so there is no scroll range to speak of",
  bigRange.minX === bigRange.maxX && bigRange.minY === bigRange.maxY,
  "the camera centres the map instead of following",
);
check(
  "and the centre is the middle of the map",
  big.centre.x === 0 && big.centre.y === MAP_WORLD_BOUNDS.height / 2,
  `${big.centre.x},${big.centre.y}`,
);

const forced = planCamera(599, 2000, MAP_WORLD_BOUNDS); // 1.5x, very tall
check(
  "a tall narrow window fits the map vertically and centres that axis",
  forced.fitsY && !forced.fitsX,
  `view height ${forced.view.height.toFixed(0)} vs map ${MAP_WORLD_BOUNDS.height}`,
);

// A genuinely oversized view: the whole map fits, so nothing should scroll.
const tiny = planCamera(1200, 800, { x: -100, y: 0, width: 200, height: 100 });
check("a map smaller than the view fits entirely", tiny.fitsEntirely);
const tinyRange = scrollRange(tiny);
check(
  "and has no scroll range at all",
  tinyRange.minX === tinyRange.maxX && tinyRange.minY === tinyRange.maxY,
  "so the camera centres it",
);
check(
  "centre is the middle of the map",
  tiny.centre.x === 0 && tiny.centre.y === 50,
  `${tiny.centre.x},${tiny.centre.y}`,
);

// --- labels ----------------------------------------------------------------
console.log("\n-- label scaling --");
for (const zoom of [1.5, 2, 3]) {
  const onScreen = LABEL_SCREEN_PX * labelScale(zoom) * zoom;
  check(
    `a label reads ${LABEL_SCREEN_PX}px on screen at ${zoom}x`,
    Math.abs(onScreen - LABEL_SCREEN_PX) < 1e-9,
    `${onScreen.toFixed(2)}px`,
  );
}

console.log(`\n${failures === 0 ? "test-camera: OK" : `test-camera: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
