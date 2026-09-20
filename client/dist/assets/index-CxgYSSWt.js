import{e as oe,C as y,R as G,I as re,S as U,a as ue,i as fe,w as Z,t as ge}from"./motionMath-Quf2KCgE.js";class ie{constructor(t){this.markup=t}}const be={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function ye(e){return String(e).replace(/[&<>"']/g,t=>be[t]??t)}function se(e){return e instanceof ie?e.markup:Array.isArray(e)?e.map(se).join(""):e==null||e===!1?"":ye(e)}function i(e,...t){let a=e[0]??"";for(let n=0;n<t.length;n+=1)a+=se(t[n])+(e[n+1]??"");return new ie(a)}function we(e,t){e.innerHTML=t.markup}function ve(e,t){if(document.getElementById(e))return;const a=document.createElement("style");a.id=e,a.textContent=t,document.head.append(a)}function O(e){return e===null?"—":e.toLocaleString("en-US")}const ke=`
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
`,B={domain:"crazycauldron.art",cookMint:"",showMint:!1,treasuryWallet:"",minHold:2e3,social:{x:"none",telegram:"none"},shopEnabled:!1};async function le(e,t=6e3){const a=new AbortController,n=setTimeout(()=>a.abort(),t);try{const o=await fetch(`${oe.httpUrl}${e}`,{signal:a.signal});return o.ok?await o.json():null}catch{return null}finally{clearTimeout(n)}}async function $e(){const e=await le("/public/config");return e?{...B,...e,social:{...B.social,...e.social??{}}}:B}async function xe(){return le("/stats",4e3)}function W(e){const t=e.trim();return t===""||t.toLowerCase()==="none"?null:t}function Ce(e,t=6){return e.length<=t*2+3?e:`${e.slice(0,t)}…${e.slice(-t)}`}const Se=[{id:"how-it-works",label:"how it works"},{id:"the-world",label:"the world"},{id:"skills",label:"skills"},{id:"cooking",label:"cooking"},{id:"wardrobe",label:"wardrobe"},{id:"roadmap",label:"roadmap"},{id:"token",label:"$COOK"},{id:"proof",label:"proof"}];function Te(e){const t="";return i`
    <header class="topbar">
      <div class="inner">
        <a class="brand" href="/">Crazy<b>Cauldron</b></a>
        <nav class="topnav">
          ${Se.map(a=>i`<a href="${t}#${a.id}">${a.label}</a>`)}
          <a href="/whitepaper">whitepaper</a>
        </nav>
        <a class="btn btn-primary" href="/play">Play</a>
      </div>
    </header>
  `}function Ee(e){const t=[i`<span><b data-live="playersOnline">${O((e==null?void 0:e.playersOnline)??null)}</b> players online</span>`,i`<span><b data-live="chefsRegistered">${O((e==null?void 0:e.chefsRegistered)??null)}</b> chefs registered</span>`,i`<span><b data-live="dishesCooked">${O((e==null?void 0:e.dishesCooked)??null)}</b> dishes cooked</span>`,i`<span><b data-live="superbsToday">${O((e==null?void 0:e.superbsToday)??null)}</b> superbs today</span>`,i`<span>creator fees fund servers and development</span>`,i`<span>nothing is paid out to holders</span>`,i`<span>not financial advice</span>`];return i`
    <div class="ticker" aria-hidden="true">
      <div class="ticker-track" id="ticker-track">${t}${t}</div>
    </div>
  `}function Oe(e){const t=W(e.social.x),a=W(e.social.telegram);return i`
    <footer class="foot band-plain">
      <div class="inner">
        <div class="foot-links">
          <a href="/play">Play</a>
          <a href="/whitepaper">Whitepaper</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/official">Official links</a>
          <a href="/rules">Rules</a>
          ${t?i`<a href="https://x.com/${t}" rel="noopener">X</a>`:""}
          ${a?i`<a href="https://t.me/${a}" rel="noopener">Telegram</a>`:""}
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
          The only official domain is <strong>${e.domain}</strong>. Anything else is
          not us.
        </p>
      </div>
    </footer>
  `}function _(e){const t=e.painting?i`<img
        class="band-art"
        src="/assets/site/${e.painting}-wide.jpg"
        srcset="/assets/site/${e.painting}-narrow.jpg 720w, /assets/site/${e.painting}-wide.jpg 1440w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        loading="${e.eager?"eager":"lazy"}"
        decoding="async"
      />`:"";return i`
    <section class="band ${e.painting?"":"band-plain"}" id="${e.id}">
      ${t}
      <div class="inner">
        <div class="label">${e.label}</div>
        ${e.body}
      </div>
    </section>
  `}function _e(){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const e=Array.from(document.querySelectorAll(".band-art"));if(e.length===0)return;let t=!1;const a=()=>{t=!1;const o=window.innerHeight/2;for(const l of e){const d=l.parentElement;if(!d)continue;const s=d.getBoundingClientRect();if(s.bottom<-200||s.top>window.innerHeight+200)continue;const c=s.top+s.height/2,b=Math.max(-60,Math.min(60,(c-o)/o*-48));l.style.transform=`translate3d(0, ${b.toFixed(1)}px, 0)`}},n=()=>{t||(t=!0,requestAnimationFrame(a))};window.addEventListener("scroll",n,{passive:!0}),window.addEventListener("resize",n,{passive:!0}),a()}function Ae(e){for(const t of Array.from(e.querySelectorAll("[data-copy]")))t.addEventListener("click",()=>{var o;const a=t.dataset.copy??"",n=t.textContent??"Copy";(o=navigator.clipboard)==null||o.writeText(a).then(()=>{t.textContent="Copied",setTimeout(()=>t.textContent=n,1600)}).catch(()=>{t.textContent="Press ⌘C",setTimeout(()=>t.textContent=n,2200)})})}const Me=y.skills.maxLevel;function Le(e,t){const a=t[e],n=new Set(y.unlocks[e].map(l=>l.level));let o=0;for(let l=2;l<=a;l+=1)n.has(l)||(o+=y.skills.coreStat[e].perLevelPct);return o}function ze(e,t){const{windowPctAtLevel1:a,windowPctAtLevel20:n}=y.cooking,o=Me-1,l=Math.min(Math.max(e.firecraft-1,0),o)/o,d=a+(n-a)*l,s=y.economy.pan.find(m=>m.tier===t),c=d+((s==null?void 0:s.windowBonusPct)??0),b=1+Le("knifework",e)/100;return Math.min(c*b,100)}const de=45,ce=90;function Ie(e,t){const a=Math.min(Math.max(e,0),de),n=Math.min(Math.max(e*y.cooking.fineWindowMultiplier,a),ce),o=a/200,l=n/200,d=s=>Math.min(Math.max(s,0),1);return{centre:t,superbPct:a,finePct:n,superbFrom:d(t-o),superbTo:d(t+o),fineFrom:d(t-l),fineTo:d(t+l)}}const Pe=[{id:"bronze",minHold:5e3},{id:"silver",minHold:2e4},{id:"gold",minHold:1e5}],Fe=[{id:"hat_01_chef",kind:"hat",name:"Chef toque",unlock:{type:"cookQuality",minQuality:"fine"}},{id:"hat_02_straw",kind:"hat",name:"Straw hat",unlock:{type:"skillLevel",skill:"foraging",level:10}},{id:"hat_03_mushroom",kind:"hat",name:"Mushroom cap",unlock:{type:"dishesCooked",count:50}},{id:"hat_04_acorn",kind:"hat",name:"Acorn cap",unlock:{type:"sectionRecipes",section:2}},{id:"hat_05_circlet",kind:"hat",name:"Circlet",unlock:{type:"anySkillLevel",level:20}},{id:"hat_06_dragonscale",kind:"hat",name:"Dragonscale hat",unlock:{type:"recipeQuality",recipeNumber:20,quality:"superb"}},{id:"hat_07_moonpetal",kind:"hat",name:"Moonpetal crown",unlock:{type:"recipeQuality",recipeNumber:19,quality:"superb"}},{id:"hat_08_bronze",kind:"hat",name:"Bronze toque",unlock:{type:"tier",tier:"bronze"}},{id:"hat_09_gold",kind:"hat",name:"Gold toque",unlock:{type:"tier",tier:"gold"}},{id:"companion_01_hen",kind:"companion",name:"Hen",unlock:{type:"start"}},{id:"companion_02_piglet",kind:"companion",name:"Piglet",unlock:{type:"chefLevel",level:5}},{id:"companion_03_berrymouse",kind:"companion",name:"Berrymouse",unlock:{type:"chefLevel",level:10}},{id:"companion_04_mole",kind:"companion",name:"Mole",unlock:{type:"skillLevel",skill:"prospecting",level:10}},{id:"companion_05_owlet",kind:"companion",name:"Owlet",unlock:{type:"chefLevel",level:20}},{id:"companion_06_glowslime",kind:"companion",name:"Glowslime",unlock:{type:"tier",tier:"silver"}},{id:"companion_07_emberfox",kind:"companion",name:"Emberfox",unlock:{type:"tier",tier:"gold"}}],Re={tiers:Pe,items:Fe},me=Re,ee=me.items,he=me.tiers;function Ne(e){var t;return((t=he.find(a=>a.id===e))==null?void 0:t.minHold)??0}function He(e){switch(e.type){case"start":return"Yours from the start";case"chefLevel":return`Reach Chef Level ${e.level}`;case"skillLevel":return`Reach ${e.skill} ${e.level}`;case"anySkillLevel":return`Take any skill to ${e.level}`;case"dishesCooked":return`Cook ${e.count} dishes`;case"cookQuality":return`Cook any dish at ${e.minQuality} or better`;case"sectionRecipes":return"Cook every Deep Forest recipe at least once";case"recipeQuality":{const t=G[e.recipeNumber-1];return`Cook ${(t==null?void 0:t.name)??`recipe ${e.recipeNumber}`} at ${e.quality}`}case"tier":return`Hold ${Ne(e.tier).toLocaleString()} $COOK`;default:return"Locked"}}const S="/assets/generated",w={painting(e,t=!1){return`/assets/site/${e}-${t?"narrow":"wide"}.jpg`},paintingSrcset(e){return`${w.painting(e,!0)} 720w, ${w.painting(e,!1)} 1440w`},hat:e=>`${S}/hats/${e}.png`,companion:e=>`${S}/companions/${e}.png`,dish:e=>`${S}/dishes/${e}.png`,ingredient:e=>`${S}/ingredients/${e}.png`,prop:e=>`${S}/props/${e}.png`,node:e=>`${S}/nodes/${e}.png`,character:e=>`${S}/characters/${e}.png`,async hatOffsets(){try{const e=await fetch(`${S}/offsets.json`);if(!e.ok)return{};const t=await e.json(),a={};for(const[n,o]of Object.entries(t.hats??{}))o.down&&(a[n]=o.down);return a}catch{return{}}}};function Ke(e){return new Promise(t=>{const a=new Image;a.decoding="async",a.onload=()=>t(a),a.onerror=()=>t(null),a.src=e})}async function te(e){var c,b,m,f;const[t,a,n]=await Promise.all([Ke(w.character(e)),fetch(`${S}/characters/${e}.json`).then(p=>p.ok?p.json():null).catch(()=>null),fetch(`${S}/manifest.json`).then(p=>p.ok?p.json():null).catch(()=>null)]);if(!t||!a)return null;const o=new Map(a.frames.map(p=>[p.filename,p.frame])),d=(((f=(m=(b=(c=n==null?void 0:n.bodies)==null?void 0:c[e])==null?void 0:b.walk)==null?void 0:m.right)==null?void 0:f.order)??[0,1,2,3]).map(p=>o.get(`${e}_walk_right_${p}`)).filter(p=>p!==void 0),s=d[0]??o.get(`${e}_idle_down`);return!s||d.length===0?null:{sheet:t,walkRight:d,frameWidth:s.w,frameHeight:s.h}}const We={1:"map_meadows",2:"map_forest",3:"map_caves"};function qe(e){const t=re.filter(a=>a.section===e);return i`
    <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 0.35rem">
      ${t.map(a=>i`
          <div class="sprite-tile" title="${a.name}">
            <img
              class="sprite"
              src="${w.ingredient(a.id)}"
              alt="${a.name}"
              width="64"
              height="64"
              loading="lazy"
              decoding="async"
            />
          </div>
        `)}
    </div>
    <p class="small muted mono" style="margin-top: 0.5rem">
      ${t.map(a=>a.name).join(" · ")}
    </p>
  `}function Be(e){if(e<=1)return"from the first minute";const t=y.chef.targetHours[String(e)];return t===void 0?`at Chef Level ${e}`:`about ${t} hours in`}function je(e){const t=We[e.index];return i`
    <article class="card">
      ${t?i`<img
            class="sprite"
            style="width: 100%; height: 7rem; object-fit: cover; border-radius: 6px; image-rendering: auto; margin-bottom: 0.7rem"
            src="${w.painting(t,!0)}"
            alt="${e.name}"
            loading="lazy"
            decoding="async"
          />`:""}
      <h3 style="color: ${e.accentColor}">${e.name}</h3>
      <p class="small mono muted">
        ${e.unlockChefLevel<=1?"Open from the start":`Chef Level ${e.unlockChefLevel}`}
        · ${Be(e.unlockChefLevel)}
      </p>
      ${qe(e.index)}
    </article>
  `}function De(e){const t=[{title:`Hold ${e.minHold.toLocaleString()} $COOK`,body:`The door opens at ${e.minHold.toLocaleString()} $COOK in your wallet. It is checked when you sign in and every half hour while you play, and nothing is ever taken from your wallet to enter.`},{title:"Connect Phantom and sign in",body:"One signature, which is free and is not a transaction: it proves the wallet is yours and does nothing else. No approvals, no spend permissions, no gas."},{title:"Gather, cook, sell, level up",body:"Forage the meadows, time the heat bar, sell what you cook to the Tavern, and put the coins into a better pan so the next dish is easier."}],a=[{title:"Expedition",art:w.node("node_berry"),body:"Pick a biome and fill the bag."},{title:"Kitchen",art:w.prop("kitchen"),body:"Prep, then time the heat."},{title:"Tavern",art:w.prop("tavern"),body:"Sell the dish. Eat one yourself."},{title:"Deeper",art:w.prop("portal_forest"),body:"Chef Levels open the next biome."}];return _({id:"how-it-works",painting:"map_hub",label:"how-it-works.txt",eager:!0,body:i`
      <h2>Three steps in, and then a loop</h2>
      <ol class="steps">
        ${t.map(n=>i`
            <li>
              <h3>${n.title}</h3>
              <p class="small muted">${n.body}</p>
            </li>
          `)}
      </ol>

      <div class="loop" style="margin-top: 2rem">
        ${a.map((n,o)=>i`
            ${o>0?i`<div class="loop-arrow">→</div>`:""}
            <div class="card loop-step">
              <img
                class="sprite"
                src="${n.art}"
                alt=""
                height="72"
                loading="lazy"
                decoding="async"
                style="height: 4.5rem; width: auto"
              />
              <h3>${n.title}</h3>
              <p class="small muted">${n.body}</p>
            </div>
          `)}
      </div>
      <p class="small muted" style="margin-top: 0.8rem">
        Gather nodes are per-player, so nobody is racing you for a bush.
      </p>
    `})}function Ge(){return _({id:"the-world",painting:"map_meadows",label:"the-world.txt",body:i`
      <h2>One village, three biomes</h2>
      <p class="lead">
        Floor 1 is a painted village with a Kitchen, a Tavern, an Outfitter and the
        cauldron, and three ways out of it. Each biome grows eight ingredients of its
        own, and each opens at a Chef Level rather than a paywall.
      </p>
      <div class="grid cols-3">${U.map(je)}</div>
      <p class="small muted" style="margin-top: 0.9rem">
        ${re.length} ingredients in all. Two of them — moonpetal and dragon's
        breath chili — are rare, and never more than
        ${y.gathering.maxRareNodesPerSection} nodes of them exist in a biome at a
        time.
      </p>
    `})}const Ue={foraging:"Plants, mushrooms and honey. Levels open the next biome's plant life, reveal rare nodes on the minimap, and add carry slots.",prospecting:"Salt, clay, iron and crystal. Levels open the next biome's minerals and add a chance of a double drop, mineral by mineral.",knifework:"The prep step. Levels add ingredient slots — two at the start, six by the end — and improve the quality prep can reach.",firecraft:"The heat. Every technique is a Firecraft unlock, the timing window widens with every level, and two- then three-pot cooking arrive at 8 and 16.",spicecraft:"Seasoning, and the dangerous ingredients. Levels make nightshade pepper and dragon's breath chili safe to handle and add quality-step chances."},Xe={foraging:w.node("node_herb"),prospecting:w.node("node_clay"),knifework:w.ingredient("sunwheat"),firecraft:w.prop("prop_campfire"),spicecraft:w.ingredient("nightshade_pepper")};function Qe(e){return y.unlocks[e].filter(t=>t.kind!=="gatherSpeed").slice(0,5).map(t=>`${t.level} · ${t.label}`)}function Je(e){const t=y.skills.coreStat[e];return i`
    <article class="card">
      <img
        class="sprite"
        src="${Xe[e]}"
        alt=""
        loading="lazy"
        decoding="async"
        style="height: 3rem; width: auto; margin-bottom: 0.5rem"
      />
      <h3>${y.skills.names[e]}</h3>
      <p class="small mono muted">
        1–${y.skills.maxLevel} · +${t.perLevelPct}% ${t.label} a level
      </p>
      <p class="small">${Ue[e]}</p>
      <ul class="small muted mono" style="list-style: none; padding: 0">
        ${Qe(e).map(a=>i`<li>${a}</li>`)}
      </ul>
      <p class="small muted">At 20: <strong>${y.skills.titles[e]}</strong></p>
    </article>
  `}function q(e){return Ie(ze({foraging:1,prospecting:1,knifework:1,firecraft:e,spicecraft:1},0),.5)}function Ve(){const e=q(1),t=q(y.skills.maxLevel);return _({id:"skills",painting:"map_forest",label:"skills.txt",body:i`
      <h2>Five skills, and one Chef Level over the top of them</h2>
      <p class="lead">
        Every skill runs 1 to ${y.skills.maxLevel} on its own track. Chef Level is
        the one that everything feeds: it runs 1 to ${y.chef.maxLevel}, it is what
        opens the next biome, and it is what the leaderboard sorts on.
      </p>

      <div class="grid cols-3">${ue.map(Je)}</div>

      <div class="card card-warm" style="margin-top: 1.4rem">
        <h3>The window grows with Firecraft</h3>
        <p class="small">
          The Superb band is <strong>${e.superbPct.toFixed(1)}%</strong> of the bar at
          Firecraft 1 and <strong>${t.superbPct.toFixed(1)}%</strong> at
          ${y.skills.maxLevel} — wider again with a better pan and with Knifework
          behind it, and capped at ${de}% so there is always a bar
          left to miss. Fine is ${y.cooking.fineWindowMultiplier} times as wide,
          capped at ${ce}%.
        </p>
        ${Ye()}
      </div>
    `})}function Ye(){return i`
    <div class="heat" id="heat-demo">
      <div class="filters" role="group" aria-label="Firecraft level">
        ${[1,10,y.skills.maxLevel].map(e=>i`
            <button class="chip" data-firecraft="${e}" aria-pressed="${e===1}">
              Firecraft ${e}
            </button>
          `)}
        <button class="chip" data-heat-stop aria-pressed="false">Stop the marker</button>
      </div>
      <div class="heat-track" id="heat-track">
        <div class="heat-fine" id="heat-fine"></div>
        <div class="heat-superb" id="heat-superb"></div>
        <div class="heat-marker" id="heat-marker"></div>
      </div>
      <p class="heat-legend" style="margin-top: 0.5rem">
        <span><i style="background: rgba(181, 72, 126, 0.85)"></i>Superb</span>
        <span><i style="background: rgba(242, 181, 59, 0.6)"></i>Fine</span>
        <span id="heat-result">A demo. Nothing here is scored or saved.</span>
      </p>
    </div>
  `}function Ze(){const e=document.getElementById("heat-track"),t=document.getElementById("heat-fine"),a=document.getElementById("heat-superb"),n=document.getElementById("heat-marker"),o=document.getElementById("heat-result"),l=document.getElementById("heat-demo");if(!e||!t||!a||!n||!o||!l)return;let d=1,s=q(d),c=!0,b=!0,m=0;const f=()=>{t.style.left=`${s.fineFrom*100}%`,t.style.width=`${(s.fineTo-s.fineFrom)*100}%`,a.style.left=`${s.superbFrom*100}%`,a.style.width=`${(s.superbTo-s.superbFrom)*100}%`},p=()=>m>=s.superbFrom&&m<=s.superbTo?"Superb":m>=s.fineFrom&&m<=s.fineTo?"Fine":"Common";for(const C of Array.from(l.querySelectorAll("[data-firecraft]")))C.addEventListener("click",()=>{d=Number(C.dataset.firecraft??"1"),s=q(d);for(const E of Array.from(l.querySelectorAll("[data-firecraft]")))E.setAttribute("aria-pressed",String(E===C));c=!0,o.textContent=`Superb is ${s.superbPct.toFixed(1)}% of the bar here.`,f()});const v=l.querySelector("[data-heat-stop]"),A=()=>{c=!c,o.textContent=c?"A demo. Nothing here is scored or saved.":`${p()}. A demo — nothing here is scored or saved.`,v==null||v.setAttribute("aria-pressed",String(!c))};v==null||v.addEventListener("click",A),e.addEventListener("click",A);const z=y.cooking.barMs/y.cooking.markerSpeedMultiplier;let P=performance.now(),F=0;const R=C=>{const E=Math.min(64,C-P);if(P=C,c&&b){F+=E;const M=F%(z*2)/z;m=M<=1?M:2-M,n.style.left=`${m*100}%`}requestAnimationFrame(R)};"IntersectionObserver"in window&&new IntersectionObserver(C=>{for(const E of C)b=E.isIntersecting},{rootMargin:"120px"}).observe(e),f(),requestAnimationFrame(R)}function et(e){var t;return((t=U.find(a=>a.index===e))==null?void 0:t.name)??""}const tt={raw:"Raw",pan_fry:"Pan-fry",simmer:"Simmer",bake:"Bake",clay_bake:"Clay bake",roast:"Roast",smoke:"Smoke",chill:"Chill"};function at(e){const t=Object.entries(e.requirements).map(([a,n])=>`${y.skills.names[a]} ${n}`);return t.length===0?"No requirements":t.join(" · ")}function nt(e){return i`
    <article class="card recipe" data-biome="${e.section}">
      <img
        class="sprite"
        src="${w.dish(e.id)}"
        alt=""
        width="64"
        height="64"
        loading="lazy"
        decoding="async"
      />
      <div>
        <h3>${e.name}</h3>
        <p class="meta">
          ${et(e.section)} · ${tt[e.technique]??e.technique}
          · ${e.chefXp} XP · ${e.sellCoins} coins
        </p>
        <p class="small" style="margin: 0.3rem 0 0">
          ${e.ingredients.map(t=>`${t.qty}× ${fe(t.id).name}`).join(", ")}
        </p>
        <p class="meta">${at(e)}</p>
      </div>
    </article>
  `}function ot(){const e=y.cooking.quality;return _({id:"cooking",painting:"map_caves",label:"cooking.txt",body:i`
      <h2>One bar, three outcomes</h2>
      <p class="lead">
        Prep the ingredients, then the heat bar: a marker sweeps back and forth for
        ${(y.cooking.barMs/1e3).toFixed(0)} seconds and you click to stop it.
        Land in the narrow band for Superb, the wider one for Fine, anywhere else — or
        run out of time — for Common.
      </p>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Quality</th>
              <th class="num">XP</th>
              <th class="num">Coins</th>
              <th>What it takes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Common</td>
              <td class="num">×${e.common.xp}</td>
              <td class="num">×${e.common.coins}</td>
              <td class="small muted">Anywhere else, or the clock running out</td>
            </tr>
            <tr>
              <td>Fine</td>
              <td class="num">×${e.fine.xp}</td>
              <td class="num">×${e.fine.coins}</td>
              <td class="small muted">The wider band</td>
            </tr>
            <tr>
              <td>Superb</td>
              <td class="num">×${e.superb.xp}</td>
              <td class="num">×${e.superb.coins}</td>
              <td class="small muted">The narrow band inside it</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="small muted">
        Skill is the only thing that widens the bands: Firecraft most of all, then the
        pan you bought with coins and the Knifework behind your prep. There is nothing
        to buy with $COOK that makes a dish better.
      </p>

      <h3 style="margin-top: 1.8rem">All ${G.length} recipes</h3>
      <div class="filters" role="group" aria-label="Filter recipes by biome">
        <button class="chip" data-filter="all" aria-pressed="true">All</button>
        ${U.map(t=>i`
            <button class="chip" data-filter="${t.index}" aria-pressed="false">
              ${t.name}
            </button>
          `)}
      </div>
      <div class="recipe-list" id="recipe-list">${G.map(nt)}</div>
    `})}function rt(){const e=document.getElementById("recipe-list");if(!e)return;const t=Array.from(document.querySelectorAll("[data-filter]"));for(const a of t)a.addEventListener("click",()=>{const n=a.dataset.filter??"all";for(const o of t)o.setAttribute("aria-pressed",String(o===a));for(const o of Array.from(e.querySelectorAll(".recipe")))o.hidden=n!=="all"&&o.dataset.biome!==n})}const it={bronze:"A toque.",silver:"A companion.",gold:"A toque and a companion."};function ae(e){const t=e.kind==="hat"?w.hat(e.id):w.companion(e.id),a=e.unlock.type==="tier"?e.unlock.tier:null;return i`
    <article class="card">
      <div class="sprite-tile">
        <img
          class="sprite"
          src="${t}"
          alt="${e.name}"
          loading="lazy"
          decoding="async"
          style="height: ${e.kind==="hat"?"3.4rem":"4rem"}; width: auto"
        />
      </div>
      <h3>${e.name}</h3>
      <p class="meta">${He(e.unlock)}</p>
      ${a?i`<span class="tier tier-${a}">${a}</span>`:""}
    </article>
  `}function st(){const e=ee.filter(a=>a.kind==="hat"),t=ee.filter(a=>a.kind==="companion");return _({id:"wardrobe",painting:null,label:"wardrobe.txt",body:i`
      <h2>${e.length} hats, ${t.length} companions</h2>
      <p class="lead">
        All of it is cosmetic. Not one hat or companion changes how fast you gather, how
        well you cook, or what you earn — and most of them are earned by playing.
      </p>

      <h3>Hats</h3>
      <div class="gallery">${e.map(ae)}</div>

      <h3 style="margin-top: 1.6rem">Companions</h3>
      <p class="small muted">
        A companion follows a cell behind you and does nothing else at all.
      </p>
      <div class="gallery">${t.map(ae)}</div>

      <h3 style="margin-top: 1.6rem">Holder tiers</h3>
      <p class="small">
        Three of the items above are tied to a balance rather than owned. They are
        cosmetic like everything else here: if the balance falls the item comes off, and
        it returns when the balance recovers.
      </p>
      <div class="grid cols-3">
        ${he.map(a=>i`
            <div class="card">
              <span class="tier tier-${a.id}">${a.id}</span>
              <h3 style="margin-top: 0.4rem">${a.minHold.toLocaleString()} $COOK</h3>
              <p class="small muted">${it[a.id]??""} Cosmetic only.</p>
            </div>
          `)}
      </div>
    `})}function lt(e){return!e.showMint||e.cookMint.trim()===""?i`
      <div class="address">
        <code>Revealed at launch</code>
        <span class="small muted">
          There is no $COOK contract address yet. Anyone showing you one is not us.
        </span>
      </div>
    `:i`
    <div class="address">
      <code>${e.cookMint}</code>
      <button class="btn btn-primary" data-copy="${e.cookMint}">Copy</button>
    </div>
  `}function dt(e){const t=e.showMint&&e.cookMint.trim()!=="";return _({id:"token",painting:"map_hub",label:"token.txt",body:i`
      <h2>$COOK is the key, not the game</h2>
      <div class="grid cols-2">
        <div>
          <p class="lead">
            Holding ${e.minHold.toLocaleString()} $COOK opens the hub. That is what
            it is for. It is not spent to play, it is not staked, and no amount of it
            makes a dish cook better.
          </p>
          <ul>
            <li><strong>Entry.</strong> ${e.minHold.toLocaleString()} $COOK in the wallet you sign in with.</li>
            <li><strong>Cosmetics.</strong> Three wardrobe items follow a balance, and a $COOK cosmetics shop is built but switched off.</li>
            <li><strong>Seasonal votes.</strong> Planned: holders vote on what a season brings.</li>
          </ul>
        </div>
        <div>
          <h3>Where the fees go</h3>
          <p class="small">
            Trading $COOK generates standard pump.fun creator fees. Those fees are
            received by the team at the project treasury wallet and pay for the servers
            and the development.
          </p>
          <p class="small">
            <strong>Nothing is paid out to holders.</strong> Holding $COOK is not a
            claim on those fees or on any other payment, and there is no distribution,
            revenue share or payout attached to it.
          </p>
        </div>
      </div>

      <h3 style="margin-top: 1.6rem">The contract address</h3>
      ${lt(e)}
      <div class="warn small">
        <strong>One address, one domain.</strong> The only official site is
        ${e.domain}, and the address above is the one this server gates on — it is
        read from the running deployment, not written into the page. Any other contract
        address is a different token, whoever is posting it.
      </div>

      <h3 style="margin-top: 1.6rem">How to buy, in three taps</h3>
      <ol class="steps">
        <li>
          <h3>Get SOL in Phantom</h3>
          <p class="small muted">Any Solana wallet works; Phantom is the one most people have.</p>
        </li>
        <li>
          <h3>Paste the address</h3>
          <p class="small muted">
            ${t?"Open pump.fun or Jupiter, paste the address above, and swap.":"At launch: open pump.fun or Jupiter and paste the address above."}
          </p>
        </li>
        <li>
          <h3>Hold ${e.minHold.toLocaleString()} and play</h3>
          <p class="small muted">Come back to this page, press Play, and sign in.</p>
        </li>
      </ol>
      <p class="small muted">
        Only buy what you can afford to lose. Token prices go down as easily as up, and
        this one can go to nothing.
      </p>
    `})}function ct(e){const t=W(e.social.x),a=W(e.social.telegram),n=[{label:"Official domain",value:e.domain,href:`https://${e.domain}`},{label:"Contract address",value:e.showMint&&e.cookMint.trim()!==""?e.cookMint:"Revealed at launch",copy:e.showMint&&e.cookMint.trim()!==""?e.cookMint:void 0},{label:"Treasury wallet",value:e.treasuryWallet.trim()===""?"Published at launch":e.treasuryWallet,copy:e.treasuryWallet.trim()===""?void 0:e.treasuryWallet},{label:"X",value:t??"We have no X account",href:t?`https://x.com/${t}`:void 0},{label:"Telegram",value:a??"We have no Telegram",href:a?`https://t.me/${a}`:void 0}];return _({id:"proof",painting:null,label:"proof.txt",body:i`
      <h2>Everything you should check</h2>
      <p class="lead">
        A token project attracts people who register a similar name and publish a
        different address. The defence is a short list at the real domain, so here it is.
        "We have no account there" is a real answer, and a better one than silence.
      </p>

      <div class="grid">
        ${n.map(o=>i`
            <div class="address">
              <span class="small muted mono" style="flex: 0 0 9rem">${o.label}</span>
              ${o.href?i`<code><a href="${o.href}" rel="noopener">${o.value}</a></code>`:i`<code title="${o.value}">${o.value.length>48?Ce(o.value,14):o.value}</code>`}
              ${o.copy?i`<button class="btn" data-copy="${o.copy}">Copy</button>`:""}
            </div>
          `)}
      </div>
      <p class="small muted">
        The source is private, so there is no repository to link. The pages that matter
        are <a href="/official">/official</a> and <a href="/rules">/rules</a>, and both
        read their facts from this server at request time.
      </p>

      <div class="warn">
        <p class="small">
          <strong>$COOK is a community token.</strong> It is not a share, not an
          investment, and not a claim on anything we own or earn. We make no promise
          about its price, and no promise of rewards, income, airdrops or returns of any
          kind. Nothing on this site is financial advice.
        </p>
        <p class="small">
          There are no cash prizes. Nothing in the game pays out money, and the coins you
          earn by playing exist only inside the game. Cosmetics belong to the wallet, not
          to you: they are not tradable and cannot be moved to another wallet.
        </p>
      </div>
    `})}const mt=[{id:"floor-1",name:"Floor 1 — The Village",status:"live",chefLevels:"Chef 1 to 30",town:"The village, with the Kitchen, the Tavern, the Outfitter and the cauldron.",painting:"map_hub",biomes:["Meadows","The Deep Forest","Mystical Caves"],brings:["24 ingredients and 20 recipes","Five skills: Foraging, Prospecting, Knifework, Firecraft, Spicecraft","Nine hats and seven companions","The heat bar, pan and bag tiers, and the leaderboard"]},{id:"floor-2",name:"Floor 2 — The Coast",status:"next",chefLevels:"Chef 30 to 60",town:"A harbour town, with its own kitchen.",painting:"map_meadows",biomes:["Tidepools","The Salt Marsh","The Sunken Reef"],brings:["Seafood and sea-plant ingredients","20 new recipes","A sixth skill: Fishing","Two new techniques: Fermenting and Grilling"]},{id:"floor-3",name:"Floor 3 — The Peaks",status:"later",chefLevels:"Chef 60 to 90",town:"A mountain monastery.",painting:"map_caves",biomes:["Alpine Meadows","The Frozen Forest","The Sky Caves"],brings:["Highland ingredients","20 new recipes","A seventh skill: Hunting","Two new techniques: Smoking and Preserving","The Grand Feast"]}],ht=[{name:"Cook-off",detail:"Two chefs, the same recipe, sixty seconds. Best score takes it."},{name:"Ingredient Rush",detail:"A timed race to gather what a dish needs and get it cooked."},{name:"Cauldron Duel",detail:"Your cooked dishes are a deck; their buffs play against each other."},{name:"Weekly Chef's Challenge",detail:"One set dish, one week, one board."}],pt=["Seasonal hats and companions","Cloaks return with the art overhaul","Camp decorations","Villager quests, with stories rather than fetch lists","Hidden recipes and secret spots","Seasons, each with a technique, a limited cosmetic and a leaderboard reset"],ut=["More room for players","Smoother updates","An art overhaul: characters redrawn with full outfits, to match the painted world","Seasons"],ft=["Legendary dishes and mastery","Feasts","More $COOK cosmetics, half of every purchase burned","Holder tiers","Paid upgrades, in coins or $COOK","A player market — with a treasury fee and anti-bot rules in place first"],gt={live:"live",next:"next",later:"planned"};function bt(e){return i`
    <article class="card floor" id="${e.id}">
      ${e.painting?i`<img
            class="floor-art"
            src="${w.painting(e.painting,!0)}"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />`:""}
      <div class="floor-head">
        <h3>${e.name}</h3>
        <span class="badge badge-${e.status}">${gt[e.status]}</span>
        <span class="mono muted">${e.chefLevels}</span>
      </div>
      <p class="small">${e.town}</p>
      <p class="small muted mono">${e.biomes.join(" · ")}</p>
      <ul class="small">
        ${e.brings.map(t=>i`<li>${t}</li>`)}
      </ul>
    </article>
  `}function yt(){return i`
    <h2>Where this goes</h2>
    <p class="lead">
      Each floor is a hub with three biomes, its own ingredients and recipes, and
      its own stretch of Chef Levels. Floor 1 is the game you can play today.
    </p>
    <p class="warn small">
      <strong>A plan, not a promise.</strong> Everything past Floor 1 is what we
      intend to build, in roughly this order. Names are working titles, scope
      changes, and dates are deliberately absent because we would only be
      guessing at them.
    </p>

    <div class="timeline">${mt.map(bt)}</div>

    <h3 style="margin-top: 2rem">Minigames</h3>
    <p class="small muted">
      Opt-in, and the rewards are titles and cosmetics. Nothing in them pays out
      coins, $COOK or anything else, and nothing in them is wagered.
    </p>
    <div class="grid cols-4">
      ${ht.map(e=>i`
          <div class="card">
            <h3>${e.name}</h3>
            <p class="small muted">${e.detail}</p>
          </div>
        `)}
    </div>

    <div class="grid cols-3" style="margin-top: 1.4rem">
      <div class="card">
        <h3>Cosmetics, quests and secrets</h3>
        <ul class="small">
          ${pt.map(e=>i`<li>${e}</li>`)}
        </ul>
      </div>
      <div class="card">
        <h3>Next, after launch</h3>
        <ul class="small">${ut.map(e=>i`<li>${e}</li>`)}</ul>
      </div>
      <div class="card">
        <h3>Later, if the game grows</h3>
        <ul class="small">${ft.map(e=>i`<li>${e}</li>`)}</ul>
      </div>
    </div>
  `}function wt(){return _({id:"roadmap",painting:"map_forest",label:"roadmap.txt",body:yt()})}function vt(e,t){return i`
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
          <span><b data-live="playersOnline">${O((t==null?void 0:t.playersOnline)??null)}</b> playing now</span>
          <span><b data-live="chefsRegistered">${O((t==null?void 0:t.chefsRegistered)??null)}</b> chefs registered</span>
          <span><b data-live="dishesCooked">${O((t==null?void 0:t.dishesCooked)??null)}</b> dishes cooked</span>
        </p>
        <p class="small muted" style="margin-top: 0.7rem">
          Holding ${e.minHold.toLocaleString()} $COOK opens the door. Signing in is
          free and never asks your wallet for a transaction.
        </p>
      </div>
    </section>
  `}function kt(e){return i`
    ${De(e)} ${Ge()} ${Ve()} ${ot()}
    ${st()} ${wt()} ${dt(e)} ${ct(e)}
  `}function $t(e,t){return i`
    ${Te()}
    <main class="site-wrap">${vt(e,t)} ${kt(e)}</main>
    ${Ee(t)} ${Oe(e)}
  `}function xt(e){for(const t of Array.from(document.querySelectorAll("[data-live]"))){const a=t.dataset.live;a&&typeof e[a]=="number"&&(t.textContent=O(e[a]))}}const j=8e3,T=3;function D(e){return new Promise(t=>{const a=new Image;a.decoding="async",a.onload=()=>t(a),a.onerror=()=>t(null),a.src=e})}function Ct(e){const t=e.getContext("2d",{alpha:!0});if(!t)return()=>{};const a=window.matchMedia("(prefers-reduced-motion: reduce)").matches;let n=0,o=0,l=null,d=[];const s=[];let c=null,b=performance.now()+4e3;const m=[];let f=0,p=!1;function v(){const h=e.getBoundingClientRect(),r=Math.min(window.devicePixelRatio||1,2);n=Math.max(1,Math.round(h.width)),o=Math.max(1,Math.round(h.height)),e.width=Math.round(n*r),e.height=Math.round(o*r),t.setTransform(r,0,0,r,0,0),t.imageSmoothingEnabled=!1,A(),z()}function A(){const h=a?0:Math.min(46,Math.round(n/26));d=Array.from({length:h},(r,u)=>{const g=(u+.5)/h*n+(Math.sin(u*12.9898)*.5+.5)*14,$=Math.sin(u*78.233)*.5+.5;return{x:g,y:o-6-$*Math.min(70,o*.1),height:7+$*9,phase:u*.7,shade:$>.5?"rgba(92, 138, 74, 0.55)":"rgba(63, 107, 70, 0.5)"}})}function z(){const h=o-Math.min(48,o*.07);for(let r=0;r<m.length;r+=1)m[r].y=h-r*6}function P(h){if(!l){t.fillStyle="#14101a",t.fillRect(0,0,n,o);return}const r=Math.max(n/l.width,o/l.height),u=l.width*r,g=l.height*r,$=a?0:Z(h,0,j*3,n)*9;t.drawImage(l,(n-u)/2+$,(o-g)*.62,u,g)}function F(h){for(const r of d){const u=ge(h,r.x,r.phase,j,n);t.save(),t.translate(r.x,r.y),t.rotate(u.angle*Math.PI/180),t.fillStyle=r.shade,t.fillRect(-1,-r.height,2,r.height),t.fillRect(-3,-r.height*.6,2,r.height*.6),t.fillRect(1,-r.height*.75,2,r.height*.75),t.restore()}}function R(h,r){if(!a){if(f%22===0)for(const u of[.26,.68])s.push({x:n*u,y:o*.34,age:0,life:5200,drift:0,size:5});for(let u=s.length-1;u>=0;u-=1){const g=s[u];if(g.age+=r,g.age>g.life){s.splice(u,1);continue}const $=g.age/g.life;g.drift+=Z(h,g.x,j,n)*.35,t.globalAlpha=(1-$)*.22,t.fillStyle="#cfc6bb",t.beginPath(),t.arc(g.x+g.drift,g.y-$*o*.22,g.size+$*16,0,Math.PI*2),t.fill(),t.globalAlpha=1}}}function C(h,r){if(a||(!c&&h>b&&(c={x:-30,y:o*(.18+Math.random()*.14),speed:.045+Math.random()*.02,phase:Math.random()*Math.PI*2}),!c))return;if(c.x+=c.speed*r,c.x>n+30){c=null,b=h+9e3+Math.random()*9e3;return}const u=Math.sin(h/90+c.phase)*4;t.strokeStyle="rgba(24, 20, 30, 0.55)",t.lineWidth=2,t.beginPath(),t.moveTo(c.x-6,c.y+u),t.lineTo(c.x,c.y),t.lineTo(c.x+6,c.y+u),t.stroke()}function E(h){for(const r of m){r.x+=r.speed*h,r.x>n+60&&(r.x=-60-Math.random()*120),r.step+=h;const u=r.body.walkRight,g=u[Math.floor(r.step/100)%u.length],$=g.w*T,N=g.h*T,H=Math.round(r.x),k=Math.round(r.y-N),L=Math.floor(r.step/200)%2===0?0:T;if(t.drawImage(r.body.sheet,g.x,g.y,g.w,g.h,H,k+L,$,N),r.hat&&t.drawImage(r.hat,H+r.hatOffset.x*T,k+L+r.hatOffset.y*T,r.hat.width*T,r.hat.height*T),r.companion){const V=r.companion.width*T,Y=r.companion.height*T;t.drawImage(r.companion,Math.round(r.x-V-8),Math.round(r.y-Y+L),V,Y)}}}let M=performance.now();function Q(h){if(p)return;const r=Math.min(64,h-M);M=h,f+=1,t.clearRect(0,0,n,o),P(h),R(h,r),C(h,r),F(h),E(r),requestAnimationFrame(Q)}const J=()=>v();return window.addEventListener("resize",J,{passive:!0}),v(),requestAnimationFrame(Q),(async()=>{const h=window.innerWidth<900;l=await D(w.painting("map_hub",h));const r=await Promise.all([te("male"),te("female")]),u=["hat_01_chef","hat_05_circlet","hat_03_mushroom","hat_07_moonpetal"],g=["companion_01_hen","companion_07_emberfox","companion_02_piglet",null],[$,N,H]=await Promise.all([Promise.all(u.map(k=>D(w.hat(k)))),Promise.all(g.map(k=>k?D(w.companion(k)):Promise.resolve(null))),w.hatOffsets()]);for(let k=0;k<u.length;k+=1){const L=r[k%2];L&&m.push({x:-80-k*150,y:o,speed:.022+k*.004,body:L,hat:$[k]??null,hatOffset:H[u[k]??""]??{x:6,y:-12},companion:N[k]??null,step:k*340})}z()})(),()=>{p=!0,window.removeEventListener("resize",J)}}const St=["/official","/rules","/roadmap"];function pe(e){const t=e.replace(/\/+$/,"")||"/";return St.includes(t)?t:null}const ne={domain:"crazycauldron.art",cookMint:"",minHold:0,social:{x:"none",telegram:"none"}};async function Tt(){try{const e=await fetch(`${oe.httpUrl}/public/config`);return e.ok?await e.json():ne}catch{return ne}}function Et(){const e=document.createElement("style");e.textContent=`
    /*
     * These pages carry their own colours rather than borrowing the shell's.
     *
     * They used to be drawn by the game's bundle, inside the game's document,
     * where the inline stylesheet had already defined all four. They are drawn
     * by the site bundle now, in a document that has its own palette and no
     * reason to keep a duplicate of this one - so if they are not declared
     * here, /rules renders as black text on black.
     */
    :root {
      --ink: #f3e9d2;
      --dim: #9a8f7a;
      --bg: #14101a;
      --accent: #7ce08a;
      color-scheme: dark;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }

    /*
     * The game shell pins the document: html and body are 100% tall with
     * overflow hidden, so a drag cannot scroll the world out from under the
     * canvas. A page is the opposite - it is a document, and has to scroll.
     */
    html, body { height: auto; overflow: auto; overscroll-behavior: auto; }
    .cc-page {
      max-width: 44rem;
      margin: 0 auto;
      padding: 2.5rem 1rem 5rem;
      line-height: 1.7;
    }
    .cc-page h1 { font-size: 1.6rem; letter-spacing: 0.06em; margin: 0 0 0.25rem; }
    .cc-page h2 { font-size: 1.05rem; margin: 2.2rem 0 0.6rem; color: var(--accent); }
    .cc-page h3 { font-size: 0.95rem; margin: 1.6rem 0 0.4rem; }
    .cc-page p, .cc-page li { color: var(--ink); }
    .cc-page .lead { color: var(--dim); margin: 0 0 2rem; }
    .cc-page a { color: var(--accent); }
    .cc-page code { background: #221c2b; padding: 0.1rem 0.3rem; border-radius: 3px; }
    .cc-page table { border-collapse: collapse; width: 100%; margin: 0.8rem 0; }
    .cc-page th, .cc-page td {
      border: 1px solid #2c2436;
      padding: 0.45rem 0.6rem;
      text-align: left;
      vertical-align: top;
    }
    .cc-page th { color: var(--dim); font-weight: normal; }
    .cc-nav { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .cc-nav a { text-decoration: none; }
    .cc-address {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      flex-wrap: wrap;
      background: #1c1725;
      border: 1px solid #2c2436;
      border-radius: 6px;
      padding: 0.8rem;
      margin: 0.6rem 0;
    }
    .cc-address code { background: none; word-break: break-all; flex: 1 1 18rem; }
    .cc-address button {
      font: inherit;
      color: var(--bg);
      background: var(--accent);
      border: 0;
      border-radius: 4px;
      padding: 0.35rem 0.9rem;
      cursor: pointer;
    }
    .cc-warn {
      border-left: 3px solid #e0a97c;
      background: #241c18;
      padding: 0.7rem 0.9rem;
      margin: 1rem 0;
    }
    .cc-note { color: var(--dim); font-size: 0.9em; }
  `,document.head.append(e)}function Ot(e){const t=document.createElement("nav");t.className="cc-nav";for(const[a,n]of[["/","← Play"],["/official","Official"],["/rules","Rules"],["/roadmap","Roadmap"]]){if(a===e)continue;const o=document.createElement("a");o.href=a,o.textContent=n,t.append(o)}return t}function X(e,t){const a=document.createDocumentFragment(),n=document.createElement("h1");n.textContent=e;const o=document.createElement("p");return o.className="lead",o.textContent=t,a.append(n,o),a}function _t(e){const t=document.createElement("div");t.className="cc-address";const a=document.createElement("code");if(a.textContent=e||"not published yet",t.append(a),e){const n=document.createElement("button");n.type="button",n.textContent="Copy",n.addEventListener("click",()=>{var o;(o=navigator.clipboard)==null||o.writeText(e).then(()=>{n.textContent="Copied",setTimeout(()=>n.textContent="Copy",1500)},()=>{n.textContent="Select it"})}),t.append(n)}return t}function x(e,t){const a=document.createElement("p");return a.textContent=e,t&&(a.className=t),a}function K(e){const t=document.createElement("ul");for(const a of e){const n=document.createElement("li");n.textContent=a,t.append(n)}return t}async function At(e){const t=await Tt();document.title="CrazyCauldron - Official",e.append(X("Official","Everything real about CrazyCauldron is on this page. If you found it anywhere else, check it here first."));const a=document.createElement("h2");a.textContent="The site";const n=document.createElement("p"),o=document.createElement("a");o.href=`https://${t.domain}`,o.textContent=t.domain,n.append("The game lives at ",o,". There is no other site."),e.append(a,n);const l=document.createElement("h2");l.textContent="The $COOK contract address",e.append(l,_t(t.cookMint));const d=document.createElement("div");d.className="cc-warn",d.append(x("This is the only $COOK. Any other contract address is a different token, whatever it is called and whoever is posting it."),x("Copy the address from this page and paste it into your wallet yourself. Do not trust one sent to you, and do not connect your wallet to a site you did not reach from this domain.","cc-note")),e.append(d),t.minHold>0&&e.append(x(`Holding at least ${t.minHold.toLocaleString()} $COOK opens the hub. The balance is checked when you sign in and while you play; nothing is ever taken from your wallet to enter.`));const s=document.createElement("h2");s.textContent="Where the fees go",e.append(s,x("Trading $COOK generates standard pump.fun creator fees. Those fees are received by the team at the project treasury wallet."),x("Nothing is paid out to holders. Holding $COOK is not a claim on those fees or on any other payment, and there is no distribution, revenue share or payout attached to it."),x("The fees fund the servers and the development, and that is what they are for. Anything spent inside the game is separate again: half of a purchase is burned and half goes to the project treasury.","cc-note"));const c=document.createElement("h2");c.textContent="Where we post",e.append(c);const b=[];for(const[m,f]of[["X",t.social.x],["Telegram",t.social.telegram]])b.push(f&&f!=="none"?`${m}: ${f}`:`${m}: no account yet. Anything claiming to be our ${m} is not ours.`);e.append(K(b)),e.append(x("When an account does exist, it will be listed here first. This page is the source, not the announcement.","cc-note"))}function Mt(e){document.title="CrazyCauldron - Rules",e.append(X("Rules","Short, and in plain language. Read the last section before you buy anything."));const t=document.createElement("h2");t.textContent="Playing",e.append(t,K(["Sign in with your wallet. Signing proves the wallet is yours; it never moves tokens and never asks for a key.","Holding enough $COOK opens the hub. Nothing is spent to enter, and your tokens stay in your wallet.","Everything you gather, cook and earn belongs to the wallet that earned it, and is there when you come back.","Play fairly. The server decides what happened - where you are, what you gathered, what you cooked - so a modified client gains nothing and a wallet that keeps trying will be shut out.","One person, as many wallets as you like. But progress does not transfer between them, and neither do cosmetics."]));const a=document.createElement("h2");a.textContent="Cosmetics",e.append(a,K(["Hats and cloaks are cosmetic. None of them changes how fast you gather, how well you cook, or what you earn.","Most are earned by playing. Some can also be bought with $COOK, and nothing is ever purchase-only.","A few are tied to your $COOK balance rather than owned. If the balance falls, the garment comes off and returns when it recovers.","Cosmetics belong to the wallet, not to you. They are not tradable and cannot be moved to another wallet."]));const n=document.createElement("h2");n.textContent="About $COOK";const o=document.createElement("div");o.className="cc-warn",o.append(x("$COOK is a community token. It is not a share, not an investment, and not a claim on anything we own or earn."),x("Trading $COOK generates standard pump.fun creator fees, which the team receives at the project treasury wallet and uses to run the servers and build the game. Nothing is paid out to holders."),x("We make no promise about its price, and no promise of rewards, income, airdrops or returns of any kind. Nothing on this site is financial advice."),x("There are no cash prizes. Nothing in the game pays out money, and coins earned by playing exist only inside the game."),x("Anything you spend is spent. A purchase burns half the tokens and sends half to the project treasury; neither half comes back, and there are no refunds."),x("Only buy what you can afford to lose. Token prices go down as easily as up, and this one can go to nothing.")),e.append(n,o);const l=document.createElement("h2");l.textContent="What we can change",e.append(l,K(["The game is under development. Numbers get tuned, features get added, and things occasionally break.","We may change prices, drop rates and unlock conditions. We will not take away a cosmetic you have earned.","The roadmap is a plan, not a promise. What gets built, and when, depends on how many people are playing."]))}function Lt(e,t){const a=e.replace(/\r\n/g,`
`).split(`
`);let n=0;const o=d=>d.replace(/^\||\|$/g,"").split("|").map(s=>s.trim()),l=(d,s)=>{const c=/(\*\*[^*]+\*\*|`[^`]+`)/g;let b=0;for(const m of d.matchAll(c)){const f=m.index??0;f>b&&s.append(d.slice(b,f));const p=m[0];if(p.startsWith("`")){const v=document.createElement("code");v.textContent=p.slice(1,-1),s.append(v)}else{const v=document.createElement("strong");v.textContent=p.slice(2,-2),s.append(v)}b=f+p.length}b<d.length&&s.append(d.slice(b))};for(;n<a.length;){const d=a[n]??"";if(d.trim()===""){n+=1;continue}const s=/^(#{1,4})\s+(.*)$/.exec(d);if(s){const m=Math.min(s[1].length,4),f=document.createElement(`h${m}`);l(s[2],f),t.append(f),n+=1;continue}if(d.includes("|")&&(a[n+1]??"").includes("---")){const m=document.createElement("table"),f=document.createElement("tr");for(const p of o(d)){const v=document.createElement("th");l(p,v),f.append(v)}for(m.append(f),n+=2;n<a.length&&(a[n]??"").includes("|");){const p=document.createElement("tr");for(const v of o(a[n]??"")){const A=document.createElement("td");l(v,A),p.append(A)}m.append(p),n+=1}t.append(m);continue}if(/^[-*]\s+/.test(d)){const m=document.createElement("ul");for(;n<a.length&&/^[-*]\s+/.test(a[n]??"");){const f=document.createElement("li");l((a[n]??"").replace(/^[-*]\s+/,""),f),m.append(f),n+=1}t.append(m);continue}const c=[];for(;n<a.length&&(a[n]??"").trim()!=="";)c.push(a[n]??""),n+=1;const b=document.createElement("p");l(c.join(" "),b),t.append(b)}}async function zt(e){document.title="CrazyCauldron - Roadmap";try{const t=await fetch("/roadmap.md");if(!t.ok)throw new Error(String(t.status));Lt(await t.text(),e)}catch{e.append(X("Roadmap","The roadmap could not be loaded just now. Please try again shortly."))}}async function It(e){var n,o;Et(),(n=document.getElementById("game"))==null||n.remove(),(o=document.getElementById("boot"))==null||o.remove();const t=document.createElement("main");t.className="cc-page",t.append(Ot(e));const a=document.getElementById("ui")??document.body;a.replaceChildren(t),a.setAttribute("style","position:static;display:block;pointer-events:auto"),e==="/official"?await At(t):e==="/rules"?Mt(t):await zt(t)}function Pt(e){const t=e.replace(/\/+$/,"")||"/";return t==="/whitepaper"||t==="/docs"?"whitepaper":t==="/roadmap"?"roadmap":pe(t)?"legal":"home"}const I=document.getElementById("site");async function Ft(){if(!I)return;const e=Pt(window.location.pathname);if(e==="legal"){I.remove();const n=pe(window.location.pathname.replace(/\/+$/,"")||"/");n&&It(n);return}ve("site-css",ke);const t=await $e();let a=null;Rt(e,t,a),a=await xe(),a&&(xt(a),Nt(a))}function Rt(e,t,a){if(I){if(e==="home"){we(I,$t(t,a));const n=document.getElementById("hero-canvas");n instanceof HTMLCanvasElement&&Ct(n),Ze(),rt()}_e(),Ae(I),Ht()}}function Nt(e){const t=document.getElementById("ticker-track");if(t)for(const a of Array.from(t.querySelectorAll("[data-live]"))){const n=a.dataset.live;n&&typeof e[n]=="number"&&(a.textContent=e[n].toLocaleString("en-US"))}}function Ht(){const e=window.location.hash.slice(1);e&&requestAnimationFrame(()=>{var t;return(t=document.getElementById(e))==null?void 0:t.scrollIntoView()})}Ft();
