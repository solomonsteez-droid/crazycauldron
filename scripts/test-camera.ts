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

import { CELL, HUB_MAP, areaFor } from "@crazycauldron/shared";
import {
  DESKTOP_ZOOM,
  LABEL_SCREEN_PX,
  MAP_WORLD_BOUNDS,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEPS,
  clampZoom,
  labelScale,
  parseStoredZoom,
  planCamera,
  scrollRange,
  scrollToHold,
  snapZoom,
  stepZoom,
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
const hub = areaFor(HUB_MAP);
check(
  "is the painting, exactly",
  MAP_WORLD_BOUNDS.width === hub.cols * CELL && MAP_WORLD_BOUNDS.height === hub.rows * CELL,
  `${MAP_WORLD_BOUNDS.width}x${MAP_WORLD_BOUNDS.height} for ${hub.cols}x${hub.rows} cells`,
);
check(
  "starts at the origin",
  MAP_WORLD_BOUNDS.x === 0 && MAP_WORLD_BOUNDS.y === 0,
  `${MAP_WORLD_BOUNDS.x},${MAP_WORLD_BOUNDS.y}`,
);
check(
  "a character is about a twelfth of the map's height",
  Math.abs(MAP_WORLD_BOUNDS.height / 48 - 12) < 0.5,
  `${(MAP_WORLD_BOUNDS.height / 48).toFixed(1)} characters tall`,
);

// --- zoom ------------------------------------------------------------------
console.log("\n-- zoom by viewport width --");
const zoomCases: [number, number, string][] = [
  [1920, 2, "desktop"],
  [1440, 2, "laptop"],
  [900, 2, "exactly 900 is not under 900"],
  [899, 1.75, "just under 900"],
  [768, 1.75, "tablet"],
  [601, 1.75, "just above the phone step"],
  [600, 1.75, "exactly 600 is not under 600"],
  [599, 1.5, "just under 600"],
  [390, 1.5, "phone"],
];
for (const [width, want, note] of zoomCases) {
  const got = zoomForViewport(width);
  check(`${String(width).padStart(4)}px -> ${want}x`, got === want, `${note}, got ${got}x`);
}
check("desktop starts at 2x", DESKTOP_ZOOM === 2);

// --- cells land on whole pixels -------------------------------------------
console.log("\n-- pixel alignment --");
for (const zoom of ZOOM_STEPS) {
  const size = CELL * zoom;
  check(`a ${CELL}px cell at ${zoom}x is ${size}px`, Number.isInteger(size), "whole pixels");
}

// --- the zoom control -----------------------------------------------------
console.log("\n-- zooming --");
check(`the range is ${ZOOM_MIN}x to ${ZOOM_MAX}x`, ZOOM_MIN === 1.25 && ZOOM_MAX === 4);
check("and nothing escapes it", clampZoom(0.2) === ZOOM_MIN && clampZoom(99) === ZOOM_MAX);

check("a pinch settles on the nearest step", snapZoom(2.6) === 2.5, String(snapZoom(2.6)));
check("and cannot settle off the ends", snapZoom(0.1) === ZOOM_MIN && snapZoom(50) === ZOOM_MAX);
check(
  "every step snaps to itself",
  ZOOM_STEPS.every((step) => snapZoom(step) === step),
);

check("a wheel click in moves one step", stepZoom(2, 1) === 2.5, String(stepZoom(2, 1)));
check("and out moves one back", stepZoom(2, -1) === 1.75, String(stepZoom(2, -1)));
check("the ends hold", stepZoom(ZOOM_MAX, 1) === ZOOM_MAX && stepZoom(ZOOM_MIN, -1) === ZOOM_MIN);
check(
  "a click after a pinch moves a whole step rather than settling it",
  stepZoom(2.61, 1) === 3,
  String(stepZoom(2.61, 1)),
);

/*
 * The point under the cursor is the one that must not move. Solved rather
 * than approximated: the scroll that holds it is exact at any zoom, and this
 * checks it by converting back.
 */
for (const zoom of [1.25, 2, 3, 4]) {
  const world = { x: 400, y: 300 };
  const screen = { x: 320, y: 180 };
  const scroll = scrollToHold(world, screen, zoom);
  const back = { x: scroll.x + screen.x / zoom, y: scroll.y + screen.y / zoom };
  check(
    `at ${zoom}x the cursor's point stays put`,
    Math.abs(back.x - world.x) < 1e-9 && Math.abs(back.y - world.y) < 1e-9,
    `${back.x.toFixed(2)}, ${back.y.toFixed(2)}`,
  );
}

console.log("\n-- what a browser remembered --");
check("a stored zoom comes back", parseStoredZoom("2.5") === 2.5);
check("an odd one is snapped", parseStoredZoom("2.61") === 2.5, String(parseStoredZoom("2.61")));
check("one out of range is pulled in", parseStoredZoom("9") === ZOOM_MAX);
for (const junk of [null, undefined, "", "banana", "NaN"]) {
  check(`${JSON.stringify(junk)} is no choice at all`, parseStoredZoom(junk) === null);
}

console.log("\n-- a chosen zoom overrides the viewport --");
for (const zoom of ZOOM_STEPS) {
  const plan = planCamera(1920, 1080, MAP_WORLD_BOUNDS, zoom);
  check(`${zoom}x is honoured on a desktop`, plan.zoom === zoom, `${plan.zoom}x`);
  const range = scrollRange(plan);
  check(
    `  and the camera still cannot scroll past the map at ${zoom}x`,
    range.minX >= MAP_WORLD_BOUNDS.x &&
      range.maxX <= MAP_WORLD_BOUNDS.x + MAP_WORLD_BOUNDS.width &&
      range.maxY <= MAP_WORLD_BOUNDS.y + MAP_WORLD_BOUNDS.height,
    `x ${range.minX}..${Math.round(range.maxX)}, y ${range.minY}..${Math.round(range.maxY)}`,
  );
}
check(
  "a phone that chose 4x gets 4x",
  planCamera(390, 844, MAP_WORLD_BOUNDS, 4).zoom === 4,
);
check(
  "and one that has chosen nothing still gets the phone default",
  planCamera(390, 844, MAP_WORLD_BOUNDS, null).zoom === 1.5,
);

// --- filling the window ----------------------------------------------------
console.log("\n-- full-width window (1920x1080) --");
const wide = planCamera(1920, 1080);
check("uses 2x", wide.zoom === 2);
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
check("steps down to 1.75x", narrow.zoom === 1.75);
check(
  "map still wider than the view",
  !narrow.fitsX,
  `map ${MAP_WORLD_BOUNDS.width} vs view ${narrow.view.width.toFixed(0)}`,
);
check(
  "and taller than it too, now the painting is 576 world px",
  !narrow.fitsY,
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
  "sees at least 8 cells across",
  phone.view.width / CELL >= 8,
  `${(phone.view.width / CELL).toFixed(1)} cells`,
);

// --- the biggest screen still does not see it all -------------------------
console.log("\n-- 1440p (2560x1440) --");

/*
 * The painted maps are 1008x576 world pixels. A 1440p monitor at the new 2x
 * default sees 1280x720, which is larger - so the whole hub fits and the
 * camera sits centred rather than following. That is a real consequence of
 * dropping the default from 3x and is asserted rather than discovered: at 2x
 * a big desktop sees the whole painting, and one click in it is back to
 * following and clamping.
 */
const big = planCamera(2560, 1440);
check(
  "1440p at the 2x default sees the whole map",
  big.fitsEntirely,
  `view ${big.view.width.toFixed(0)}x${big.view.height.toFixed(0)} vs map ${MAP_WORLD_BOUNDS.width}x${MAP_WORLD_BOUNDS.height}`,
);

const bigIn = planCamera(2560, 1440, MAP_WORLD_BOUNDS, 3);
check(
  "one step in and it does not",
  !bigIn.fitsEntirely,
  `view ${bigIn.view.width.toFixed(0)}x${bigIn.view.height.toFixed(0)}`,
);
const bigRange = scrollRange(bigIn);
check(
  "so there is room to scroll on both axes",
  bigRange.maxX > bigRange.minX && bigRange.maxY > bigRange.minY,
  `x ${bigRange.minX}-${bigRange.maxX.toFixed(0)}, y ${bigRange.minY}-${bigRange.maxY.toFixed(0)}`,
);
check(
  "and the clamp stops exactly at the painting's edge",
  bigRange.maxX + bigIn.view.width === MAP_WORLD_BOUNDS.width &&
    bigRange.maxY + bigIn.view.height === MAP_WORLD_BOUNDS.height,
  "no empty space past the edge",
);
check(
  "the centre is the middle of the painting",
  big.centre.x === MAP_WORLD_BOUNDS.width / 2 && big.centre.y === MAP_WORLD_BOUNDS.height / 2,
  `${big.centre.x},${big.centre.y}`,
);

console.log("\n-- a view larger than the map --");

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
