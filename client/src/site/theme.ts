/**
 * The look of the marketing site.
 *
 * One stylesheet, shipped as a string rather than a .css file, because the
 * site shares a bundle with three legal pages that already worked this way and
 * a second mechanism would be a second place to look.
 *
 * The colours are the game's own, from shared/src/palette.ts. They are
 * repeated here as literals rather than imported, and that is deliberate: this
 * file is CSS, the palette is TypeScript, and generating a stylesheet at
 * runtime from an object costs a render pass on every page load to save a
 * duplication that a test can check instead.
 */

export const SITE_CSS = `
:root {
  --night: #14101a;
  --shadow: #0c0912;
  --panel: #1d1728;
  --border: #3a3050;
  --parchment: #e8d9b0;
  --ink: #f3e9d2;
  --dim: #9a8f7a;
  --faint: #6f6656;
  --accent: #7ce08a;
  --saffron: #f2b53b;
  --berry: #b5487e;
  --sky: #63c7e8;
  --gold: #f7d372;
  --silver: #c9d2dd;
  --bronze: #c98a4b;

  --serif: Fraunces, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --gutter: 1.15rem;
  --max: 68rem;
  color-scheme: dark;
}

/* The game shell pins the document so a drag cannot scroll the world. A site
   is a document and has to scroll, so it undoes all of that. */
html, body {
  height: auto;
  overflow: visible;
  overscroll-behavior: auto;
  margin: 0;
}
body {
  background: var(--night);
  color: var(--ink);
  font: 16px/1.65 var(--sans);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
img { max-width: 100%; }

.site-wrap { overflow-x: clip; }
.inner {
  width: 100%;
  max-width: var(--max);
  margin: 0 auto;
  padding-left: var(--gutter);
  padding-right: var(--gutter);
}
.narrow { max-width: 46rem; }

h1, h2, h3, h4 { font-family: var(--serif); font-weight: 600; line-height: 1.15; margin: 0; }
h1 { font-size: clamp(2.4rem, 9vw, 4.2rem); letter-spacing: -0.02em; }
h2 { font-size: clamp(1.6rem, 4.6vw, 2.3rem); margin-bottom: 0.5rem; }
h3 { font-size: 1.12rem; margin-bottom: 0.3rem; }
p { margin: 0 0 0.9rem; }
a { color: var(--saffron); }
ul, ol { margin: 0 0 0.9rem; padding-left: 1.2rem; }
li { margin-bottom: 0.3rem; }
strong { color: #fff; font-weight: 600; }
code, .mono { font-family: var(--mono); font-size: 0.86em; }

/* --- the file-name section labels ---------------------------------------- */
.label {
  font-family: var(--mono);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--saffron);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.7rem;
  text-transform: lowercase;
}
.label::before {
  content: "";
  width: 6px; height: 6px;
  background: var(--saffron);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--saffron);
}

/* --- top bar -------------------------------------------------------------- */
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(12, 9, 18, 0.82);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(58, 48, 80, 0.7);
}
.topbar .inner {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 3.4rem;
}
.brand {
  font-family: var(--serif);
  font-size: 1.05rem;
  letter-spacing: 0.01em;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}
.brand b { color: var(--saffron); font-weight: 600; }
.topnav { display: none; gap: 1.1rem; margin-left: auto; }
.topnav a {
  font-family: var(--mono);
  font-size: 0.78rem;
  color: var(--dim);
  text-decoration: none;
}
.topnav a:hover { color: var(--ink); }
.topbar .btn { margin-left: auto; }
.topnav + .btn { margin-left: 0.4rem; }
@media (min-width: 62rem) { .topnav { display: flex; } }

/* --- buttons -------------------------------------------------------------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  font: 600 0.9rem/1 var(--sans);
  padding: 0.72rem 1.15rem;
  border-radius: 7px;
  border: 1px solid var(--border);
  color: var(--ink);
  background: rgba(29, 23, 40, 0.75);
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.12s ease, background 0.12s ease;
}
.btn:hover { transform: translateY(-1px); background: rgba(45, 36, 62, 0.9); }
.btn-primary {
  background: var(--saffron);
  border-color: var(--saffron);
  color: #241a06;
}
.btn-primary:hover { background: var(--gold); }
.btn-row { display: flex; flex-wrap: wrap; gap: 0.6rem; }

/* --- full-bleed painted bands -------------------------------------------- */
.band {
  position: relative;
  isolation: isolate;
  padding: 4.5rem 0;
  overflow: hidden;
}
.band-art {
  position: absolute;
  inset: -12% 0 -12% 0;
  width: 100%;
  height: 124%;
  object-fit: cover;
  z-index: -2;
  /* Slight blur so copy sits on the painting rather than fighting it. */
  filter: blur(2px) saturate(0.92) brightness(0.62);
  will-change: transform;
}
.band::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(ellipse at 50% 45%, rgba(12, 9, 18, 0.18) 0%, rgba(12, 9, 18, 0.78) 72%, rgba(12, 9, 18, 0.95) 100%),
    linear-gradient(to bottom, rgba(12, 9, 18, 0.9), rgba(12, 9, 18, 0.25) 22%, rgba(12, 9, 18, 0.3) 78%, rgba(12, 9, 18, 0.9));
}
.band-plain { background: linear-gradient(to bottom, #100d16, #16111e); }

/* --- cards ---------------------------------------------------------------- */
.card {
  background: rgba(20, 15, 27, 0.72);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  border: 1px solid rgba(58, 48, 80, 0.85);
  border-radius: 10px;
  padding: 1.15rem 1.2rem;
}
.card-warm { border-color: rgba(242, 181, 59, 0.35); }
.card h3 { color: var(--parchment); }
.card p:last-child, .card ul:last-child, .card ol:last-child { margin-bottom: 0; }
.muted { color: var(--dim); }
.small { font-size: 0.88rem; }
.lead { font-size: 1.08rem; color: var(--parchment); }

.grid { display: grid; gap: 0.9rem; }
@media (min-width: 40rem) { .cols-2 { grid-template-columns: 1fr 1fr; } }
@media (min-width: 52rem) {
  .cols-3 { grid-template-columns: repeat(3, 1fr); }
  .cols-4 { grid-template-columns: repeat(4, 1fr); }
}

/* --- pixel art ------------------------------------------------------------ */
.sprite {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}
.sprite-tile {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 4.5rem;
}

/* --- hero ----------------------------------------------------------------- */
.hero {
  position: relative;
  isolation: isolate;
  min-height: 92vh;
  min-height: 92svh;
  display: flex;
  align-items: center;
  padding: 5rem 0 3rem;
  overflow: hidden;
}
#hero-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -2;
  image-rendering: pixelated;
}
.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(ellipse at 45% 40%, rgba(12, 9, 18, 0.05) 0%, rgba(12, 9, 18, 0.72) 68%, rgba(12, 9, 18, 0.97) 100%),
    linear-gradient(to bottom, rgba(12, 9, 18, 0.55), rgba(12, 9, 18, 0) 30%, rgba(12, 9, 18, 0.92));
}
.hero h1 { text-shadow: 0 2px 30px rgba(0, 0, 0, 0.7); }
.hero .tagline {
  font-family: var(--serif);
  font-size: clamp(1.1rem, 3.4vw, 1.5rem);
  color: var(--saffron);
  margin: 0.5rem 0 0.9rem;
}
.hero .pitch { max-width: 34rem; color: var(--parchment); }
.hero .btn-row { margin: 1.4rem 0 1.6rem; }

/* --- the live line and the ticker ---------------------------------------- */
.live {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.1rem;
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--dim);
  align-items: center;
}
.live b { color: var(--ink); font-weight: 600; }
.live .dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.ticker {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--shadow);
  overflow: hidden;
  padding: 0.55rem 0;
}
.ticker-track {
  display: inline-flex;
  gap: 2.4rem;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 0.76rem;
  color: var(--dim);
  animation: slide 46s linear infinite;
  will-change: transform;
}
.ticker-track b { color: var(--saffron); font-weight: 600; }
@keyframes slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* --- numbered steps ------------------------------------------------------- */
.steps { display: grid; gap: 0.9rem; counter-reset: step; list-style: none; padding: 0; }
.steps > li {
  counter-increment: step;
  position: relative;
  padding-left: 3.1rem;
  min-height: 2.2rem;
}
.steps > li::before {
  content: "0" counter(step);
  position: absolute;
  left: 0;
  top: -0.1rem;
  font-family: var(--mono);
  font-size: 1.15rem;
  color: var(--saffron);
}
@media (min-width: 52rem) { .steps { grid-template-columns: repeat(3, 1fr); } }

/* --- the loop diagram ----------------------------------------------------- */
.loop { display: grid; gap: 0.6rem; grid-template-columns: 1fr; }
.loop-step { text-align: center; padding: 0.9rem 0.6rem; }
.loop-step .sprite { margin: 0 auto 0.5rem; }
.loop-step h3 { font-size: 0.98rem; }
.loop-arrow { display: none; }
@media (min-width: 52rem) {
  .loop { grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; align-items: center; }
  .loop-arrow { display: block; color: var(--saffron); font-family: var(--mono); }
}

/* --- tables --------------------------------------------------------------- */
.table-scroll { overflow-x: auto; margin: 0.8rem 0; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td {
  border-bottom: 1px solid rgba(58, 48, 80, 0.7);
  padding: 0.45rem 0.6rem;
  text-align: left;
  vertical-align: top;
}
th { color: var(--dim); font-weight: 600; font-family: var(--mono); font-size: 0.76rem; letter-spacing: 0.05em; }
td.num, th.num { text-align: right; font-family: var(--mono); }

/* --- recipe browser ------------------------------------------------------- */
.filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.9rem; }
.chip {
  font: 600 0.78rem/1 var(--mono);
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(29, 23, 40, 0.7);
  color: var(--dim);
  cursor: pointer;
}
.chip[aria-pressed="true"] { background: var(--saffron); border-color: var(--saffron); color: #241a06; }
.recipe-list { display: grid; gap: 0.6rem; }
@media (min-width: 46rem) { .recipe-list { grid-template-columns: 1fr 1fr; } }
.recipe {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 0.75rem 0.85rem;
}
.recipe .sprite { flex: none; }
.recipe h3 { font-size: 1rem; margin-bottom: 0.15rem; }
.recipe .meta { font-family: var(--mono); font-size: 0.74rem; color: var(--dim); }

/* --- gallery -------------------------------------------------------------- */
.gallery { display: grid; gap: 0.6rem; grid-template-columns: repeat(2, 1fr); }
@media (min-width: 40rem) { .gallery { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 58rem) { .gallery { grid-template-columns: repeat(5, 1fr); } }
.gallery .card { text-align: center; padding: 0.8rem 0.5rem; }
.gallery h3 { font-size: 0.9rem; }
.gallery .meta { font-family: var(--mono); font-size: 0.7rem; color: var(--dim); }

.tier { display: inline-block; font-family: var(--mono); font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 3px; }
.tier-bronze { background: rgba(201, 138, 75, 0.2); color: var(--bronze); }
.tier-silver { background: rgba(201, 210, 221, 0.15); color: var(--silver); }
.tier-gold { background: rgba(247, 211, 114, 0.16); color: var(--gold); }

/* --- heat bar demo -------------------------------------------------------- */
.heat { margin: 0.8rem 0 0.4rem; }
.heat-track {
  position: relative;
  height: 2.1rem;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: rgba(12, 9, 18, 0.75);
  overflow: hidden;
}
.heat-fine { position: absolute; top: 0; bottom: 0; background: rgba(242, 181, 59, 0.22); }
.heat-superb { position: absolute; top: 0; bottom: 0; background: rgba(181, 72, 126, 0.45); }
.heat-marker { position: absolute; top: 0; bottom: 0; width: 3px; background: var(--ink); box-shadow: 0 0 9px var(--ink); }
.heat-legend { display: flex; gap: 1rem; font-family: var(--mono); font-size: 0.74rem; color: var(--dim); flex-wrap: wrap; }
.heat-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 0.3rem; }

/* --- the address block ---------------------------------------------------- */
.address {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  background: rgba(12, 9, 18, 0.8);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 0.75rem 0.85rem;
  margin: 0.7rem 0;
}
.address code { flex: 1 1 17rem; word-break: break-all; color: var(--parchment); }
.warn {
  border-left: 3px solid var(--saffron);
  background: rgba(36, 28, 24, 0.75);
  padding: 0.7rem 0.9rem;
  margin: 1rem 0;
}

/* --- roadmap timeline ----------------------------------------------------- */
.timeline { position: relative; display: grid; gap: 1rem; }
.floor { position: relative; overflow: hidden; }
.floor-art {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; opacity: 0.2; z-index: -1;
}
.floor-head { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; margin-bottom: 0.5rem; }
.floor-head h3 { font-size: 1.3rem; }
.badge {
  font: 600 0.68rem/1 var(--mono);
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.badge-live { background: rgba(124, 224, 138, 0.16); color: var(--accent); }
.badge-next { background: rgba(99, 199, 232, 0.14); color: var(--sky); }
.badge-later { background: rgba(154, 143, 122, 0.14); color: var(--dim); }

/* --- whitepaper ----------------------------------------------------------- */
.wp { display: block; padding: 2.5rem 0 4rem; }
.wp-toc { margin-bottom: 2rem; }
.wp-toc ol { font-family: var(--mono); font-size: 0.82rem; }
.wp-toc a { color: var(--dim); text-decoration: none; }
.wp-toc a:hover, .wp-toc a.here { color: var(--saffron); }
.wp-body h2 { margin-top: 2.6rem; color: var(--parchment); scroll-margin-top: 4.5rem; }
.wp-body h3 { margin-top: 1.5rem; color: var(--saffron); font-family: var(--sans); font-size: 1rem; }
.wp-body > section:first-child h2 { margin-top: 0.6rem; }
@media (min-width: 62rem) {
  .wp { display: grid; grid-template-columns: 15rem 1fr; gap: 2.5rem; }
  .wp-toc { position: sticky; top: 4.4rem; align-self: start; max-height: calc(100vh - 6rem); overflow-y: auto; margin: 0; }
}

/* --- footer --------------------------------------------------------------- */
.foot { padding: 2.5rem 0 3.5rem; color: var(--dim); font-size: 0.86rem; }
.foot a { color: var(--dim); }
.foot a:hover { color: var(--saffron); }
.foot-links { display: flex; flex-wrap: wrap; gap: 0.5rem 1.2rem; margin-bottom: 1rem; font-family: var(--mono); font-size: 0.8rem; }

.section-gap { padding: 3.5rem 0; }

/* Anchors land below the sticky bar rather than under it. */
[id] { scroll-margin-top: 4.2rem; }

@media (prefers-reduced-motion: reduce) {
  .ticker-track { animation: none; }
  .live .dot { animation: none; }
  .band-art { transform: none !important; }
}
`;
