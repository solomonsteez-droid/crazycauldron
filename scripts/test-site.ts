/**
 * The marketing site: what it says, and what it weighs.
 *
 *   npx tsx scripts/test-site.ts
 *
 * The page builders are pure - they take configuration and return a string of
 * markup - so this renders the whole site under Node and asserts on the result
 * rather than grepping a minified bundle and hoping. That is the reason
 * client/src/site/text.ts exists as its own file: nothing in the render path
 * touches `document`, `window` or `import.meta.env`, so it all imports here.
 *
 * Three things are checked. That every section and chapter is actually there
 * and lists what it claims to list, counted against the content files rather
 * than against a number typed into this file. That no phrasing implying a
 * payout to holders appears anywhere. And that the page fits its budget: 3 MB
 * for everything a visitor downloads, which is the constraint that decides
 * whether somebody on a phone ever sees it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INGREDIENTS, RECIPES, WARDROBE_ITEMS } from "@crazycauldron/shared";
import { homePage } from "../client/src/site/home.js";
import { whitepaperPage, } from "../client/src/site/whitepaper.js";
import { roadmapPage, FLOORS, MINIGAMES } from "../client/src/site/roadmap.js";
import { SECTIONS } from "../client/src/site/layout.js";
import type { SiteConfig } from "../client/src/site/data.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const DIST = path.join(ROOT, "client", "dist");

/** The whole page, as a visitor downloads it, must fit in this. */
const PAGE_BUDGET_BYTES = 3 * 1024 * 1024;

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Two configurations, because the address block has two states. */
const BEFORE_LAUNCH: SiteConfig = {
  domain: "crazycauldron.art",
  cookMint: "So11111111111111111111111111111111111111112",
  showMint: false,
  treasuryWallet: "",
  minHold: 2000,
  social: { x: "none", telegram: "none" },
  shopEnabled: false,
};

const AT_LAUNCH: SiteConfig = {
  ...BEFORE_LAUNCH,
  cookMint: "CookMintAddress1111111111111111111111111111",
  showMint: true,
  treasuryWallet: "CTjcrsrKUTbEbm91XbL1BToD3cUEJcjxNvyeuW2nd8LU",
  social: { x: "crazycauldron", telegram: "none" },
};

/** The builders return a marked-up string wrapped in a private class. */
const render = (built: unknown): string => (built as { markup: string }).markup;

const occurrences = (haystack: string, needle: RegExp): number =>
  (haystack.match(needle) ?? []).length;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * The page as a reader sees it: tags removed, entities put back, whitespace
 * collapsed.
 *
 * Both halves matter. "Dragon's breath chili" is written `Dragon&#39;s` in the
 * markup, because the template escapes every interpolation - so a check for
 * the recipe's own name would fail against a page that renders it perfectly.
 * And prose that a template literal broke across three indented lines is one
 * sentence to a reader, so a phrase spanning a line break has to match.
 */
function text(markup: string): string {
  let out = markup.replace(/<[^>]*>/g, " ");
  for (const [entity, character] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(character);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Whether the rendered page actually says this, as a reader would read it. */
const says = (markup: string, phrase: string): boolean => text(markup).includes(phrase);

/**
 * Wording that would turn "a token that opens a door" into "a token that
 * pays".
 *
 * Each needs an affirmative subject, so the approved sentence - "Nothing is
 * paid out to holders" - cannot trip the check that exists to enforce it. The
 * lookbehind is doing exactly that job and is not decoration: these run
 * against the page's readable text, where the ticker's "creator fees fund
 * servers and development" and its "nothing is paid out to holders" sit side
 * by side with no punctuation between them, and without it the second is read
 * as a claim about the first.
 */
const FORBIDDEN = [
  /holder rewards/i,
  /fees?\b[^.]{0,60}(?<!nothing )(?:are|is) (?:paid|distributed|shared|split)(?: out)? to holders/i,
  /distribut\w*[^.]{0,60}to holders/i,
  /(?:pays|paid|distributed) to holders in SOL/i,
  /holders (?:receive|earn|get) (?:a )?(?:share|cut|part)/i,
  /guaranteed (?:rewards?|income|returns?|payouts?)/i,
  /passive income/i,
  /you will (?:earn|receive|be paid)/i,
  /earn(?:ing)?s? (?:just )?(?:by|from) holding/i,
];

// --- what the pages say ----------------------------------------------------

function checkHome(): string {
  console.log("-- the front page --");
  const markup = render(homePage(BEFORE_LAUNCH, null));

  for (const section of SECTIONS) {
    check(`${section.id} renders`, markup.includes(`id="${section.id}"`));
  }

  check(
    "the hero offers Play and Buy",
    markup.includes('href="/play"') && markup.includes('href="#token"'),
  );
  check(
    "the live line has all three counters",
    ["playersOnline", "chefsRegistered", "dishesCooked"].every((key) =>
      markup.includes(`data-live="${key}"`),
    ),
  );
  check(
    "the ticker carries the fourth",
    occurrences(markup, /data-live="superbsToday"/g) >= 1,
  );

  check(
    `the recipe browser lists all ${RECIPES.length} recipes from the content file`,
    occurrences(markup, /class="card recipe"/g) === RECIPES.length,
    `${occurrences(markup, /class="card recipe"/g)} found`,
  );
  check(
    "and names each of them",
    RECIPES.every((recipe) => says(markup, recipe.name)),
  );
  check(
    "the world section shows every ingredient",
    INGREDIENTS.every((item) => markup.includes(`/ingredients/${item.id}.png`)),
  );

  const hats = WARDROBE_ITEMS.filter((item) => item.kind === "hat");
  const companions = WARDROBE_ITEMS.filter((item) => item.kind === "companion");
  check(
    `the wardrobe lists ${hats.length} hats`,
    occurrences(markup, /\/assets\/generated\/hats\//g) === hats.length,
    `${occurrences(markup, /\/assets\/generated\/hats\//g)} found`,
  );
  check(
    `and ${companions.length} companions`,
    occurrences(markup, /\/assets\/generated\/companions\//g) === companions.length,
  );
  check(
    "with an unlock condition on each",
    WARDROBE_ITEMS.every((item) => says(markup, item.name)),
  );
  check(
    "and the three holder tiers, marked cosmetic",
    ["bronze", "silver", "gold"].every((tier) => markup.includes(`tier-${tier}`)) &&
      /[Cc]osmetic only/.test(markup),
  );

  check(
    `the roadmap shows ${FLOORS.length} floors`,
    FLOORS.every((floor) => markup.includes(`id="${floor.id}"`)),
  );
  check(
    `and ${MINIGAMES.length} minigames`,
    MINIGAMES.every((game) => says(markup, game.name)),
  );
  check("labelled a plan, not a promise", says(markup, "A plan, not a promise"));

  return markup;
}

function checkWhitepaper(): string {
  console.log("\n-- the whitepaper --");
  const markup = render(whitepaperPage(BEFORE_LAUNCH));

  const chapters = [
    "what-it-is",
    "getting-in",
    "the-world",
    "skills",
    "chef-level",
    "cooking",
    "economy",
    "cosmetics",
    "token",
    "fair-play",
    "roadmap",
    "risks",
  ];
  for (const id of chapters) check(`chapter ${id}`, markup.includes(`id="${id}"`));
  check("the contents list every one", occurrences(markup, /class="wp-toc"/g) === 1);

  check(
    `it lists all ${INGREDIENTS.length} ingredients and all ${RECIPES.length} recipes`,
    INGREDIENTS.every((item) => says(markup, item.name)) &&
      RECIPES.every((recipe) => says(markup, recipe.name)),
  );
  check(
    "it says what the game is not",
    ["No wagering", "No cash prizes", "No pay-to-win"].every((claim) => says(markup, claim)),
  );
  check(
    "and keeps the disclaimer",
    says(markup, "no promise of rewards, income, airdrops or returns of any kind") &&
      says(markup, "Nothing on this site is financial advice"),
  );
  return markup;
}

function checkRoadmapPage(): string {
  console.log("\n-- the roadmap page --");
  const markup = render(roadmapPage(BEFORE_LAUNCH));
  check(
    `${FLOORS.length} floors and ${MINIGAMES.length} minigames`,
    FLOORS.every((floor) => says(markup, floor.name)) &&
      MINIGAMES.every((game) => says(markup, game.name)),
  );
  check("it is the same body the front page renders", says(markup, "A plan, not a promise"));
  return markup;
}

function checkAddressStates(): void {
  console.log("\n-- the contract address --");
  const before = render(homePage(BEFORE_LAUNCH, null));
  check(
    "before launch the page says so rather than showing a stand-in",
    before.includes("Revealed at launch") && !before.includes(BEFORE_LAUNCH.cookMint),
  );

  const after = render(homePage(AT_LAUNCH, null));
  check(
    "with SHOW_MINT on it publishes the address",
    after.includes(AT_LAUNCH.cookMint) && after.includes(`data-copy="${AT_LAUNCH.cookMint}"`),
  );
  check(
    "and the treasury wallet beside it",
    after.includes(AT_LAUNCH.treasuryWallet),
  );
  check(
    'a social handle that is "none" is spelled out, not linked',
    says(after, "We have no Telegram") && after.includes("https://x.com/crazycauldron"),
  );
}

// --- the page weight -------------------------------------------------------

/**
 * Every file a visitor downloads, at a given viewport.
 *
 * The markup names them: `src` for a fixed image, `srcset` for one that comes
 * in two sizes. A phone takes the narrow entry and a laptop the wide one, so
 * the two totals are genuinely different pages and both are measured.
 */
function assetsOf(markup: string, want: "narrow" | "wide"): Set<string> {
  const files = new Set<string>();

  for (const match of markup.matchAll(/srcset="([^"]+)"/g)) {
    const candidates = match[1]!.split(",").map((entry) => entry.trim().split(/\s+/)[0]!);
    const picked = candidates.find((url) => url.includes(want)) ?? candidates[0];
    if (picked) files.add(picked);
  }

  for (const match of markup.matchAll(/src="(\/assets\/[^"]+)"/g)) {
    const url = match[1]!;
    // An image that also has a srcset is already accounted for above.
    if (url.includes("-wide.jpg") || url.includes("-narrow.jpg")) {
      if (url.includes(want)) files.add(url);
      continue;
    }
    files.add(url);
  }

  return files;
}

function bytesOf(url: string): number {
  const file = path.join(DIST, url.replace(/^\//, ""));
  return fs.existsSync(file) ? fs.statSync(file).size : -1;
}

function checkWeight(markup: string): void {
  console.log("\n-- the page budget --");

  const indexHtml = path.join(DIST, "index.html");
  if (!fs.existsSync(indexHtml)) {
    check("there is a built site", false, "run npm run build:client");
    return;
  }

  const html = fs.readFileSync(indexHtml, "utf8");
  const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
  const modules = [...html.matchAll(/href="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]!);

  /*
   * Every chunk in dist/assets that is not the game. The site loads its entry
   * plus whatever that entry imports, and rollup decides how many files that
   * is - so the honest measure is "everything but play", not "the two files
   * the HTML happens to name".
   */
  const chunks = fs
    .readdirSync(path.join(DIST, "assets"))
    .filter((name) => name.endsWith(".js") && !name.startsWith("play-"))
    .map((name) => `/assets/${name}`);

  const code = new Set([...scripts, ...modules, ...chunks]);
  const codeBytes = [...code].reduce((total, url) => total + Math.max(0, bytesOf(url)), 0);
  const htmlBytes = fs.statSync(indexHtml).size;

  for (const want of ["narrow", "wide"] as const) {
    const assets = assetsOf(markup, want);
    const missing = [...assets].filter((url) => bytesOf(url) < 0);
    const assetBytes = [...assets].reduce((total, url) => total + Math.max(0, bytesOf(url)), 0);
    const total = htmlBytes + codeBytes + assetBytes;

    check(
      `every ${want} asset the page names exists in dist`,
      missing.length === 0,
      missing.slice(0, 3).join(", "),
    );
    check(
      `the ${want === "narrow" ? "phone" : "desktop"} page is under 3 MB`,
      total <= PAGE_BUDGET_BYTES,
      `${(total / 1024 / 1024).toFixed(2)} MB across ${assets.size + code.size + 1} files`,
    );
  }

  const playBundle = fs
    .readdirSync(path.join(DIST, "assets"))
    .find((name) => name.startsWith("play-") && name.endsWith(".js"));
  check(
    "and the game's bundle is not among them",
    playBundle !== undefined && !html.includes(playBundle),
    playBundle ? `${Math.round(bytesOf(`/assets/${playBundle}`) / 1024)} kB, not loaded by the site` : "no play bundle",
  );
}

// --- nothing anywhere promises a payout ------------------------------------

function checkPhrasing(pages: Record<string, string>): void {
  console.log("\n-- nothing promises a payout --");

  for (const [name, markup] of Object.entries(pages)) {
    const readable = text(markup);
    for (const forbidden of FORBIDDEN) {
      check(`${name}: ${forbidden.source}`, !forbidden.test(readable));
    }
  }

  const everything = Object.values(pages).map(text).join(" . ");
  check(
    "and it is said outright, more than once",
    occurrences(everything, /[Nn]othing is paid out to holders/g) >= Object.keys(pages).length,
    `${occurrences(everything, /[Nn]othing is paid out to holders/g)} times`,
  );
  check(
    "the fees are described as pump.fun creator fees",
    /creator fees/i.test(everything) && /treasury wallet/i.test(everything),
  );
}

function main(): void {
  console.log("test-site\n");

  const home = checkHome();
  const whitepaper = checkWhitepaper();
  const roadmap = checkRoadmapPage();
  checkAddressStates();
  checkPhrasing({ home, whitepaper, roadmap });
  checkWeight(home);

  console.log(`\ntest-site: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
