/**
 * The mobile audit, as rules rather than as a memory of looking at it once.
 *
 *   npx tsx scripts/test-mobile.ts
 *
 * There is no browser here, so this checks the things that are decidable
 * without one: that the page is set up for touch at all, that every tap target
 * is finger-sized on a coarse pointer, that nothing is wider than a 390px
 * screen, that the bottom-pinned elements do not stack on top of each other,
 * and that the timing input answers a press rather than a release.
 *
 * What it cannot check is at the bottom of the output, named, so "audited on
 * mobile" does not quietly come to mean "a script passed".
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

/** iPhone 12/13/14, which is the narrow case worth designing to. */
const SCREEN_WIDTH = 390;
/** The smallest comfortable tap target, from both platform guidelines. */
const TAP_TARGET_PX = 44;
/** Bag, Skills, Codex, Top chefs, Settings. */
const DOCK_BUTTONS = 5;

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const html = read("client/index.html");
const overlay = read("client/src/ui/overlay.ts");
const cooking = read("client/src/ui/cooking.ts");
const panels = read("client/src/ui/panels.ts");
const scene = read("client/src/scenes/HubScene.ts");
const camera = read("client/src/map/camera.ts");

/** The stylesheet the overlay injects, between its backticks. */
const css = overlay.slice(overlay.indexOf("const CSS = `") + 13, overlay.lastIndexOf("`;"));

/**
 * The declarations of one CSS rule, or "" when there is no such selector.
 *
 * Comments are stripped first. They explain the declarations and sometimes
 * name the property they are explaining the absence of, which is enough to
 * make a naive search find the very thing it is checking is gone.
 */
function rule(selector: string, within = css): string {
  const at = within.indexOf(`${selector} {`);
  if (at < 0) return "";
  const open = within.indexOf("{", at);
  const close = within.indexOf("}", open);
  return within.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Everything inside one @media block. */
function media(query: string): string {
  const at = css.indexOf(`@media ${query}`);
  if (at < 0) return "";
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

console.log("test-mobile\n");
console.log(`  auditing against a ${SCREEN_WIDTH}px screen and a ${TAP_TARGET_PX}px tap target\n`);

// --- the page itself --------------------------------------------------------
console.log("-- the page --");
{
  check("the viewport scales to the device", html.includes("width=device-width"));
  check(
    "and covers the notch rather than letterboxing",
    html.includes("viewport-fit=cover"),
  );
  check(
    "the canvas claims every touch gesture",
    rule("#game canvas", html).includes("touch-action: none"),
    "without it a drag scrolls the page instead of reaching the game",
  );
  check(
    "a drag cannot select text instead of moving",
    rule("#game canvas", html).includes("user-select: none"),
  );
  check(
    "a rubber-band scroll cannot pull the world away",
    rule("html, body", html).includes("overscroll-behavior: none"),
  );
  check("the page itself never scrolls", rule("html, body", html).includes("overflow: hidden"));
}

// --- tap targets ------------------------------------------------------------
console.log("\n-- tap targets --");
{
  const coarse = media("(pointer: coarse)");
  check("there is a coarse-pointer layout at all", coarse.length > 0);

  for (const selector of [".cc-btn", ".cc-close", ".cc-slot", ".cc-heat"]) {
    const sizes = [...coarse.matchAll(/min-height:\s*(\d+)px|height:\s*(\d+)px/g)].map((m) =>
      Number(m[1] ?? m[2]),
    );
    const mentioned = coarse.includes(selector);
    check(
      `${selector} is sized for a finger`,
      mentioned && sizes.some((px) => px >= TAP_TARGET_PX),
      mentioned ? "" : "not mentioned in the coarse-pointer block",
    );
  }

  check(
    "the dock's buttons reach 44px too",
    /\.cc-dock button[\s\S]{0,400}?min-height:\s*(4[4-9]|[5-9]\d)px/.test(coarse),
  );
  check(
    "the heat bar is a wide target, not a hairline",
    /\.cc-heat\s*\{[^}]*height:\s*(4[4-9]|[5-9]\d)px/.test(coarse),
    "it is the one control where a miss costs the player something",
  );
}

// --- nothing wider than the screen -----------------------------------------
console.log("\n-- widths --");
{
  const phone = media("(max-width: 480px)");

  check(
    "the modal is sized from the viewport, not fixed",
    rule(".cc-modal").includes("width: min(") && phone.includes("width: calc(100vw"),
  );
  check(
    "no panel carries a min-width that can overflow",
    !rule(".cc-panel").includes("min-width"),
    "320px plus padding does not fit a 320px phone",
  );
  check(
    "the reveal card stops insisting on its width",
    phone.includes("min-width: 0"),
  );

  // Any fixed pixel width in the sheet has to fit, with room for padding.
  const wide = [...css.matchAll(/(?:^|[^-])width:\s*(\d{3,})px/g)]
    .map((m) => Number(m[1]))
    .filter((px) => px > SCREEN_WIDTH - 32);
  check(
    "no fixed width exceeds the screen",
    wide.length === 0,
    wide.length > 0 ? `${wide.join(", ")}px` : "",
  );

  const grid = /minmax\((\d+)px/.exec(phone) ?? /minmax\((\d+)px/.exec(css);
  const column = Number(grid?.[1] ?? 0);
  check(
    "the wardrobe grid fits at least three columns",
    column > 0 && column * 3 <= SCREEN_WIDTH - 40,
    `${column}px columns in ${SCREEN_WIDTH - 40}px`,
  );
}

// --- the bottom of the screen ----------------------------------------------
console.log("\n-- the bottom edge --");
{
  const coarse = media("(pointer: coarse)");

  const bottomOf = (selector: string, within: string): number => {
    const body = rule(selector, within);
    const match = /bottom:\s*calc\((\d+)px/.exec(body) ?? /bottom:\s*(\d+)px/.exec(body);
    return Number(match?.[1] ?? -1);
  };

  const dock = bottomOf(".cc-dock", css);
  const toast = bottomOf(".cc-toast", coarse);
  const progress = bottomOf(".cc-progress", coarse);

  /*
   * Ordering is not enough: each of these has height, and a toast whose
   * bottom edge is above the dock's bottom edge can still be drawn straight
   * across it. So the check is that each one starts above where the one below
   * it ends.
   */
  const phone = media("(max-width: 480px)");
  const singleRow = phone.includes("flex-wrap: nowrap");
  const dockRows = singleRow ? 1 : Math.ceil(DOCK_BUTTONS / 2);
  const dockHeight = dockRows * TAP_TARGET_PX + (dockRows - 1) * 8;
  const toastHeight = TAP_TARGET_PX;

  check(
    "the dock is one row on a phone",
    singleRow,
    `${DOCK_BUTTONS} buttons in ${dockRows} row(s), ${dockHeight}px tall`,
  );
  check("the dock sits above the home indicator", rule(".cc-dock").includes("safe-area-inset-bottom"));
  check(
    "the toast clears the dock rather than landing on it",
    toast >= dock + dockHeight,
    `toast at ${toast}px, dock occupies ${dock}-${dock + dockHeight}px`,
  );
  check(
    "and the progress bar clears the toast",
    progress >= toast + toastHeight,
    `progress at ${progress}px, toast occupies ${toast}-${toast + toastHeight}px`,
  );
  check(
    "the status strip clears the notch",
    rule(".cc-hud").includes("safe-area-inset-top"),
  );
  check(
    "and wraps rather than colliding with itself",
    rule(".cc-hud").includes("flex-wrap: wrap"),
  );
}

// --- input ------------------------------------------------------------------
console.log("\n-- input --");
{
  check(
    "the heat bar stops on the press, not the release",
    cooking.includes('track.addEventListener("pointerdown"'),
    "a click fires on lift, which is a different moment on a phone",
  );
  check(
    "and the press does not also scroll or select",
    /pointerdown[\s\S]{0,200}preventDefault/.test(cooking),
  );
  check(
    "prep is a hold, which works the same under a finger",
    cooking.includes('hold.addEventListener("pointerdown"') &&
      cooking.includes('hold.addEventListener("pointerup"'),
  );
  check(
    "tapping the map moves and tapping a thing uses it",
    scene.includes("Phaser.Input.Events.POINTER_DOWN") && scene.includes("pickFeature"),
  );
  check(
    "picking has a radius rather than needing the exact tile",
    scene.includes("pickFeature") && read("client/src/map/gameMap.ts").includes("PICK_TILES"),
  );
  check(
    "the dock drops its keyboard hints where there is no keyboard",
    panels.includes('matchMedia?.("(pointer: coarse)")'),
  );
}

// --- the world itself -------------------------------------------------------
console.log("\n-- the map at 390px --");
{
  check(
    "a phone-width viewport gets its own zoom",
    /390|PHONE|phone/.test(camera),
    "so a 32px tile is not rendered at desktop scale on a small screen",
  );
  check(
    "the canvas resizes with the window",
    read("client/src/main.ts").includes("RESIZE") ||
      read("client/src/scenes/HubScene.ts").includes("Scale.Events.RESIZE"),
  );
}

// --- what this cannot tell you ----------------------------------------------
console.log("\n-- still needs a real device --");
for (const item of [
  "whether 44px is actually comfortable one-handed on a 6.1in screen",
  "how the iOS URL bar collapsing mid-cook affects the heat bar's geometry",
  "whether a wallet app returning to the browser keeps the session",
  "Android back-gesture edges swallowing a drag near the screen edge",
  "real frame rate with 200 particles on a mid-range phone",
]) {
  console.log(`    - ${item}`);
}

console.log(`\n${failures === 0 ? "test-mobile: OK" : `test-mobile: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
