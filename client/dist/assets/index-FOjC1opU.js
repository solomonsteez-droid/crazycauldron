import{e as fe,C as s,R as N,I as F,S as M,a as be,i as Z,w as ce,t as Oe,J as Ae,B as Ee,N as he}from"./motionMath-CCTYOCVr.js";class ye{constructor(t){this.markup=t}}const Le={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function Me(e){return String(e).replace(/[&<>"']/g,t=>Le[t]??t)}function we(e){return e instanceof ye?e.markup:Array.isArray(e)?e.map(we).join(""):e==null||e===!1?"":Me(e)}function r(e,...t){let a=e[0]??"";for(let n=0;n<t.length;n+=1)a+=we(t[n])+(e[n+1]??"");return new ye(a)}function X(e,t){e.innerHTML=t.markup}function _e(e,t){if(document.getElementById(e))return;const a=document.createElement("style");a.id=e,a.textContent=t,document.head.append(a)}function A(e){return e===null?"—":e.toLocaleString("en-US")}const Pe=`
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
`,U={domain:"crazycauldron.art",cookMint:"",showMint:!1,treasuryWallet:"",minHold:2e3,social:{x:"none",telegram:"none"},shopEnabled:!1};async function ve(e,t=6e3){const a=new AbortController,n=setTimeout(()=>a.abort(),t);try{const o=await fetch(`${fe.httpUrl}${e}`,{signal:a.signal});return o.ok?await o.json():null}catch{return null}finally{clearTimeout(n)}}async function Ie(){const e=await ve("/public/config");return e?{...U,...e,social:{...U.social,...e.social??{}}}:U}async function Fe(){return ve("/stats",4e3)}function D(e){const t=e.trim();return t===""||t.toLowerCase()==="none"?null:t}function ze(e,t=6){return e.length<=t*2+3?e:`${e.slice(0,t)}…${e.slice(-t)}`}const Ne=[{id:"how-it-works",label:"how it works"},{id:"the-world",label:"the world"},{id:"skills",label:"skills"},{id:"cooking",label:"cooking"},{id:"wardrobe",label:"wardrobe"},{id:"roadmap",label:"roadmap"},{id:"token",label:"$COOK"},{id:"proof",label:"proof"}];function ee(e){const t=e?"":"/";return r`
    <header class="topbar">
      <div class="inner">
        <a class="brand" href="/">Crazy<b>Cauldron</b></a>
        <nav class="topnav">
          ${Ne.map(a=>r`<a href="${t}#${a.id}">${a.label}</a>`)}
          <a href="/whitepaper">whitepaper</a>
        </nav>
        <a class="btn btn-primary" href="/play">Play</a>
      </div>
    </header>
  `}function Re(e){const t=[r`<span><b data-live="playersOnline">${A((e==null?void 0:e.playersOnline)??null)}</b> players online</span>`,r`<span><b data-live="chefsRegistered">${A((e==null?void 0:e.chefsRegistered)??null)}</b> chefs registered</span>`,r`<span><b data-live="dishesCooked">${A((e==null?void 0:e.dishesCooked)??null)}</b> dishes cooked</span>`,r`<span><b data-live="superbsToday">${A((e==null?void 0:e.superbsToday)??null)}</b> superbs today</span>`,r`<span>creator fees fund servers and development</span>`,r`<span>nothing is paid out to holders</span>`,r`<span>not financial advice</span>`];return r`
    <div class="ticker" aria-hidden="true">
      <div class="ticker-track" id="ticker-track">${t}${t}</div>
    </div>
  `}function te(e){const t=D(e.social.x),a=D(e.social.telegram);return r`
    <footer class="foot band-plain">
      <div class="inner">
        <div class="foot-links">
          <a href="/play">Play</a>
          <a href="/whitepaper">Whitepaper</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/official">Official links</a>
          <a href="/rules">Rules</a>
          ${t?r`<a href="https://x.com/${t}" rel="noopener">X</a>`:""}
          ${a?r`<a href="https://t.me/${a}" rel="noopener">Telegram</a>`:""}
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
  `}function E(e){const t=e.painting?r`<img
        class="band-art"
        src="/assets/site/${e.painting}-wide.jpg"
        srcset="/assets/site/${e.painting}-narrow.jpg 720w, /assets/site/${e.painting}-wide.jpg 1440w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        loading="${e.eager?"eager":"lazy"}"
        decoding="async"
      />`:"";return r`
    <section class="band ${e.painting?"":"band-plain"}" id="${e.id}">
      ${t}
      <div class="inner">
        <div class="label">${e.label}</div>
        ${e.body}
      </div>
    </section>
  `}function Ke(){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const e=Array.from(document.querySelectorAll(".band-art"));if(e.length===0)return;let t=!1;const a=()=>{t=!1;const o=window.innerHeight/2;for(const l of e){const m=l.parentElement;if(!m)continue;const d=m.getBoundingClientRect();if(d.bottom<-200||d.top>window.innerHeight+200)continue;const c=d.top+d.height/2,w=Math.max(-60,Math.min(60,(c-o)/o*-48));l.style.transform=`translate3d(0, ${w.toFixed(1)}px, 0)`}},n=()=>{t||(t=!0,requestAnimationFrame(a))};window.addEventListener("scroll",n,{passive:!0}),window.addEventListener("resize",n,{passive:!0}),a()}function He(e){for(const t of Array.from(e.querySelectorAll("[data-copy]")))t.addEventListener("click",()=>{var o;const a=t.dataset.copy??"",n=t.textContent??"Copy";(o=navigator.clipboard)==null||o.writeText(a).then(()=>{t.textContent="Copied",setTimeout(()=>t.textContent=n,1600)}).catch(()=>{t.textContent="Press ⌘C",setTimeout(()=>t.textContent=n,2200)})})}const We=s.skills.maxLevel;function qe(e,t){const a=t[e],n=new Set(s.unlocks[e].map(l=>l.level));let o=0;for(let l=2;l<=a;l+=1)n.has(l)||(o+=s.skills.coreStat[e].perLevelPct);return o}function ke(e,t){const{windowPctAtLevel1:a,windowPctAtLevel20:n}=s.cooking,o=We-1,l=Math.min(Math.max(e.firecraft-1,0),o)/o,m=a+(n-a)*l,d=s.economy.pan.find(f=>f.tier===t),c=m+((d==null?void 0:d.windowBonusPct)??0),w=1+qe("knifework",e)/100;return Math.min(c*w,100)}const ae=45,ne=90;function $e(e,t){const a=Math.min(Math.max(e,0),ae),n=Math.min(Math.max(e*s.cooking.fineWindowMultiplier,a),ne),o=a/200,l=n/200,m=d=>Math.min(Math.max(d,0),1);return{centre:t,superbPct:a,finePct:n,superbFrom:m(t-o),superbTo:m(t+o),fineFrom:m(t-l),fineTo:m(t+l)}}const Be=[{id:"bronze",minHold:5e3},{id:"silver",minHold:2e4},{id:"gold",minHold:1e5}],je=[{id:"hat_01_chef",kind:"hat",name:"Chef toque",unlock:{type:"cookQuality",minQuality:"fine"}},{id:"hat_02_straw",kind:"hat",name:"Straw hat",unlock:{type:"skillLevel",skill:"foraging",level:10}},{id:"hat_03_mushroom",kind:"hat",name:"Mushroom cap",unlock:{type:"dishesCooked",count:50}},{id:"hat_04_acorn",kind:"hat",name:"Acorn cap",unlock:{type:"sectionRecipes",section:2}},{id:"hat_05_circlet",kind:"hat",name:"Circlet",unlock:{type:"anySkillLevel",level:20}},{id:"hat_06_dragonscale",kind:"hat",name:"Dragonscale hat",unlock:{type:"recipeQuality",recipeNumber:20,quality:"superb"}},{id:"hat_07_moonpetal",kind:"hat",name:"Moonpetal crown",unlock:{type:"recipeQuality",recipeNumber:19,quality:"superb"}},{id:"hat_08_bronze",kind:"hat",name:"Bronze toque",unlock:{type:"tier",tier:"bronze"}},{id:"hat_09_gold",kind:"hat",name:"Gold toque",unlock:{type:"tier",tier:"gold"}},{id:"companion_01_hen",kind:"companion",name:"Hen",unlock:{type:"start"}},{id:"companion_02_piglet",kind:"companion",name:"Piglet",unlock:{type:"chefLevel",level:5}},{id:"companion_03_berrymouse",kind:"companion",name:"Berrymouse",unlock:{type:"chefLevel",level:10}},{id:"companion_04_mole",kind:"companion",name:"Mole",unlock:{type:"skillLevel",skill:"prospecting",level:10}},{id:"companion_05_owlet",kind:"companion",name:"Owlet",unlock:{type:"chefLevel",level:20}},{id:"companion_06_glowslime",kind:"companion",name:"Glowslime",unlock:{type:"tier",tier:"silver"}},{id:"companion_07_emberfox",kind:"companion",name:"Emberfox",unlock:{type:"tier",tier:"gold"}}],De={tiers:Be,items:je},xe=De,z=xe.items,oe=xe.tiers;function Ge(e){var t;return((t=oe.find(a=>a.id===e))==null?void 0:t.minHold)??0}function Ce(e){switch(e.type){case"start":return"Yours from the start";case"chefLevel":return`Reach Chef Level ${e.level}`;case"skillLevel":return`Reach ${e.skill} ${e.level}`;case"anySkillLevel":return`Take any skill to ${e.level}`;case"dishesCooked":return`Cook ${e.count} dishes`;case"cookQuality":return`Cook any dish at ${e.minQuality} or better`;case"sectionRecipes":return"Cook every Deep Forest recipe at least once";case"recipeQuality":{const t=N[e.recipeNumber-1];return`Cook ${(t==null?void 0:t.name)??`recipe ${e.recipeNumber}`} at ${e.quality}`}case"tier":return`Hold ${Ge(e.tier).toLocaleString()} $COOK`;default:return"Locked"}}const C="/assets/generated",g={painting(e,t=!1){return`/assets/site/${e}-${t?"narrow":"wide"}.jpg`},paintingSrcset(e){return`${g.painting(e,!0)} 720w, ${g.painting(e,!1)} 1440w`},hat:e=>`${C}/hats/${e}.png`,companion:e=>`${C}/companions/${e}.png`,dish:e=>`${C}/dishes/${e}.png`,ingredient:e=>`${C}/ingredients/${e}.png`,prop:e=>`${C}/props/${e}.png`,node:e=>`${C}/nodes/${e}.png`,character:e=>`${C}/characters/${e}.png`,async hatOffsets(){try{const e=await fetch(`${C}/offsets.json`);if(!e.ok)return{};const t=await e.json(),a={};for(const[n,o]of Object.entries(t.hats??{}))o.down&&(a[n]=o.down);return a}catch{return{}}}};function Xe(e){return new Promise(t=>{const a=new Image;a.decoding="async",a.onload=()=>t(a),a.onerror=()=>t(null),a.src=e})}async function me(e){var c,w,f,$;const[t,a,n]=await Promise.all([Xe(g.character(e)),fetch(`${C}/characters/${e}.json`).then(b=>b.ok?b.json():null).catch(()=>null),fetch(`${C}/manifest.json`).then(b=>b.ok?b.json():null).catch(()=>null)]);if(!t||!a)return null;const o=new Map(a.frames.map(b=>[b.filename,b.frame])),m=((($=(f=(w=(c=n==null?void 0:n.bodies)==null?void 0:c[e])==null?void 0:w.walk)==null?void 0:f.right)==null?void 0:$.order)??[0,1,2,3]).map(b=>o.get(`${e}_walk_right_${b}`)).filter(b=>b!==void 0),d=m[0]??o.get(`${e}_idle_down`);return!d||m.length===0?null:{sheet:t,walkRight:m,frameWidth:d.w,frameHeight:d.h}}const Ue={1:"map_meadows",2:"map_forest",3:"map_caves"};function Qe(e){const t=F.filter(a=>a.section===e);return r`
    <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 0.35rem">
      ${t.map(a=>r`
          <div class="sprite-tile" title="${a.name}">
            <img
              class="sprite"
              src="${g.ingredient(a.id)}"
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
  `}function Je(e){if(e<=1)return"from the first minute";const t=s.chef.targetHours[String(e)];return t===void 0?`at Chef Level ${e}`:`about ${t} hours in`}function Ye(e){const t=Ue[e.index];return r`
    <article class="card">
      ${t?r`<img
            class="sprite"
            style="width: 100%; height: 7rem; object-fit: cover; border-radius: 6px; image-rendering: auto; margin-bottom: 0.7rem"
            src="${g.painting(t,!0)}"
            alt="${e.name}"
            loading="lazy"
            decoding="async"
          />`:""}
      <h3 style="color: ${e.accentColor}">${e.name}</h3>
      <p class="small mono muted">
        ${e.unlockChefLevel<=1?"Open from the start":`Chef Level ${e.unlockChefLevel}`}
        · ${Je(e.unlockChefLevel)}
      </p>
      ${Qe(e.index)}
    </article>
  `}function Ve(e){const t=[{title:`Hold ${e.minHold.toLocaleString()} $COOK`,body:`The door opens at ${e.minHold.toLocaleString()} $COOK in your wallet. It is checked when you sign in and every half hour while you play, and nothing is ever taken from your wallet to enter.`},{title:"Connect Phantom and sign in",body:"One signature, which is free and is not a transaction: it proves the wallet is yours and does nothing else. No approvals, no spend permissions, no gas."},{title:"Gather, cook, sell, level up",body:"Forage the meadows, time the heat bar, sell what you cook to the Tavern, and put the coins into a better pan so the next dish is easier."}],a=[{title:"Expedition",art:g.node("node_berry"),body:"Pick a biome and fill the bag."},{title:"Kitchen",art:g.prop("kitchen"),body:"Prep, then time the heat."},{title:"Tavern",art:g.prop("tavern"),body:"Sell the dish. Eat one yourself."},{title:"Deeper",art:g.prop("portal_forest"),body:"Chef Levels open the next biome."}];return E({id:"how-it-works",painting:"map_hub",label:"how-it-works.txt",eager:!0,body:r`
      <h2>Three steps in, and then a loop</h2>
      <ol class="steps">
        ${t.map(n=>r`
            <li>
              <h3>${n.title}</h3>
              <p class="small muted">${n.body}</p>
            </li>
          `)}
      </ol>

      <div class="loop" style="margin-top: 2rem">
        ${a.map((n,o)=>r`
            ${o>0?r`<div class="loop-arrow">→</div>`:""}
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
    `})}function Ze(){return E({id:"the-world",painting:"map_meadows",label:"the-world.txt",body:r`
      <h2>One village, three biomes</h2>
      <p class="lead">
        Floor 1 is a painted village with a Kitchen, a Tavern, an Outfitter and the
        cauldron, and three ways out of it. Each biome grows eight ingredients of its
        own, and each opens at a Chef Level rather than a paywall.
      </p>
      <div class="grid cols-3">${M.map(Ye)}</div>
      <p class="small muted" style="margin-top: 0.9rem">
        ${F.length} ingredients in all. Two of them — moonpetal and dragon's
        breath chili — are rare, and never more than
        ${s.gathering.maxRareNodesPerSection} nodes of them exist in a biome at a
        time.
      </p>
    `})}const et={foraging:"Plants, mushrooms and honey. Levels open the next biome's plant life, reveal rare nodes on the minimap, and add carry slots.",prospecting:"Salt, clay, iron and crystal. Levels open the next biome's minerals and add a chance of a double drop, mineral by mineral.",knifework:"The prep step. Levels add ingredient slots — two at the start, six by the end — and improve the quality prep can reach.",firecraft:"The heat. Every technique is a Firecraft unlock, the timing window widens with every level, and two- then three-pot cooking arrive at 8 and 16.",spicecraft:"Seasoning, and the dangerous ingredients. Levels make nightshade pepper and dragon's breath chili safe to handle and add quality-step chances."},tt={foraging:g.node("node_herb"),prospecting:g.node("node_clay"),knifework:g.ingredient("sunwheat"),firecraft:g.prop("prop_campfire"),spicecraft:g.ingredient("nightshade_pepper")};function at(e){return s.unlocks[e].filter(t=>t.kind!=="gatherSpeed").slice(0,5).map(t=>`${t.level} · ${t.label}`)}function nt(e){const t=s.skills.coreStat[e];return r`
    <article class="card">
      <img
        class="sprite"
        src="${tt[e]}"
        alt=""
        loading="lazy"
        decoding="async"
        style="height: 3rem; width: auto; margin-bottom: 0.5rem"
      />
      <h3>${s.skills.names[e]}</h3>
      <p class="small mono muted">
        1–${s.skills.maxLevel} · +${t.perLevelPct}% ${t.label} a level
      </p>
      <p class="small">${et[e]}</p>
      <ul class="small muted mono" style="list-style: none; padding: 0">
        ${at(e).map(a=>r`<li>${a}</li>`)}
      </ul>
      <p class="small muted">At 20: <strong>${s.skills.titles[e]}</strong></p>
    </article>
  `}function G(e){return $e(ke({foraging:1,prospecting:1,knifework:1,firecraft:e,spicecraft:1},0),.5)}function ot(){const e=G(1),t=G(s.skills.maxLevel);return E({id:"skills",painting:"map_forest",label:"skills.txt",body:r`
      <h2>Five skills, and one Chef Level over the top of them</h2>
      <p class="lead">
        Every skill runs 1 to ${s.skills.maxLevel} on its own track. Chef Level is
        the one that everything feeds: it runs 1 to ${s.chef.maxLevel}, it is what
        opens the next biome, and it is what the leaderboard sorts on.
      </p>

      <div class="grid cols-3">${be.map(nt)}</div>

      <div class="card card-warm" style="margin-top: 1.4rem">
        <h3>The window grows with Firecraft</h3>
        <p class="small">
          The Superb band is <strong>${e.superbPct.toFixed(1)}%</strong> of the bar at
          Firecraft 1 and <strong>${t.superbPct.toFixed(1)}%</strong> at
          ${s.skills.maxLevel} — wider again with a better pan and with Knifework
          behind it, and capped at ${ae}% so there is always a bar
          left to miss. Fine is ${s.cooking.fineWindowMultiplier} times as wide,
          capped at ${ne}%.
        </p>
        ${rt()}
      </div>
    `})}function rt(){return r`
    <div class="heat" id="heat-demo">
      <div class="filters" role="group" aria-label="Firecraft level">
        ${[1,10,s.skills.maxLevel].map(e=>r`
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
  `}function it(){const e=document.getElementById("heat-track"),t=document.getElementById("heat-fine"),a=document.getElementById("heat-superb"),n=document.getElementById("heat-marker"),o=document.getElementById("heat-result"),l=document.getElementById("heat-demo");if(!e||!t||!a||!n||!o||!l)return;let m=1,d=G(m),c=!0,w=!0,f=0;const $=()=>{t.style.left=`${d.fineFrom*100}%`,t.style.width=`${(d.fineTo-d.fineFrom)*100}%`,a.style.left=`${d.superbFrom*100}%`,a.style.width=`${(d.superbTo-d.superbFrom)*100}%`},b=()=>f>=d.superbFrom&&f<=d.superbTo?"Superb":f>=d.fineFrom&&f<=d.fineTo?"Fine":"Common";for(const x of Array.from(l.querySelectorAll("[data-firecraft]")))x.addEventListener("click",()=>{m=Number(x.dataset.firecraft??"1"),d=G(m);for(const O of Array.from(l.querySelectorAll("[data-firecraft]")))O.setAttribute("aria-pressed",String(O===x));c=!0,o.textContent=`Superb is ${d.superbPct.toFixed(1)}% of the bar here.`,$()});const T=l.querySelector("[data-heat-stop]"),R=()=>{c=!c,o.textContent=c?"A demo. Nothing here is scored or saved.":`${b()}. A demo — nothing here is scored or saved.`,T==null||T.setAttribute("aria-pressed",String(!c))};T==null||T.addEventListener("click",R),e.addEventListener("click",R);const I=s.cooking.barMs/s.cooking.markerSpeedMultiplier;let K=performance.now(),H=0;const W=x=>{const O=Math.min(64,x-K);if(K=x,c&&w){H+=O;const _=H%(I*2)/I;f=_<=1?_:2-_,n.style.left=`${f*100}%`}requestAnimationFrame(W)};"IntersectionObserver"in window&&new IntersectionObserver(x=>{for(const O of x)w=O.isIntersecting},{rootMargin:"120px"}).observe(e),$(),requestAnimationFrame(W)}function st(e){var t;return((t=M.find(a=>a.index===e))==null?void 0:t.name)??""}const lt={raw:"Raw",pan_fry:"Pan-fry",simmer:"Simmer",bake:"Bake",clay_bake:"Clay bake",roast:"Roast",smoke:"Smoke",chill:"Chill"};function dt(e){const t=Object.entries(e.requirements).map(([a,n])=>`${s.skills.names[a]} ${n}`);return t.length===0?"No requirements":t.join(" · ")}function ct(e){return r`
    <article class="card recipe" data-biome="${e.section}">
      <img
        class="sprite"
        src="${g.dish(e.id)}"
        alt=""
        width="64"
        height="64"
        loading="lazy"
        decoding="async"
      />
      <div>
        <h3>${e.name}</h3>
        <p class="meta">
          ${st(e.section)} · ${lt[e.technique]??e.technique}
          · ${e.chefXp} XP · ${e.sellCoins} coins
        </p>
        <p class="small" style="margin: 0.3rem 0 0">
          ${e.ingredients.map(t=>`${t.qty}× ${Z(t.id).name}`).join(", ")}
        </p>
        <p class="meta">${dt(e)}</p>
      </div>
    </article>
  `}function ht(){const e=s.cooking.quality;return E({id:"cooking",painting:"map_caves",label:"cooking.txt",body:r`
      <h2>One bar, three outcomes</h2>
      <p class="lead">
        Prep the ingredients, then the heat bar: a marker sweeps back and forth for
        ${(s.cooking.barMs/1e3).toFixed(0)} seconds and you click to stop it.
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

      <h3 style="margin-top: 1.8rem">All ${N.length} recipes</h3>
      <div class="filters" role="group" aria-label="Filter recipes by biome">
        <button class="chip" data-filter="all" aria-pressed="true">All</button>
        ${M.map(t=>r`
            <button class="chip" data-filter="${t.index}" aria-pressed="false">
              ${t.name}
            </button>
          `)}
      </div>
      <div class="recipe-list" id="recipe-list">${N.map(ct)}</div>
    `})}function mt(){const e=document.getElementById("recipe-list");if(!e)return;const t=Array.from(document.querySelectorAll("[data-filter]"));for(const a of t)a.addEventListener("click",()=>{const n=a.dataset.filter??"all";for(const o of t)o.setAttribute("aria-pressed",String(o===a));for(const o of Array.from(e.querySelectorAll(".recipe")))o.hidden=n!=="all"&&o.dataset.biome!==n})}const pt={bronze:"A toque.",silver:"A companion.",gold:"A toque and a companion."};function pe(e){const t=e.kind==="hat"?g.hat(e.id):g.companion(e.id),a=e.unlock.type==="tier"?e.unlock.tier:null;return r`
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
      <p class="meta">${Ce(e.unlock)}</p>
      ${a?r`<span class="tier tier-${a}">${a}</span>`:""}
    </article>
  `}function ut(){const e=z.filter(a=>a.kind==="hat"),t=z.filter(a=>a.kind==="companion");return E({id:"wardrobe",painting:null,label:"wardrobe.txt",body:r`
      <h2>${e.length} hats, ${t.length} companions</h2>
      <p class="lead">
        All of it is cosmetic. Not one hat or companion changes how fast you gather, how
        well you cook, or what you earn — and most of them are earned by playing.
      </p>

      <h3>Hats</h3>
      <div class="gallery">${e.map(pe)}</div>

      <h3 style="margin-top: 1.6rem">Companions</h3>
      <p class="small muted">
        A companion follows a cell behind you and does nothing else at all.
      </p>
      <div class="gallery">${t.map(pe)}</div>

      <h3 style="margin-top: 1.6rem">Holder tiers</h3>
      <p class="small">
        Three of the items above are tied to a balance rather than owned. They are
        cosmetic like everything else here: if the balance falls the item comes off, and
        it returns when the balance recovers.
      </p>
      <div class="grid cols-3">
        ${oe.map(a=>r`
            <div class="card">
              <span class="tier tier-${a.id}">${a.id}</span>
              <h3 style="margin-top: 0.4rem">${a.minHold.toLocaleString()} $COOK</h3>
              <p class="small muted">${pt[a.id]??""} Cosmetic only.</p>
            </div>
          `)}
      </div>
    `})}function gt(e){return!e.showMint||e.cookMint.trim()===""?r`
      <div class="address">
        <code>Revealed at launch</code>
        <span class="small muted">
          There is no $COOK contract address yet. Anyone showing you one is not us.
        </span>
      </div>
    `:r`
    <div class="address">
      <code>${e.cookMint}</code>
      <button class="btn btn-primary" data-copy="${e.cookMint}">Copy</button>
    </div>
  `}function ft(e){const t=e.showMint&&e.cookMint.trim()!=="";return E({id:"token",painting:"map_hub",label:"token.txt",body:r`
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
      ${gt(e)}
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
    `})}function bt(e){const t=D(e.social.x),a=D(e.social.telegram),n=[{label:"Official domain",value:e.domain,href:`https://${e.domain}`},{label:"Contract address",value:e.showMint&&e.cookMint.trim()!==""?e.cookMint:"Revealed at launch",copy:e.showMint&&e.cookMint.trim()!==""?e.cookMint:void 0},{label:"Treasury wallet",value:e.treasuryWallet.trim()===""?"Published at launch":e.treasuryWallet,copy:e.treasuryWallet.trim()===""?void 0:e.treasuryWallet},{label:"X",value:t??"We have no X account",href:t?`https://x.com/${t}`:void 0},{label:"Telegram",value:a??"We have no Telegram",href:a?`https://t.me/${a}`:void 0}];return E({id:"proof",painting:null,label:"proof.txt",body:r`
      <h2>Everything you should check</h2>
      <p class="lead">
        A token project attracts people who register a similar name and publish a
        different address. The defence is a short list at the real domain, so here it is.
        "We have no account there" is a real answer, and a better one than silence.
      </p>

      <div class="grid">
        ${n.map(o=>r`
            <div class="address">
              <span class="small muted mono" style="flex: 0 0 9rem">${o.label}</span>
              ${o.href?r`<code><a href="${o.href}" rel="noopener">${o.value}</a></code>`:r`<code title="${o.value}">${o.value.length>48?ze(o.value,14):o.value}</code>`}
              ${o.copy?r`<button class="btn" data-copy="${o.copy}">Copy</button>`:""}
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
    `})}const yt=[{id:"floor-1",name:"Floor 1 — The Village",status:"live",chefLevels:"Chef 1 to 30",town:"The village, with the Kitchen, the Tavern, the Outfitter and the cauldron.",painting:"map_hub",biomes:["Meadows","The Deep Forest","Mystical Caves"],brings:["24 ingredients and 20 recipes","Five skills: Foraging, Prospecting, Knifework, Firecraft, Spicecraft","Nine hats and seven companions","The heat bar, pan and bag tiers, and the leaderboard"]},{id:"floor-2",name:"Floor 2 — The Coast",status:"next",chefLevels:"Chef 30 to 60",town:"A harbour town, with its own kitchen.",painting:"map_meadows",biomes:["Tidepools","The Salt Marsh","The Sunken Reef"],brings:["Seafood and sea-plant ingredients","20 new recipes","A sixth skill: Fishing","Two new techniques: Fermenting and Grilling"]},{id:"floor-3",name:"Floor 3 — The Peaks",status:"later",chefLevels:"Chef 60 to 90",town:"A mountain monastery.",painting:"map_caves",biomes:["Alpine Meadows","The Frozen Forest","The Sky Caves"],brings:["Highland ingredients","20 new recipes","A seventh skill: Hunting","Two new techniques: Smoking and Preserving","The Grand Feast"]}],wt=[{name:"Cook-off",detail:"Two chefs, the same recipe, sixty seconds. Best score takes it."},{name:"Ingredient Rush",detail:"A timed race to gather what a dish needs and get it cooked."},{name:"Cauldron Duel",detail:"Your cooked dishes are a deck; their buffs play against each other."},{name:"Weekly Chef's Challenge",detail:"One set dish, one week, one board."}],vt=["Seasonal hats and companions","Cloaks return with the art overhaul","Camp decorations","Villager quests, with stories rather than fetch lists","Hidden recipes and secret spots","Seasons, each with a technique, a limited cosmetic and a leaderboard reset"],kt=["More room for players","Smoother updates","An art overhaul: characters redrawn with full outfits, to match the painted world","Seasons"],$t=["Legendary dishes and mastery","Feasts","More $COOK cosmetics, half of every purchase burned","Holder tiers","Paid upgrades, in coins or $COOK","A player market — with a treasury fee and anti-bot rules in place first"],xt={live:"live",next:"next",later:"planned"};function Ct(e){return r`
    <article class="card floor" id="${e.id}">
      ${e.painting?r`<img
            class="floor-art"
            src="${g.painting(e.painting,!0)}"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />`:""}
      <div class="floor-head">
        <h3>${e.name}</h3>
        <span class="badge badge-${e.status}">${xt[e.status]}</span>
        <span class="mono muted">${e.chefLevels}</span>
      </div>
      <p class="small">${e.town}</p>
      <p class="small muted mono">${e.biomes.join(" · ")}</p>
      <ul class="small">
        ${e.brings.map(t=>r`<li>${t}</li>`)}
      </ul>
    </article>
  `}function re(){return r`
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

    <div class="timeline">${yt.map(Ct)}</div>

    <h3 style="margin-top: 2rem">Minigames</h3>
    <p class="small muted">
      Opt-in, and the rewards are titles and cosmetics. Nothing in them pays out
      coins, $COOK or anything else, and nothing in them is wagered.
    </p>
    <div class="grid cols-4">
      ${wt.map(e=>r`
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
          ${vt.map(e=>r`<li>${e}</li>`)}
        </ul>
      </div>
      <div class="card">
        <h3>Next, after launch</h3>
        <ul class="small">${kt.map(e=>r`<li>${e}</li>`)}</ul>
      </div>
      <div class="card">
        <h3>Later, if the game grows</h3>
        <ul class="small">${$t.map(e=>r`<li>${e}</li>`)}</ul>
      </div>
    </div>
  `}function Tt(){return E({id:"roadmap",painting:"map_forest",label:"roadmap.txt",body:re()})}function St(e){return r`
    ${ee(!1)}
    <main class="site-wrap">
      <section class="band" id="roadmap">
        <img
          class="band-art"
          src="${g.painting("map_forest",!1)}"
          srcset="${g.paintingSrcset("map_forest")}"
          sizes="100vw"
          alt=""
          aria-hidden="true"
          decoding="async"
        />
        <div class="inner">
          <div class="label">roadmap.txt</div>
          ${re()}
        </div>
      </section>
    </main>
    ${te(e)}
  `}function Ot(e,t){return r`
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
          <span><b data-live="playersOnline">${A((t==null?void 0:t.playersOnline)??null)}</b> playing now</span>
          <span><b data-live="chefsRegistered">${A((t==null?void 0:t.chefsRegistered)??null)}</b> chefs registered</span>
          <span><b data-live="dishesCooked">${A((t==null?void 0:t.dishesCooked)??null)}</b> dishes cooked</span>
        </p>
        <p class="small muted" style="margin-top: 0.7rem">
          Holding ${e.minHold.toLocaleString()} $COOK opens the door. Signing in is
          free and never asks your wallet for a transaction.
        </p>
      </div>
    </section>
  `}function At(e){return r`
    ${Ve(e)} ${Ze()} ${ot()} ${ht()}
    ${ut()} ${Tt()} ${ft(e)} ${bt(e)}
  `}function Et(e,t){return r`
    ${ee(!0)}
    <main class="site-wrap">${Ot(e,t)} ${At(e)}</main>
    ${Re(t)} ${te(e)}
  `}function Lt(e){for(const t of Array.from(document.querySelectorAll("[data-live]"))){const a=t.dataset.live;a&&typeof e[a]=="number"&&(t.textContent=A(e[a]))}}const Q=8e3,S=3;function J(e){return new Promise(t=>{const a=new Image;a.decoding="async",a.onload=()=>t(a),a.onerror=()=>t(null),a.src=e})}function Mt(e){const t=e.getContext("2d",{alpha:!0});if(!t)return()=>{};const a=window.matchMedia("(prefers-reduced-motion: reduce)").matches;let n=0,o=0,l=null,m=[];const d=[];let c=null,w=performance.now()+4e3;const f=[];let $=0,b=!1;function T(){const h=e.getBoundingClientRect(),i=Math.min(window.devicePixelRatio||1,2);n=Math.max(1,Math.round(h.width)),o=Math.max(1,Math.round(h.height)),e.width=Math.round(n*i),e.height=Math.round(o*i),t.setTransform(i,0,0,i,0,0),t.imageSmoothingEnabled=!1,R(),I()}function R(){const h=a?0:Math.min(46,Math.round(n/26));m=Array.from({length:h},(i,p)=>{const u=(p+.5)/h*n+(Math.sin(p*12.9898)*.5+.5)*14,v=Math.sin(p*78.233)*.5+.5;return{x:u,y:o-6-v*Math.min(70,o*.1),height:7+v*9,phase:p*.7,shade:v>.5?"rgba(92, 138, 74, 0.55)":"rgba(63, 107, 70, 0.5)"}})}function I(){const h=o-Math.min(48,o*.07);for(let i=0;i<f.length;i+=1)f[i].y=h-i*6}function K(h){if(!l){t.fillStyle="#14101a",t.fillRect(0,0,n,o);return}const i=Math.max(n/l.width,o/l.height),p=l.width*i,u=l.height*i,v=a?0:ce(h,0,Q*3,n)*9;t.drawImage(l,(n-p)/2+v,(o-u)*.62,p,u)}function H(h){for(const i of m){const p=Oe(h,i.x,i.phase,Q,n);t.save(),t.translate(i.x,i.y),t.rotate(p.angle*Math.PI/180),t.fillStyle=i.shade,t.fillRect(-1,-i.height,2,i.height),t.fillRect(-3,-i.height*.6,2,i.height*.6),t.fillRect(1,-i.height*.75,2,i.height*.75),t.restore()}}function W(h,i){if(!a){if($%22===0)for(const p of[.26,.68])d.push({x:n*p,y:o*.34,age:0,life:5200,drift:0,size:5});for(let p=d.length-1;p>=0;p-=1){const u=d[p];if(u.age+=i,u.age>u.life){d.splice(p,1);continue}const v=u.age/u.life;u.drift+=ce(h,u.x,Q,n)*.35,t.globalAlpha=(1-v)*.22,t.fillStyle="#cfc6bb",t.beginPath(),t.arc(u.x+u.drift,u.y-v*o*.22,u.size+v*16,0,Math.PI*2),t.fill(),t.globalAlpha=1}}}function x(h,i){if(a||(!c&&h>w&&(c={x:-30,y:o*(.18+Math.random()*.14),speed:.045+Math.random()*.02,phase:Math.random()*Math.PI*2}),!c))return;if(c.x+=c.speed*i,c.x>n+30){c=null,w=h+9e3+Math.random()*9e3;return}const p=Math.sin(h/90+c.phase)*4;t.strokeStyle="rgba(24, 20, 30, 0.55)",t.lineWidth=2,t.beginPath(),t.moveTo(c.x-6,c.y+p),t.lineTo(c.x,c.y),t.lineTo(c.x+6,c.y+p),t.stroke()}function O(h){for(const i of f){i.x+=i.speed*h,i.x>n+60&&(i.x=-60-Math.random()*120),i.step+=h;const p=i.body.walkRight,u=p[Math.floor(i.step/100)%p.length],v=u.w*S,q=u.h*S,B=Math.round(i.x),y=Math.round(i.y-q),P=Math.floor(i.step/200)%2===0?0:S;if(t.drawImage(i.body.sheet,u.x,u.y,u.w,u.h,B,y+P,v,q),i.hat&&t.drawImage(i.hat,B+i.hatOffset.x*S,y+P+i.hatOffset.y*S,i.hat.width*S,i.hat.height*S),i.companion){const le=i.companion.width*S,de=i.companion.height*S;t.drawImage(i.companion,Math.round(i.x-le-8),Math.round(i.y-de+P),le,de)}}}let _=performance.now();function ie(h){if(b)return;const i=Math.min(64,h-_);_=h,$+=1,t.clearRect(0,0,n,o),K(h),W(h,i),x(h,i),H(h),O(i),requestAnimationFrame(ie)}const se=()=>T();return window.addEventListener("resize",se,{passive:!0}),T(),requestAnimationFrame(ie),(async()=>{const h=window.innerWidth<900;l=await J(g.painting("map_hub",h));const i=await Promise.all([me("male"),me("female")]),p=["hat_01_chef","hat_05_circlet","hat_03_mushroom","hat_07_moonpetal"],u=["companion_01_hen","companion_07_emberfox","companion_02_piglet",null],[v,q,B]=await Promise.all([Promise.all(p.map(y=>J(g.hat(y)))),Promise.all(u.map(y=>y?J(g.companion(y)):Promise.resolve(null))),g.hatOffsets()]);for(let y=0;y<p.length;y+=1){const P=i[y%2];P&&f.push({x:-80-y*150,y:o,speed:.022+y*.004,body:P,hat:v[y]??null,hatOffset:B[p[y]??""]??{x:6,y:-12},companion:q[y]??null,step:y*340})}I()})(),()=>{b=!0,window.removeEventListener("resize",se)}}const Y=e=>Math.round(e/6e4);function V(e,t=1,a=0){return $e(ke({foraging:1,prospecting:1,knifework:t,firecraft:e,spicecraft:1},a),.5)}const _t={raw:"Raw",pan_fry:"Pan-fry",simmer:"Simmer",bake:"Bake",clay_bake:"Clay bake",roast:"Roast",smoke:"Smoke",chill:"Chill"};function ue(e){var t;return((t=M.find(a=>a.index===e))==null?void 0:t.name)??""}function Pt(e){return[{id:"what-it-is",title:"1. What CrazyCauldron is",body:()=>r`
        <p>
          CrazyCauldron is a cozy fantasy cooking MMO that runs in a browser tab. You
          forage and mine three biomes, bring what you find back to a village kitchen,
          time a heat bar to cook it, and sell the result to the Tavern. Everyone plays
          in the same world at the same time, in hub rooms of thirty.
        </p>
        <p>
          Getting in requires holding $COOK. That is the token's job, and close to all
          of it: it is a key, not a currency you spend to play and not a stake that
          earns.
        </p>
        <h3>Three things this is not</h3>
        <ul>
          <li>
            <strong>No wagering.</strong> Nothing in the game is staked, risked or bet.
            There is no loot box, no paid roll and no chance-based purchase.
          </li>
          <li>
            <strong>No cash prizes.</strong> Nothing pays out money. Coins are earned by
            playing and exist only inside the game; they are not a token, they do not
            leave it, and they cannot be sold.
          </li>
          <li>
            <strong>No pay-to-win.</strong> Cooking skill is the only source of power.
            No amount of $COOK widens a timing window, speeds a gather or raises a
            dish's value. What $COOK can be spent on, when the shop is switched on, is
            cosmetics that are also earnable by playing.
          </li>
        </ul>
      `},{id:"getting-in",title:"2. Getting in",body:()=>r`
        <h3>The hold check</h3>
        <p>
          You need ${e.minHold.toLocaleString()} $COOK in the wallet you sign in
          with. The balance is read from the chain when you sign in and cached for
          ${Y(Ee)} minutes; the room re-checks every holder on
          that same interval, so a balance that falls below the line is noticed within
          half an hour rather than at the next login.
        </p>
        <p>
          Nothing is taken from your wallet. There is no deposit, no approval, no spend
          permission and no gas: the check is a read of a public balance.
        </p>

        <h3>Sign-In With Solana</h3>
        <p>
          Signing in is one wallet signature over a message that names this domain and
          carries a single-use nonce. It is not a transaction. The nonce is good for
          ${Y(he)} minutes and is consumed on use, so a captured
          signature cannot be replayed. What you get back is a session token that lasts
          ${Ae/3600} hour.
        </p>

        <h3>One server, many rooms</h3>
        <p>
          The world is one deployment. Players are placed in hub rooms of 30; when the
          newest hub fills, another is created. Above 300 concurrent players the next
          arrival is parked in a waiting room and promoted when a seat frees, rather
          than being turned away.
        </p>
        <p>
          Gather nodes are per-player. Two people standing at the same bush are not
          competing for it, and a popular server does not mean an empty map.
        </p>
      `},{id:"the-world",title:"3. The world",body:()=>r`
        <p>
          Floor 1 is the Village: a painted hub with the Kitchen, the Tavern, the
          Outfitter and the cauldron, and three gates out of it. Each biome opens at a
          Chef Level rather than a purchase.
        </p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Biome</th><th class="num">Opens at</th><th>Ingredients</th></tr>
            </thead>
            <tbody>
              ${M.map(t=>r`
                  <tr>
                    <td>${t.name}</td>
                    <td class="num">
                      ${t.unlockChefLevel<=1?"Start":`Chef ${t.unlockChefLevel}`}
                    </td>
                    <td class="small">
                      ${F.filter(a=>a.section===t.index).length}
                    </td>
                  </tr>
                `)}
            </tbody>
          </table>
        </div>

        <h3>All ${F.length} ingredients</h3>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ingredient</th><th>Biome</th><th>Skill</th><th>Rarity</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${F.map(t=>r`
                  <tr>
                    <td>${t.name}</td>
                    <td class="small">${ue(t.section)}</td>
                    <td class="small">${s.skills.names[t.skill]}</td>
                    <td class="small">${t.rarity}</td>
                    <td class="small muted">${t.note??(t.edible?"":"Not edible")}</td>
                  </tr>
                `)}
            </tbody>
          </table>
        </div>

        <h3>Rare nodes</h3>
        <p>
          Moonpetal and dragon's breath chili are rare. At most
          ${s.gathering.maxRareNodesPerSection} rare nodes exist in a biome at a
          time, and they are invisible until Foraging is high enough to see them — 14
          for moonpetal, 17 for the chili. A rare node takes
          ${s.gathering.respawnMs.rare/6e4} minutes to come back; a common one
          takes ${s.gathering.respawnMs.common/6e4}.
        </p>
      `},{id:"skills",title:"4. Skills",body:()=>r`
        <p>
          Five skills, each 1 to ${s.skills.maxLevel}, each on its own XP track.
          Two are gathering skills and three are kitchen skills. XP per level grows by
          about ${Math.round((s.skills.growth-1)*100)}% a level, so level 20 is
          a long way from level 10 without being a wall.
        </p>
        <p>
          Every skill also carries a core stat that improves
          ${s.skills.coreStat.foraging.perLevelPct}% per level, every level,
          whether or not that level came with an unlock — so no level is a dead one.
        </p>

        ${be.map(t=>r`
            <h3>${s.skills.names[t]}</h3>
            <p class="small muted">
              Core stat: +${s.skills.coreStat[t].perLevelPct}%
              ${s.skills.coreStat[t].label} per level. At 20:
              <strong>${s.skills.titles[t]}</strong>.
            </p>
            <div class="table-scroll">
              <table>
                <thead><tr><th class="num">Level</th><th>Unlock</th></tr></thead>
                <tbody>
                  ${s.unlocks[t].map(a=>r`
                      <tr>
                        <td class="num">${a.level}</td>
                        <td class="small">
                          ${a.label}${a.requires?` (also needs ${Object.entries(a.requires).map(([n,o])=>`${s.skills.names[n]} ${o}`).join(", ")})`:""}
                        </td>
                      </tr>
                    `)}
                </tbody>
              </table>
            </div>
          `)}
      `},{id:"chef-level",title:"5. Chef Level",body:()=>{var t,a;return r`
        <p>
          Chef Level is one track fed by everything: gathering, prepping, cooking and
          selling all pay into it. It runs 1 to ${s.chef.maxLevel}.
        </p>
        <p>
          It is what gates the world. The Deep Forest opens at Chef
          ${((t=M[1])==null?void 0:t.unlockChefLevel)??10} and the Mystical Caves at Chef
          ${((a=M[2])==null?void 0:a.unlockChefLevel)??20}.
        </p>
        <div class="table-scroll">
          <table>
            <thead><tr><th class="num">Chef Level</th><th class="num">Target hours</th></tr></thead>
            <tbody>
              ${Object.entries(s.chef.targetHours).map(([n,o])=>r`
                  <tr><td class="num">${n}</td><td class="num">${o}</td></tr>
                `)}
            </tbody>
          </table>
        </div>
        <p class="small muted">
          Targets, not guarantees: they are what the XP curve is tuned against for a
          player who is neither rushing nor idling.
        </p>
        <p>
          The leaderboard sorts on Chef XP and shows the titles a player has earned. It
          names wallets, which are already public in the room; it does not show coins,
          inventories or balances.
        </p>
      `}},{id:"cooking",title:"6. Cooking",body:()=>{const t=V(1),a=V(s.skills.maxLevel),n=V(s.skills.maxLevel,s.skills.maxLevel,2);return r`
          <h3>The heat bar</h3>
          <p>
            A marker sweeps back and forth across the bar for
            ${s.cooking.barMs/1e3} seconds and you click to stop it. Two bands
            are drawn on the bar: a narrow Superb band inside a wider Fine one. Stop
            inside Superb for Superb, inside Fine for Fine, anywhere else for Common.
            Running out of time is a Common dish, not a failure — you never lose the
            ingredients to the clock.
          </p>
          <p>
            The Superb band is <strong>${t.superbPct.toFixed(1)}%</strong> of the bar
            at Firecraft 1 and <strong>${a.superbPct.toFixed(1)}%</strong> at
            Firecraft ${s.skills.maxLevel}. A better pan adds flat percentage
            points and Knifework scales the result, so a fully equipped
            level-${s.skills.maxLevel} chef reaches
            ${n.superbPct.toFixed(1)}%. Both bands are clamped — Superb at
            ${ae}% of the bar and Fine at ${ne}% —
            so there is always bar left to miss, and the client draws exactly the bands
            the server scores against.
          </p>

          <h3>What that means in practice</h3>
          <p>
            Simulated against a player with 60 ms of reaction error, which is about
            8.6% of the bar:
          </p>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th class="num">Firecraft</th><th class="num">Superb</th>
                  <th class="num">Fine</th><th class="num">Common</th>
                </tr>
              </thead>
              <tbody>
                <tr><td class="num">1</td><td class="num">15%</td><td class="num">40%</td><td class="num">45%</td></tr>
                <tr><td class="num">10</td><td class="num">46%</td><td class="num">52%</td><td class="num">2%</td></tr>
                <tr><td class="num">20</td><td class="num">72%</td><td class="num">28%</td><td class="num">0%</td></tr>
              </tbody>
            </table>
          </div>
          <p class="small muted">
            Numbers from scripts/test-cooking.ts, which re-runs this simulation on every
            change so the curve cannot drift without somebody noticing.
          </p>

          <h3>Quality</h3>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Quality</th><th class="num">XP</th><th class="num">Coins</th></tr></thead>
              <tbody>
                ${["common","fine","superb"].map(o=>r`
                    <tr>
                      <td>${o[0].toUpperCase()}${o.slice(1)}</td>
                      <td class="num">×${s.cooking.quality[o].xp}</td>
                      <td class="num">×${s.cooking.quality[o].coins}</td>
                    </tr>
                  `)}
              </tbody>
            </table>
          </div>

          <h3>Prep, and more than one pot</h3>
          <p>
            Before the heat there is a prep step of
            ${s.cooking.prepMs/1e3} seconds. Knifework decides how many
            ingredient slots a dish may use — 2 at level 1, rising to 6 at 17 — and how
            good prep can be: Fine prep at 4, Superb prep at 9. Auto-prep arrives at
            Knifework 15 for Meadows recipes and 18 for Deep Forest ones, so the
            recipes you have cooked a hundred times stop asking.
          </p>
          <p>
            Firecraft 8 unlocks two-pot cooking and Firecraft 16 unlocks three, which is
            where a kitchen session stops being one dish at a time.
          </p>

          <h3>All ${N.length} recipes</h3>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Recipe</th><th>Biome</th><th>Technique</th>
                  <th class="num">XP</th><th class="num">Coins</th>
                  <th>Ingredients</th><th>Requires</th>
                </tr>
              </thead>
              <tbody>
                ${N.map(o=>r`
                    <tr>
                      <td>${o.name}</td>
                      <td class="small">${ue(o.section)}</td>
                      <td class="small">
                        ${_t[o.technique]??o.technique}
                      </td>
                      <td class="num">${o.chefXp}</td>
                      <td class="num">${o.sellCoins}</td>
                      <td class="small">
                        ${o.ingredients.map(l=>`${l.qty}× ${Z(l.id).name}`).join(", ")}
                      </td>
                      <td class="small muted">
                        ${Object.entries(o.requirements).map(([l,m])=>`${s.skills.names[l]} ${m}`).join(", ")||"—"}
                      </td>
                    </tr>
                  `)}
              </tbody>
            </table>
          </div>
        `}},{id:"economy",title:"7. Economy",body:()=>r`
        <p>
          <strong>Coins are off-chain and stay off-chain.</strong> They are a number in
          the game's database. They are not a token, they cannot be withdrawn, sold or
          transferred, and the game never emits $COOK — not as a reward, not as a drop,
          not at all.
        </p>
        <p>
          The Tavern buys dishes at the recipe's price multiplied by its quality: a
          Superb dish is worth ${s.cooking.quality.superb.coins} times a Common
          one. Eating a dish yourself gives the ${s.economy.buff.label} buff:
          +${s.economy.buff.gatherSpeedPct}% gathering speed for
          ${s.economy.buff.durationMs/6e4} minutes.
        </p>

        <h3>Pans</h3>
        <p>Every pan tier widens the timing window by flat percentage points.</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Pan</th><th class="num">Coins</th><th class="num">Window</th><th>Also needs</th></tr>
            </thead>
            <tbody>
              ${s.economy.pan.map(t=>r`
                  <tr>
                    <td>${t.name}</td>
                    <td class="num">${t.coins===0?"—":t.coins}</td>
                    <td class="num">+${t.windowBonusPct}%</td>
                    <td class="small muted">
                      ${t.items.map(a=>`${a.qty}× ${Z(a.id).name}`).join(", ")||"—"}
                    </td>
                  </tr>
                `)}
            </tbody>
          </table>
        </div>

        <h3>Bags</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Bag</th><th class="num">Coins</th><th class="num">Extra slots</th></tr></thead>
            <tbody>
              ${s.economy.bag.map(t=>r`
                  <tr>
                    <td>${t.name}</td>
                    <td class="num">${t.coins===0?"—":t.coins}</td>
                    <td class="num">${t.slots===0?"—":`+${t.slots}`}</td>
                  </tr>
                `)}
            </tbody>
          </table>
        </div>
        <p class="small muted">
          Both are bought with coins earned by playing. Neither is sold for $COOK.
        </p>
      `},{id:"cosmetics",title:"8. Cosmetics",body:()=>{const t=z.filter(n=>n.kind==="hat"),a=z.filter(n=>n.kind==="companion");return r`
          <p>
            ${t.length} hats and ${a.length} companions. All of them are
            cosmetic: not one changes a gather speed, a timing window, a dish's value or
            anything else that could be called power.
          </p>
          <div class="table-scroll">
            <table>
              <thead><tr><th>Item</th><th>Kind</th><th>How it is earned</th></tr></thead>
              <tbody>
                ${z.map(n=>r`
                    <tr>
                      <td>${n.name}</td>
                      <td class="small">${n.kind}</td>
                      <td class="small">${Ce(n.unlock)}</td>
                    </tr>
                  `)}
              </tbody>
            </table>
          </div>

          <h3>Holder tiers</h3>
          <p>
            Three of those items follow a balance rather than being owned outright. If
            the balance falls the item comes off and returns when it recovers. They are
            cosmetic like the rest.
          </p>
          <ul>
            ${oe.map(n=>r`<li>${n.id}: ${n.minHold.toLocaleString()} $COOK</li>`)}
          </ul>

          <h3>The $COOK shop, which is switched off</h3>
          <p>
            A cosmetics shop that takes $COOK is built and dormant: every one of its
            endpoints answers 404 while the switch is off, and it ships off. When it is
            turned on, a purchase burns half the tokens and sends half to the project
            treasury. Nothing in it is purchase-only — everything it sells is also
            earnable by playing — and there is no random purchase of any kind.
          </p>
          <p>
            Cosmetics belong to the wallet, not to you. They are not tradable and cannot
            be moved to another wallet.
          </p>
        `}},{id:"token",title:"9. The token",body:()=>r`
        <h3>What holding does</h3>
        <ul>
          <li>
            <strong>Entry.</strong> ${e.minHold.toLocaleString()} $COOK in the
            wallet you sign in with opens the hub.
          </li>
          <li>
            <strong>Cosmetics.</strong> Three wardrobe items follow a balance, and the
            dormant shop above takes $COOK when it is turned on.
          </li>
          <li>
            <strong>Seasonal votes.</strong> Planned, not live: holders vote on what a
            season brings.
          </li>
        </ul>

        <h3>Where the fees go</h3>
        <p>
          Trading $COOK generates standard pump.fun creator fees. Those fees are
          received by the team at the project treasury wallet and are used to run the
          servers and build the game.
        </p>
        <p>
          <strong>Nothing is paid out to holders by the game.</strong> Holding $COOK is
          not a claim on those fees or on any other payment, and there is no
          distribution, revenue share or payout attached to it.
        </p>

        <h3>Addresses</h3>
        <p>
          Contract:
          <code>${e.showMint&&e.cookMint?e.cookMint:"revealed at launch"}</code>
        </p>
        <p>
          Treasury:
          <code>${e.treasuryWallet||"published at launch"}</code>
        </p>
        <p>
          Both are served by this deployment at request time rather than written into
          the page, so the address shown is the address the running server gates on.
          The only official domain is ${e.domain}.
        </p>

        <h3>How to buy</h3>
        <ol>
          <li>Get SOL into a Solana wallet — Phantom is the one most people have.</li>
          <li>Open pump.fun or Jupiter, paste the contract address above, and swap.</li>
          <li>Keep ${e.minHold.toLocaleString()} $COOK in that wallet and sign in.</li>
        </ol>
      `},{id:"fair-play",title:"10. Fair play and safety",body:()=>r`
        <h3>The server decides</h3>
        <p>
          Every action that changes anything is decided on the server. The client asks
          to move, gather, cook or sell; the server checks whether that is possible from
          where the player actually is, with what they actually have, and answers. A
          modified client can ask for anything and gets the same answers.
        </p>
        <p>
          Gather nodes have per-player cooldowns that are persisted, so relogging cannot
          reset them. Cooking is judged against the same window the client was shown.
          Movement is path-checked against the map.
        </p>

        <h3>Rate limits</h3>
        <p>
          Sign-in is rate limited per IP. In-game actions are limited per player and per
          action, and a client that floods is throttled rather than disconnected, so a
          bad connection is not treated as an attack.
        </p>

        <h3>Sign-in is replay-safe</h3>
        <p>
          Each sign-in message carries a single-use nonce that expires after
          ${Y(he)} minutes and is consumed when used. A captured
          signature cannot be replayed, a signature from the wrong wallet is refused,
          and a message edited after signing fails verification.
        </p>

        <h3>Backups and the switch</h3>
        <p>
          The database is backed up nightly, and the backups are copied off the machine
          that made them. There is a maintenance switch that closes the door with a
          message while the health endpoint stays up — so a problem can be stopped
          without anyone losing what they were doing.
        </p>

        <h3>What we log</h3>
        <p>
          Wallet addresses, what actions were taken and when, and server health. Wallets
          are public by nature and are already visible in the room. We do not ask for or
          store an email address, a name or any other personal detail — there is no
          account to create.
        </p>
      `},{id:"roadmap",title:"11. Roadmap",body:()=>re()},{id:"risks",title:"12. Risks and disclaimer",body:()=>r`
        <div class="warn">
          <p>
            <strong>$COOK is a community token.</strong> It is not a share, not an
            investment, and not a claim on anything we own or earn.
          </p>
          <p>
            We make no promise about its price, and no promise of rewards, income,
            airdrops or returns of any kind. Nothing on this site is financial advice.
          </p>
          <p>
            Only buy what you can afford to lose. Token prices go down as easily as up,
            and this one can go to nothing.
          </p>
        </div>
        <ul>
          <li>
            There are no cash prizes. Nothing in the game pays out money, and coins
            earned by playing exist only inside the game.
          </li>
          <li>
            Cosmetics are tied to the wallet. They are not tradable and cannot be moved
            to another wallet, and they are not owned in any sense that survives the
            game.
          </li>
          <li>
            The game will change. Numbers are retuned, features are added and removed,
            and everything past Floor 1 is a plan rather than a promise.
          </li>
          <li>
            There is one official domain, ${e.domain}, and one contract address,
            published on this site and on /official. Anything else is a different token
            or a different site, whoever is posting it.
          </li>
        </ul>
      `}]}function It(e){const t=Pt(e);return r`
    ${ee(!1)}
    <main class="site-wrap band-plain">
      <div class="inner">
        <div class="section-gap" style="padding-bottom: 0">
          <div class="label">whitepaper.txt</div>
          <h1 style="font-size: clamp(2rem, 6vw, 3rem)">CrazyCauldron</h1>
          <p class="lead">
            What the game is, how it works, what the token does, and what we are not
            promising. Specific numbers throughout; most of them are read from the same
            content files the server runs on.
          </p>
        </div>

        <div class="wp">
          <nav class="wp-toc" aria-label="Contents">
            <div class="label">contents</div>
            <ol style="list-style: none; padding: 0">
              ${t.map(a=>r`<li><a href="#${a.id}">${a.title}</a></li>`)}
            </ol>
          </nav>
          <div class="wp-body">
            ${t.map(a=>r`
                <section id="${a.id}">
                  <h2>${a.title}</h2>
                  ${a.body()}
                </section>
              `)}
          </div>
        </div>
      </div>
    </main>
    ${te(e)}
  `}function Ft(){var a;const e=new Map;for(const n of Array.from(document.querySelectorAll(".wp-toc a")))e.set(((a=n.getAttribute("href"))==null?void 0:a.slice(1))??"",n);if(e.size===0||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(n=>{var o;for(const l of n)if(l.isIntersecting){for(const m of e.values())m.classList.remove("here");(o=e.get(l.target.id))==null||o.classList.add("here")}},{rootMargin:"-20% 0px -70% 0px"});for(const n of e.keys()){const o=document.getElementById(n);o&&t.observe(o)}}const zt=["/official","/rules"];function Te(e){const t=e.replace(/\/+$/,"")||"/";return zt.includes(t)?t:null}const ge={domain:"crazycauldron.art",cookMint:"",minHold:0,social:{x:"none",telegram:"none"}};async function Nt(){try{const e=await fetch(`${fe.httpUrl}/public/config`);return e.ok?await e.json():ge}catch{return ge}}function Rt(){const e=document.createElement("style");e.textContent=`
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
  `,document.head.append(e)}function Kt(e){const t=document.createElement("nav");t.className="cc-nav";for(const[a,n]of[["/","← Home"],["/play","Play"],["/whitepaper","Whitepaper"],["/roadmap","Roadmap"],["/official","Official"],["/rules","Rules"]]){if(a===e)continue;const o=document.createElement("a");o.href=a,o.textContent=n,t.append(o)}return t}function Se(e,t){const a=document.createDocumentFragment(),n=document.createElement("h1");n.textContent=e;const o=document.createElement("p");return o.className="lead",o.textContent=t,a.append(n,o),a}function Ht(e){const t=document.createElement("div");t.className="cc-address";const a=document.createElement("code");if(a.textContent=e||"not published yet",t.append(a),e){const n=document.createElement("button");n.type="button",n.textContent="Copy",n.addEventListener("click",()=>{var o;(o=navigator.clipboard)==null||o.writeText(e).then(()=>{n.textContent="Copied",setTimeout(()=>n.textContent="Copy",1500)},()=>{n.textContent="Select it"})}),t.append(n)}return t}function k(e,t){const a=document.createElement("p");return a.textContent=e,t&&(a.className=t),a}function j(e){const t=document.createElement("ul");for(const a of e){const n=document.createElement("li");n.textContent=a,t.append(n)}return t}async function Wt(e){const t=await Nt();document.title="CrazyCauldron - Official",e.append(Se("Official","Everything real about CrazyCauldron is on this page. If you found it anywhere else, check it here first."));const a=document.createElement("h2");a.textContent="The site";const n=document.createElement("p"),o=document.createElement("a");o.href=`https://${t.domain}`,o.textContent=t.domain,n.append("The game lives at ",o,". There is no other site."),e.append(a,n);const l=document.createElement("h2");l.textContent="The $COOK contract address",e.append(l,Ht(t.cookMint));const m=document.createElement("div");m.className="cc-warn",m.append(k("This is the only $COOK. Any other contract address is a different token, whatever it is called and whoever is posting it."),k("Copy the address from this page and paste it into your wallet yourself. Do not trust one sent to you, and do not connect your wallet to a site you did not reach from this domain.","cc-note")),e.append(m),t.minHold>0&&e.append(k(`Holding at least ${t.minHold.toLocaleString()} $COOK opens the hub. The balance is checked when you sign in and while you play; nothing is ever taken from your wallet to enter.`));const d=document.createElement("h2");d.textContent="Where the fees go",e.append(d,k("Trading $COOK generates standard pump.fun creator fees. Those fees are received by the team at the project treasury wallet."),k("Nothing is paid out to holders. Holding $COOK is not a claim on those fees or on any other payment, and there is no distribution, revenue share or payout attached to it."),k("The fees fund the servers and the development, and that is what they are for. Anything spent inside the game is separate again: half of a purchase is burned and half goes to the project treasury.","cc-note"));const c=document.createElement("h2");c.textContent="Where we post",e.append(c);const w=[];for(const[f,$]of[["X",t.social.x],["Telegram",t.social.telegram]])w.push($&&$!=="none"?`${f}: ${$}`:`${f}: no account yet. Anything claiming to be our ${f} is not ours.`);e.append(j(w)),e.append(k("When an account does exist, it will be listed here first. This page is the source, not the announcement.","cc-note"))}function qt(e){document.title="CrazyCauldron - Rules",e.append(Se("Rules","Short, and in plain language. Read the last section before you buy anything."));const t=document.createElement("h2");t.textContent="Playing",e.append(t,j(["Sign in with your wallet. Signing proves the wallet is yours; it never moves tokens and never asks for a key.","Holding enough $COOK opens the hub. Nothing is spent to enter, and your tokens stay in your wallet.","Everything you gather, cook and earn belongs to the wallet that earned it, and is there when you come back.","Play fairly. The server decides what happened - where you are, what you gathered, what you cooked - so a modified client gains nothing and a wallet that keeps trying will be shut out.","One person, as many wallets as you like. But progress does not transfer between them, and neither do cosmetics."]));const a=document.createElement("h2");a.textContent="Cosmetics",e.append(a,j(["Hats and cloaks are cosmetic. None of them changes how fast you gather, how well you cook, or what you earn.","Most are earned by playing. Some can also be bought with $COOK, and nothing is ever purchase-only.","A few are tied to your $COOK balance rather than owned. If the balance falls, the garment comes off and returns when it recovers.","Cosmetics belong to the wallet, not to you. They are not tradable and cannot be moved to another wallet."]));const n=document.createElement("h2");n.textContent="About $COOK";const o=document.createElement("div");o.className="cc-warn",o.append(k("$COOK is a community token. It is not a share, not an investment, and not a claim on anything we own or earn."),k("Trading $COOK generates standard pump.fun creator fees, which the team receives at the project treasury wallet and uses to run the servers and build the game. Nothing is paid out to holders."),k("We make no promise about its price, and no promise of rewards, income, airdrops or returns of any kind. Nothing on this site is financial advice."),k("There are no cash prizes. Nothing in the game pays out money, and coins earned by playing exist only inside the game."),k("Anything you spend is spent. A purchase burns half the tokens and sends half to the project treasury; neither half comes back, and there are no refunds."),k("Only buy what you can afford to lose. Token prices go down as easily as up, and this one can go to nothing.")),e.append(n,o);const l=document.createElement("h2");l.textContent="What we can change",e.append(l,j(["The game is under development. Numbers get tuned, features get added, and things occasionally break.","We may change prices, drop rates and unlock conditions. We will not take away a cosmetic you have earned.","The roadmap is a plan, not a promise. What gets built, and when, depends on how many people are playing."]))}async function Bt(e){var n,o;Rt(),(n=document.getElementById("game"))==null||n.remove(),(o=document.getElementById("boot"))==null||o.remove();const t=document.createElement("main");t.className="cc-page",t.append(Kt(e));const a=document.getElementById("ui")??document.body;a.replaceChildren(t),a.setAttribute("style","position:static;display:block;pointer-events:auto"),e==="/official"?await Wt(t):qt(t)}function jt(e){const t=e.replace(/\/+$/,"")||"/";return t==="/whitepaper"||t==="/docs"?"whitepaper":t==="/roadmap"?"roadmap":Te(t)?"legal":"home"}const L=document.getElementById("site");async function Dt(){if(!L)return;const e=jt(window.location.pathname);if(e==="legal"){L.remove();const n=Te(window.location.pathname.replace(/\/+$/,"")||"/");n&&Bt(n);return}_e("site-css",Pe);const t=await Ie();let a=null;Gt(e,t,a),a=await Fe(),a&&(Lt(a),Xt(a))}function Gt(e,t,a){if(L){if(e==="home"){X(L,Et(t,a));const n=document.getElementById("hero-canvas");n instanceof HTMLCanvasElement&&Mt(n),it(),mt()}else e==="whitepaper"?(X(L,It(t)),document.title="CrazyCauldron — whitepaper",Ft()):e==="roadmap"&&(X(L,St(t)),document.title="CrazyCauldron — roadmap");Ke(),He(L),Ut()}}function Xt(e){const t=document.getElementById("ticker-track");if(t)for(const a of Array.from(t.querySelectorAll("[data-live]"))){const n=a.dataset.live;n&&typeof e[n]=="number"&&(a.textContent=e[n].toLocaleString("en-US"))}}function Ut(){const e=window.location.hash.slice(1);e&&requestAnimationFrame(()=>{var t;return(t=document.getElementById(e))==null?void 0:t.scrollIntoView()})}Dt();
