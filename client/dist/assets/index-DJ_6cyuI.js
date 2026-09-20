import{e as U,w as K,t as ne}from"./motionMath-CBnmCX7k.js";class G{constructor(e){this.markup=e}}const ae={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};function oe(t){return String(t).replace(/[&<>"']/g,e=>ae[e]??e)}function X(t){return t instanceof G?t.markup:Array.isArray(t)?t.map(X).join(""):t==null||t===!1?"":oe(t)}function y(t,...e){let n=t[0]??"";for(let a=0;a<e.length;a+=1)n+=X(e[a])+(t[a+1]??"");return new G(n)}function re(t,e){t.innerHTML=e.markup}function ie(t,e){if(document.getElementById(t))return;const n=document.createElement("style");n.id=t,n.textContent=e,document.head.append(n)}function $(t){return t===null?"—":t.toLocaleString("en-US")}const se=`
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
`,P={domain:"crazycauldron.art",cookMint:"",showMint:!1,treasuryWallet:"",minHold:2e3,social:{x:"none",telegram:"none"},shopEnabled:!1};async function Y(t,e=6e3){const n=new AbortController,a=setTimeout(()=>n.abort(),e);try{const r=await fetch(`${U.httpUrl}${t}`,{signal:n.signal});return r.ok?await r.json():null}catch{return null}finally{clearTimeout(a)}}async function le(){const t=await Y("/public/config");return t?{...P,...t,social:{...P.social,...t.social??{}}}:P}async function ce(){return Y("/stats",4e3)}function F(t){const e=t.trim();return e===""||e.toLowerCase()==="none"?null:e}const de=[{id:"how-it-works",label:"how it works"},{id:"the-world",label:"the world"},{id:"skills",label:"skills"},{id:"cooking",label:"cooking"},{id:"wardrobe",label:"wardrobe"},{id:"roadmap",label:"roadmap"},{id:"token",label:"$COOK"},{id:"proof",label:"proof"}];function me(t){const e="";return y`
    <header class="topbar">
      <div class="inner">
        <a class="brand" href="/">Crazy<b>Cauldron</b></a>
        <nav class="topnav">
          ${de.map(n=>y`<a href="${e}#${n.id}">${n.label}</a>`)}
          <a href="/whitepaper">whitepaper</a>
        </nav>
        <a class="btn btn-primary" href="/play">Play</a>
      </div>
    </header>
  `}function pe(t){const e=[y`<span><b data-live="playersOnline">${$((t==null?void 0:t.playersOnline)??null)}</b> players online</span>`,y`<span><b data-live="chefsRegistered">${$((t==null?void 0:t.chefsRegistered)??null)}</b> chefs registered</span>`,y`<span><b data-live="dishesCooked">${$((t==null?void 0:t.dishesCooked)??null)}</b> dishes cooked</span>`,y`<span><b data-live="superbsToday">${$((t==null?void 0:t.superbsToday)??null)}</b> superbs today</span>`,y`<span>creator fees fund servers and development</span>`,y`<span>nothing is paid out to holders</span>`,y`<span>not financial advice</span>`];return y`
    <div class="ticker" aria-hidden="true">
      <div class="ticker-track" id="ticker-track">${e}${e}</div>
    </div>
  `}function he(t){const e=F(t.social.x),n=F(t.social.telegram);return y`
    <footer class="foot band-plain">
      <div class="inner">
        <div class="foot-links">
          <a href="/play">Play</a>
          <a href="/whitepaper">Whitepaper</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/official">Official links</a>
          <a href="/rules">Rules</a>
          ${e?y`<a href="https://x.com/${e}" rel="noopener">X</a>`:""}
          ${n?y`<a href="https://t.me/${n}" rel="noopener">Telegram</a>`:""}
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
          The only official domain is <strong>${t.domain}</strong>. Anything else is
          not us.
        </p>
      </div>
    </footer>
  `}function fe(){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const t=Array.from(document.querySelectorAll(".band-art"));if(t.length===0)return;let e=!1;const n=()=>{e=!1;const r=window.innerHeight/2;for(const h of t){const c=h.parentElement;if(!c)continue;const s=c.getBoundingClientRect();if(s.bottom<-200||s.top>window.innerHeight+200)continue;const l=s.top+s.height/2,g=Math.max(-60,Math.min(60,(l-r)/r*-48));h.style.transform=`translate3d(0, ${g.toFixed(1)}px, 0)`}},a=()=>{e||(e=!0,requestAnimationFrame(n))};window.addEventListener("scroll",a,{passive:!0}),window.addEventListener("resize",a,{passive:!0}),n()}function ue(t){for(const e of Array.from(t.querySelectorAll("[data-copy]")))e.addEventListener("click",()=>{var r;const n=e.dataset.copy??"",a=e.textContent??"Copy";(r=navigator.clipboard)==null||r.writeText(n).then(()=>{e.textContent="Copied",setTimeout(()=>e.textContent=a,1600)}).catch(()=>{e.textContent="Press ⌘C",setTimeout(()=>e.textContent=a,2200)})})}function ge(t,e){return y`
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
          <span><b data-live="playersOnline">${$((e==null?void 0:e.playersOnline)??null)}</b> playing now</span>
          <span><b data-live="chefsRegistered">${$((e==null?void 0:e.chefsRegistered)??null)}</b> chefs registered</span>
          <span><b data-live="dishesCooked">${$((e==null?void 0:e.dishesCooked)??null)}</b> dishes cooked</span>
        </p>
        <p class="small muted" style="margin-top: 0.7rem">
          Holding ${t.minHold.toLocaleString()} $COOK opens the door. Signing in is
          free and never asks your wallet for a transaction.
        </p>
      </div>
    </section>
  `}function be(t,e,n){return y`
    ${me()}
    <main class="site-wrap">${ge(t,e)} ${n}</main>
    ${pe(e)} ${he(t)}
  `}function ye(t){for(const e of Array.from(document.querySelectorAll("[data-live]"))){const n=e.dataset.live;n&&typeof t[n]=="number"&&(e.textContent=$(t[n]))}}const k="/assets/generated",E={painting(t,e=!1){return`/assets/site/${t}-${e?"narrow":"wide"}.jpg`},paintingSrcset(t){return`${E.painting(t,!0)} 720w, ${E.painting(t,!1)} 1440w`},hat:t=>`${k}/hats/${t}.png`,companion:t=>`${k}/companions/${t}.png`,dish:t=>`${k}/dishes/${t}.png`,ingredient:t=>`${k}/ingredients/${t}.png`,prop:t=>`${k}/props/${t}.png`,node:t=>`${k}/nodes/${t}.png`,character:t=>`${k}/characters/${t}.png`,async hatOffsets(){try{const t=await fetch(`${k}/offsets.json`);if(!t.ok)return{};const e=await t.json(),n={};for(const[a,r]of Object.entries(e.hats??{}))r.down&&(n[a]=r.down);return n}catch{return{}}}};function we(t){return new Promise(e=>{const n=new Image;n.decoding="async",n.onload=()=>e(n),n.onerror=()=>e(null),n.src=t})}async function q(t){var l,g,f,u;const[e,n,a]=await Promise.all([we(E.character(t)),fetch(`${k}/characters/${t}.json`).then(m=>m.ok?m.json():null).catch(()=>null),fetch(`${k}/manifest.json`).then(m=>m.ok?m.json():null).catch(()=>null)]);if(!e||!n)return null;const r=new Map(n.frames.map(m=>[m.filename,m.frame])),c=(((u=(f=(g=(l=a==null?void 0:a.bodies)==null?void 0:l[t])==null?void 0:g.walk)==null?void 0:f.right)==null?void 0:u.order)??[0,1,2,3]).map(m=>r.get(`${t}_walk_right_${m}`)).filter(m=>m!==void 0),s=c[0]??r.get(`${t}_idle_down`);return!s||c.length===0?null:{sheet:e,walkRight:c,frameWidth:s.w,frameHeight:s.h}}const I=8e3,C=3;function R(t){return new Promise(e=>{const n=new Image;n.decoding="async",n.onload=()=>e(n),n.onerror=()=>e(null),n.src=t})}function ve(t){const e=t.getContext("2d",{alpha:!0});if(!e)return()=>{};const n=window.matchMedia("(prefers-reduced-motion: reduce)").matches;let a=0,r=0,h=null,c=[];const s=[];let l=null,g=performance.now()+4e3;const f=[];let u=0,m=!1;function w(){const i=t.getBoundingClientRect(),o=Math.min(window.devicePixelRatio||1,2);a=Math.max(1,Math.round(i.width)),r=Math.max(1,Math.round(i.height)),t.width=Math.round(a*o),t.height=Math.round(r*o),e.setTransform(o,0,0,o,0,0),e.imageSmoothingEnabled=!1,O(),L()}function O(){const i=n?0:Math.min(46,Math.round(a/26));c=Array.from({length:i},(o,d)=>{const p=(d+.5)/i*a+(Math.sin(d*12.9898)*.5+.5)*14,v=Math.sin(d*78.233)*.5+.5;return{x:p,y:r-6-v*Math.min(70,r*.1),height:7+v*9,phase:d*.7,shade:v>.5?"rgba(92, 138, 74, 0.55)":"rgba(63, 107, 70, 0.5)"}})}function L(){const i=r-Math.min(48,r*.07);for(let o=0;o<f.length;o+=1)f[o].y=i-o*6}function V(i){if(!h){e.fillStyle="#14101a",e.fillRect(0,0,a,r);return}const o=Math.max(a/h.width,r/h.height),d=h.width*o,p=h.height*o,v=n?0:K(i,0,I*3,a)*9;e.drawImage(h,(a-d)/2+v,(r-p)*.62,d,p)}function Q(i){for(const o of c){const d=ne(i,o.x,o.phase,I,a);e.save(),e.translate(o.x,o.y),e.rotate(d.angle*Math.PI/180),e.fillStyle=o.shade,e.fillRect(-1,-o.height,2,o.height),e.fillRect(-3,-o.height*.6,2,o.height*.6),e.fillRect(1,-o.height*.75,2,o.height*.75),e.restore()}}function Z(i,o){if(!n){if(u%22===0)for(const d of[.26,.68])s.push({x:a*d,y:r*.34,age:0,life:5200,drift:0,size:5});for(let d=s.length-1;d>=0;d-=1){const p=s[d];if(p.age+=o,p.age>p.life){s.splice(d,1);continue}const v=p.age/p.life;p.drift+=K(i,p.x,I,a)*.35,e.globalAlpha=(1-v)*.22,e.fillStyle="#cfc6bb",e.beginPath(),e.arc(p.x+p.drift,p.y-v*r*.22,p.size+v*16,0,Math.PI*2),e.fill(),e.globalAlpha=1}}}function ee(i,o){if(n||(!l&&i>g&&(l={x:-30,y:r*(.18+Math.random()*.14),speed:.045+Math.random()*.02,phase:Math.random()*Math.PI*2}),!l))return;if(l.x+=l.speed*o,l.x>a+30){l=null,g=i+9e3+Math.random()*9e3;return}const d=Math.sin(i/90+l.phase)*4;e.strokeStyle="rgba(24, 20, 30, 0.55)",e.lineWidth=2,e.beginPath(),e.moveTo(l.x-6,l.y+d),e.lineTo(l.x,l.y),e.lineTo(l.x+6,l.y+d),e.stroke()}function te(i){for(const o of f){o.x+=o.speed*i,o.x>a+60&&(o.x=-60-Math.random()*120),o.step+=i;const d=o.body.walkRight,p=d[Math.floor(o.step/100)%d.length],v=p.w*C,T=p.h*C,S=Math.round(o.x),b=Math.round(o.y-T),z=Math.floor(o.step/200)%2===0?0:C;if(e.drawImage(o.body.sheet,p.x,p.y,p.w,p.h,S,b+z,v,T),o.hat&&e.drawImage(o.hat,S+o.hatOffset.x*C,b+z+o.hatOffset.y*C,o.hat.width*C,o.hat.height*C),o.companion){const W=o.companion.width*C,B=o.companion.height*C;e.drawImage(o.companion,Math.round(o.x-W-8),Math.round(o.y-B+z),W,B)}}}let j=performance.now();function N(i){if(m)return;const o=Math.min(64,i-j);j=i,u+=1,e.clearRect(0,0,a,r),V(i),Z(i,o),ee(i,o),Q(i),te(o),requestAnimationFrame(N)}const H=()=>w();return window.addEventListener("resize",H,{passive:!0}),w(),requestAnimationFrame(N),(async()=>{const i=window.innerWidth<900;h=await R(E.painting("map_hub",i));const o=await Promise.all([q("male"),q("female")]),d=["hat_01_chef","hat_05_circlet","hat_03_mushroom","hat_07_moonpetal"],p=["companion_01_hen","companion_07_emberfox","companion_02_piglet",null],[v,T,S]=await Promise.all([Promise.all(d.map(b=>R(E.hat(b)))),Promise.all(p.map(b=>b?R(E.companion(b)):Promise.resolve(null))),E.hatOffsets()]);for(let b=0;b<d.length;b+=1){const z=o[b%2];z&&f.push({x:-80-b*150,y:r,speed:.022+b*.004,body:z,hat:v[b]??null,hatOffset:S[d[b]??""]??{x:6,y:-12},companion:T[b]??null,step:b*340})}L()})(),()=>{m=!0,window.removeEventListener("resize",H)}}const xe=["/official","/rules","/roadmap"];function J(t){const e=t.replace(/\/+$/,"")||"/";return xe.includes(e)?e:null}const D={domain:"crazycauldron.art",cookMint:"",minHold:0,social:{x:"none",telegram:"none"}};async function ke(){try{const t=await fetch(`${U.httpUrl}/public/config`);return t.ok?await t.json():D}catch{return D}}function Ce(){const t=document.createElement("style");t.textContent=`
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
  `,document.head.append(t)}function $e(t){const e=document.createElement("nav");e.className="cc-nav";for(const[n,a]of[["/","← Play"],["/official","Official"],["/rules","Rules"],["/roadmap","Roadmap"]]){if(n===t)continue;const r=document.createElement("a");r.href=n,r.textContent=a,e.append(r)}return e}function _(t,e){const n=document.createDocumentFragment(),a=document.createElement("h1");a.textContent=t;const r=document.createElement("p");return r.className="lead",r.textContent=e,n.append(a,r),n}function Ee(t){const e=document.createElement("div");e.className="cc-address";const n=document.createElement("code");if(n.textContent=t||"not published yet",e.append(n),t){const a=document.createElement("button");a.type="button",a.textContent="Copy",a.addEventListener("click",()=>{var r;(r=navigator.clipboard)==null||r.writeText(t).then(()=>{a.textContent="Copied",setTimeout(()=>a.textContent="Copy",1500)},()=>{a.textContent="Select it"})}),e.append(a)}return e}function x(t,e){const n=document.createElement("p");return n.textContent=t,e&&(n.className=e),n}function A(t){const e=document.createElement("ul");for(const n of t){const a=document.createElement("li");a.textContent=n,e.append(a)}return e}async function ze(t){const e=await ke();document.title="CrazyCauldron - Official",t.append(_("Official","Everything real about CrazyCauldron is on this page. If you found it anywhere else, check it here first."));const n=document.createElement("h2");n.textContent="The site";const a=document.createElement("p"),r=document.createElement("a");r.href=`https://${e.domain}`,r.textContent=e.domain,a.append("The game lives at ",r,". There is no other site."),t.append(n,a);const h=document.createElement("h2");h.textContent="The $COOK contract address",t.append(h,Ee(e.cookMint));const c=document.createElement("div");c.className="cc-warn",c.append(x("This is the only $COOK. Any other contract address is a different token, whatever it is called and whoever is posting it."),x("Copy the address from this page and paste it into your wallet yourself. Do not trust one sent to you, and do not connect your wallet to a site you did not reach from this domain.","cc-note")),t.append(c),e.minHold>0&&t.append(x(`Holding at least ${e.minHold.toLocaleString()} $COOK opens the hub. The balance is checked when you sign in and while you play; nothing is ever taken from your wallet to enter.`));const s=document.createElement("h2");s.textContent="Where the fees go",t.append(s,x("Trading $COOK generates standard pump.fun creator fees. Those fees are received by the team at the project treasury wallet."),x("Nothing is paid out to holders. Holding $COOK is not a claim on those fees or on any other payment, and there is no distribution, revenue share or payout attached to it."),x("The fees fund the servers and the development, and that is what they are for. Anything spent inside the game is separate again: half of a purchase is burned and half goes to the project treasury.","cc-note"));const l=document.createElement("h2");l.textContent="Where we post",t.append(l);const g=[];for(const[f,u]of[["X",e.social.x],["Telegram",e.social.telegram]])g.push(u&&u!=="none"?`${f}: ${u}`:`${f}: no account yet. Anything claiming to be our ${f} is not ours.`);t.append(A(g)),t.append(x("When an account does exist, it will be listed here first. This page is the source, not the announcement.","cc-note"))}function Me(t){document.title="CrazyCauldron - Rules",t.append(_("Rules","Short, and in plain language. Read the last section before you buy anything."));const e=document.createElement("h2");e.textContent="Playing",t.append(e,A(["Sign in with your wallet. Signing proves the wallet is yours; it never moves tokens and never asks for a key.","Holding enough $COOK opens the hub. Nothing is spent to enter, and your tokens stay in your wallet.","Everything you gather, cook and earn belongs to the wallet that earned it, and is there when you come back.","Play fairly. The server decides what happened - where you are, what you gathered, what you cooked - so a modified client gains nothing and a wallet that keeps trying will be shut out.","One person, as many wallets as you like. But progress does not transfer between them, and neither do cosmetics."]));const n=document.createElement("h2");n.textContent="Cosmetics",t.append(n,A(["Hats and cloaks are cosmetic. None of them changes how fast you gather, how well you cook, or what you earn.","Most are earned by playing. Some can also be bought with $COOK, and nothing is ever purchase-only.","A few are tied to your $COOK balance rather than owned. If the balance falls, the garment comes off and returns when it recovers.","Cosmetics belong to the wallet, not to you. They are not tradable and cannot be moved to another wallet."]));const a=document.createElement("h2");a.textContent="About $COOK";const r=document.createElement("div");r.className="cc-warn",r.append(x("$COOK is a community token. It is not a share, not an investment, and not a claim on anything we own or earn."),x("Trading $COOK generates standard pump.fun creator fees, which the team receives at the project treasury wallet and uses to run the servers and build the game. Nothing is paid out to holders."),x("We make no promise about its price, and no promise of rewards, income, airdrops or returns of any kind. Nothing on this site is financial advice."),x("There are no cash prizes. Nothing in the game pays out money, and coins earned by playing exist only inside the game."),x("Anything you spend is spent. A purchase burns half the tokens and sends half to the project treasury; neither half comes back, and there are no refunds."),x("Only buy what you can afford to lose. Token prices go down as easily as up, and this one can go to nothing.")),t.append(a,r);const h=document.createElement("h2");h.textContent="What we can change",t.append(h,A(["The game is under development. Numbers get tuned, features get added, and things occasionally break.","We may change prices, drop rates and unlock conditions. We will not take away a cosmetic you have earned.","The roadmap is a plan, not a promise. What gets built, and when, depends on how many people are playing."]))}function Oe(t,e){const n=t.replace(/\r\n/g,`
`).split(`
`);let a=0;const r=c=>c.replace(/^\||\|$/g,"").split("|").map(s=>s.trim()),h=(c,s)=>{const l=/(\*\*[^*]+\*\*|`[^`]+`)/g;let g=0;for(const f of c.matchAll(l)){const u=f.index??0;u>g&&s.append(c.slice(g,u));const m=f[0];if(m.startsWith("`")){const w=document.createElement("code");w.textContent=m.slice(1,-1),s.append(w)}else{const w=document.createElement("strong");w.textContent=m.slice(2,-2),s.append(w)}g=u+m.length}g<c.length&&s.append(c.slice(g))};for(;a<n.length;){const c=n[a]??"";if(c.trim()===""){a+=1;continue}const s=/^(#{1,4})\s+(.*)$/.exec(c);if(s){const f=Math.min(s[1].length,4),u=document.createElement(`h${f}`);h(s[2],u),e.append(u),a+=1;continue}if(c.includes("|")&&(n[a+1]??"").includes("---")){const f=document.createElement("table"),u=document.createElement("tr");for(const m of r(c)){const w=document.createElement("th");h(m,w),u.append(w)}for(f.append(u),a+=2;a<n.length&&(n[a]??"").includes("|");){const m=document.createElement("tr");for(const w of r(n[a]??"")){const O=document.createElement("td");h(w,O),m.append(O)}f.append(m),a+=1}e.append(f);continue}if(/^[-*]\s+/.test(c)){const f=document.createElement("ul");for(;a<n.length&&/^[-*]\s+/.test(n[a]??"");){const u=document.createElement("li");h((n[a]??"").replace(/^[-*]\s+/,""),u),f.append(u),a+=1}e.append(f);continue}const l=[];for(;a<n.length&&(n[a]??"").trim()!=="";)l.push(n[a]??""),a+=1;const g=document.createElement("p");h(l.join(" "),g),e.append(g)}}async function Te(t){document.title="CrazyCauldron - Roadmap";try{const e=await fetch("/roadmap.md");if(!e.ok)throw new Error(String(e.status));Oe(await e.text(),t)}catch{t.append(_("Roadmap","The roadmap could not be loaded just now. Please try again shortly."))}}async function Se(t){var a,r;Ce(),(a=document.getElementById("game"))==null||a.remove(),(r=document.getElementById("boot"))==null||r.remove();const e=document.createElement("main");e.className="cc-page",e.append($e(t));const n=document.getElementById("ui")??document.body;n.replaceChildren(e),n.setAttribute("style","position:static;display:block;pointer-events:auto"),t==="/official"?await ze(e):t==="/rules"?Me(e):await Te(e)}function Ae(t){const e=t.replace(/\/+$/,"")||"/";return e==="/whitepaper"||e==="/docs"?"whitepaper":e==="/roadmap"?"roadmap":J(e)?"legal":"home"}const M=document.getElementById("site");async function Pe(){if(!M)return;const t=Ae(window.location.pathname);if(t==="legal"){M.remove();const a=J(window.location.pathname.replace(/\/+$/,"")||"/");a&&Se(a);return}ie("site-css",se);const e=await le();let n=null;Ie(t,e,n),n=await ce(),n&&(ye(n),Re(n))}function Ie(t,e,n){if(M){if(t==="home"){re(M,be(e,n,y``));const a=document.getElementById("hero-canvas");a instanceof HTMLCanvasElement&&ve(a)}fe(),ue(M),_e()}}function Re(t){const e=document.getElementById("ticker-track");if(e)for(const n of Array.from(e.querySelectorAll("[data-live]"))){const a=n.dataset.live;a&&typeof t[a]=="number"&&(n.textContent=t[a].toLocaleString("en-US"))}}function _e(){const t=window.location.hash.slice(1);t&&requestAnimationFrame(()=>{var e;return(e=document.getElementById(t))==null?void 0:e.scrollIntoView()})}Pe();
