/**
 * The frame every page of the site sits in: the bar at the top, the ticker,
 * and the footer.
 *
 * The nav lists the sections of the single page rather than a set of separate
 * documents, because that is what the site is - one scroll, with /whitepaper
 * and /roadmap as the two things long enough to deserve their own URL.
 */

import { count, html, raw } from "./dom.js";
import type { SiteConfig, SiteStats } from "./data.js";
import { handle } from "./text.js";

/** The anchors in the order they appear. Also what the tests check for. */
export const SECTIONS = [
  { id: "how-it-works", label: "how it works" },
  { id: "the-world", label: "the world" },
  { id: "skills", label: "skills" },
  { id: "cooking", label: "cooking" },
  { id: "wardrobe", label: "wardrobe" },
  { id: "roadmap", label: "roadmap" },
  { id: "token", label: "$COOK" },
  { id: "proof", label: "proof" },
] as const;

/**
 * The bar. `home` decides whether the section links point at anchors on this
 * page or back at the front page's anchors, so /whitepaper's nav still works.
 */
export function topbar(home: boolean): ReturnType<typeof html> {
  const prefix = home ? "" : "/";
  return html`
    <header class="topbar">
      <div class="inner">
        <a class="brand" href="/">Crazy<b>Cauldron</b></a>
        <nav class="topnav">
          ${SECTIONS.map(
            (section) => html`<a href="${prefix}#${section.id}">${section.label}</a>`,
          )}
          <a href="/whitepaper">whitepaper</a>
        </nav>
        <a class="btn btn-primary" href="/play">Play</a>
      </div>
    </header>
  `;
}

/**
 * The bottom ticker.
 *
 * The track is written twice and slid by exactly half its width, which is what
 * makes the loop seamless without measuring anything: the second copy is
 * arriving exactly as the first leaves.
 */
export function ticker(stats: SiteStats | null): ReturnType<typeof html> {
  const items = [
    html`<span><b data-live="playersOnline">${count(stats?.playersOnline ?? null)}</b> players online</span>`,
    html`<span><b data-live="chefsRegistered">${count(stats?.chefsRegistered ?? null)}</b> chefs registered</span>`,
    html`<span><b data-live="dishesCooked">${count(stats?.dishesCooked ?? null)}</b> dishes cooked</span>`,
    html`<span><b data-live="superbsToday">${count(stats?.superbsToday ?? null)}</b> superbs today</span>`,
    html`<span>creator fees fund servers and development</span>`,
    html`<span>nothing is paid out to holders</span>`,
    html`<span>not financial advice</span>`,
  ];

  return html`
    <div class="ticker" aria-hidden="true">
      <div class="ticker-track" id="ticker-track">${items}${items}</div>
    </div>
  `;
}

export function footer(config: SiteConfig): ReturnType<typeof html> {
  const x = handle(config.social.x);
  const telegram = handle(config.social.telegram);

  return html`
    <footer class="foot band-plain">
      <div class="inner">
        <div class="foot-links">
          <a href="/play">Play</a>
          <a href="/whitepaper">Whitepaper</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/official">Official links</a>
          <a href="/rules">Rules</a>
          ${x ? html`<a href="https://x.com/${x}" rel="noopener">X</a>` : ""}
          ${telegram
            ? html`<a href="https://t.me/${telegram}" rel="noopener">Telegram</a>`
            : ""}
        </div>
        <p class="small">
          CrazyCauldron is a game. $COOK is a community token: not a share, not an
          investment, and not a claim on anything we own or earn. Trading it generates
          standard pump.fun creator fees, which the team receives at the project treasury
          wallet and uses to run the servers and build the game. Nothing is paid out to
          holders. We make no promise about its price, and no promise of rewards, income,
          airdrops or returns of any kind. Nothing here is financial advice.
        </p>
        <p class="small">
          The only official domain is <strong>${config.domain}</strong>. Anything else is
          not us.
        </p>
      </div>
    </footer>
  `;
}

/**
 * A full-bleed section over one of the paintings.
 *
 * `srcset` rather than one file: the phone copy is a fifth of the size of the
 * desktop one, and on the page that has four of these it is the difference
 * between a 1 MB visit and a 220 kB one. Everything below the fold is lazy,
 * so a reader who never scrolls never pays for the caves.
 */
export function band(options: {
  id: string;
  painting: string | null;
  label: string;
  eager?: boolean;
  body: ReturnType<typeof html>;
}): ReturnType<typeof html> {
  const art = options.painting
    ? html`<img
        class="band-art"
        src="/assets/site/${options.painting}-wide.jpg"
        srcset="/assets/site/${options.painting}-narrow.jpg 720w, /assets/site/${options.painting}-wide.jpg 1440w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        loading="${options.eager ? "eager" : "lazy"}"
        decoding="async"
      />`
    : "";

  return html`
    <section class="band ${options.painting ? "" : "band-plain"}" id="${options.id}">
      ${art}
      <div class="inner">
        <div class="label">${options.label}</div>
        ${options.body}
      </div>
    </section>
  `;
}

/**
 * Slow parallax on the painted bands.
 *
 * One listener, one rAF, and a transform - never a layout property, so the
 * browser can keep the whole thing on the compositor. The shift is capped at
 * the slack the CSS gives each image (it is 124% tall, inset 12% either side),
 * so a band can never show its own edge.
 */
export function startParallax(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const arts = Array.from(document.querySelectorAll<HTMLElement>(".band-art"));
  if (arts.length === 0) return;

  let queued = false;
  const apply = () => {
    queued = false;
    const middle = window.innerHeight / 2;
    for (const art of arts) {
      const band = art.parentElement;
      if (!band) continue;
      const box = band.getBoundingClientRect();
      if (box.bottom < -200 || box.top > window.innerHeight + 200) continue;
      const centre = box.top + box.height / 2;
      const shift = Math.max(-60, Math.min(60, ((centre - middle) / middle) * -48));
      art.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    }
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  apply();
}

/** Wires every copy button on the page. Used by the token and proof sections. */
export function wireCopyButtons(root: ParentNode): void {
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>("[data-copy]"))) {
    button.addEventListener("click", () => {
      const value = button.dataset.copy ?? "";
      const said = button.textContent ?? "Copy";
      void navigator.clipboard
        ?.writeText(value)
        .then(() => {
          button.textContent = "Copied";
          setTimeout(() => (button.textContent = said), 1600);
        })
        .catch(() => {
          button.textContent = "Press ⌘C";
          setTimeout(() => (button.textContent = said), 2200);
        });
    });
  }
}

/** Markup already built, for callers that need the raw string. */
export const markup = raw;
