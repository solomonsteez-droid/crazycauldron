/**
 * The front page.
 *
 * One scroll, in the order somebody decides in: what this is, how to start,
 * what the world holds, what you get good at, the thing you actually do, what
 * you can wear, where it is going, the token, and the addresses.
 */

import { count, html } from "./dom.js";
import { footer, ticker, topbar } from "./layout.js";
import type { SiteConfig, SiteStats } from "./data.js";
import { howItWorksSection, worldSection } from "./sections/start.js";
import { cookingSection, skillsSection } from "./sections/craft.js";
import { proofSection, tokenSection, wardrobeSection } from "./sections/meta.js";
import { roadmapSection } from "./roadmap.js";

/**
 * The hero.
 *
 * The live line is three numbers and a pulsing dot. They come from /stats and
 * they are dashes until it answers, which is the honest rendering of a number
 * nobody has yet - a zero would be a claim.
 */
export function hero(config: SiteConfig, stats: SiteStats | null): ReturnType<typeof html> {
  return html`
    <section class="hero">
      <canvas id="hero-canvas" aria-hidden="true"></canvas>
      <div class="inner">
        <h1>CrazyCauldron</h1>
        <p class="tagline">Hold $COOK. Cook your way up.</p>
        <p class="pitch lead">
          A cozy fantasy cooking MMO you play in a browser tab: forage three biomes,
          time the heat bar, sell what you cook, and work your way from apprentice to
          Chef Level 30 alongside everyone else in the village.
        </p>
        <div class="btn-row">
          <a class="btn btn-primary" href="/play">Play now</a>
          <a class="btn" href="#token">Buy $COOK</a>
          <a class="btn" href="/whitepaper">Read the whitepaper</a>
        </div>
        <p class="live" id="live-line">
          <span class="dot" aria-hidden="true"></span>
          <span><b data-live="playersOnline">${count(stats?.playersOnline ?? null)}</b> playing now</span>
          <span><b data-live="chefsRegistered">${count(stats?.chefsRegistered ?? null)}</b> chefs registered</span>
          <span><b data-live="dishesCooked">${count(stats?.dishesCooked ?? null)}</b> dishes cooked</span>
        </p>
        <p class="small muted" style="margin-top: 0.7rem">
          Holding ${config.minHold.toLocaleString()} $COOK opens the door. Signing in is
          free and never asks your wallet for a transaction.
        </p>
      </div>
    </section>
  `;
}

/**
 * The sections, in the order somebody decides in.
 *
 * Two of the four paintings carry two bands each. That is a weight decision
 * rather than an aesthetic one: eight distinct backgrounds would be most of
 * the page budget, and reusing one costs nothing because the browser already
 * has it.
 */
function sections(config: SiteConfig): ReturnType<typeof html> {
  return html`
    ${howItWorksSection(config)} ${worldSection()} ${skillsSection()} ${cookingSection()}
    ${wardrobeSection()} ${roadmapSection()} ${tokenSection(config)} ${proofSection(config)}
  `;
}

/** The whole front page. */
export function homePage(
  config: SiteConfig,
  stats: SiteStats | null,
): ReturnType<typeof html> {
  return html`
    ${topbar(true)}
    <main class="site-wrap">${hero(config, stats)} ${sections(config)}</main>
    ${ticker(stats)} ${footer(config)}
  `;
}

/**
 * Updates the counters in place when /stats arrives after the first paint.
 *
 * Re-rendering the page for three numbers would throw away the hero canvas and
 * every image the browser had started fetching, so the numbers are swapped
 * where they stand.
 */
export function fillLiveNumbers(stats: SiteStats): void {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-live]"))) {
    const key = element.dataset.live as keyof SiteStats | undefined;
    if (key && typeof stats[key] === "number") element.textContent = count(stats[key]);
  }
}
