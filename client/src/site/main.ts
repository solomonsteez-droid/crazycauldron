/**
 * The marketing site, and the routes that are not the game.
 *
 * A separate entry point from the game on purpose. The game's bundle is 1.8 MB
 * because Phaser is 1.2 MB of it, and somebody deciding in four seconds whether
 * to try this should not download a renderer to read a paragraph. Two Vite
 * inputs, two bundles, one server: `/` and the documents come from here, and
 * `/play` boots the game.
 *
 * Everything renders from data that is already on the page or already in the
 * bundle - recipes, the wardrobe, the skill tree - and only the handful of
 * facts a launch changes are fetched. The page is therefore readable before
 * either request answers, and stays readable if neither ever does.
 */

import { mount, style } from "./dom.js";
import { SITE_CSS } from "./theme.js";
import { siteConfig, siteStats, type SiteConfig, type SiteStats } from "./data.js";
import { fillLiveNumbers, homePage } from "./home.js";
import { startParallax, wireCopyButtons } from "./layout.js";
import { startHero } from "./hero.js";
import { startHeatDemo, startRecipeBrowser } from "./sections/craft.js";
import { startTocHighlight, whitepaperPage } from "./whitepaper.js";
import { pageFor, renderPage } from "../ui/pages.js";

/** The routes this bundle draws. Anything else is the game's index.html. */
type Route = "home" | "whitepaper" | "roadmap" | "legal";

function routeFor(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/whitepaper" || path === "/docs") return "whitepaper";
  if (path === "/roadmap") return "roadmap";
  if (pageFor(path)) return "legal";
  return "home";
}

const root = document.getElementById("site");

async function main(): Promise<void> {
  if (!root) return;
  const route = routeFor(window.location.pathname);

  /*
   * /official and /rules keep their own renderer.
   *
   * They are the two pages whose job is to be plain and checkable, and the one
   * that publishes the contract address. Wrapping them in the marketing site's
   * furniture would make them look like advertising, which is the opposite of
   * what they are for.
   */
  if (route === "legal") {
    root.remove();
    const page = pageFor(window.location.pathname.replace(/\/+$/, "") || "/");
    if (page) void renderPage(page);
    return;
  }

  style("site-css", SITE_CSS);

  const config = await siteConfig();
  let stats: SiteStats | null = null;

  render(route, config, stats);

  // The counters arrive late and fill themselves in; the page never waits.
  stats = await siteStats();
  if (stats) {
    fillLiveNumbers(stats);
    refreshTicker(stats);
  }
}

function render(route: Route, config: SiteConfig, stats: SiteStats | null): void {
  if (!root) return;

  if (route === "home") {
    mount(root, homePage(config, stats));
    const canvas = document.getElementById("hero-canvas");
    if (canvas instanceof HTMLCanvasElement) startHero(canvas);
    startHeatDemo();
    startRecipeBrowser();
  } else if (route === "whitepaper") {
    mount(root, whitepaperPage(config));
    document.title = "CrazyCauldron — whitepaper";
    startTocHighlight();
  }

  startParallax();
  wireCopyButtons(root);
  focusAnchor();
}

/** Redraws the ticker's two copies once the numbers exist. */
function refreshTicker(stats: SiteStats): void {
  const track = document.getElementById("ticker-track");
  if (!track) return;
  for (const element of Array.from(track.querySelectorAll<HTMLElement>("[data-live]"))) {
    const key = element.dataset.live as keyof SiteStats | undefined;
    if (key && typeof stats[key] === "number") {
      element.textContent = stats[key].toLocaleString("en-US");
    }
  }
}

/**
 * A URL that arrived with a hash has to be scrolled to by hand.
 *
 * The browser does it for a document it parsed; it cannot do it for a section
 * that did not exist until the bundle ran.
 */
function focusAnchor(): void {
  const id = window.location.hash.slice(1);
  if (!id) return;
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
}

void main();
