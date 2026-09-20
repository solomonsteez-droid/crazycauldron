/**
 * What you get good at, and the thing you actually do.
 *
 * The skills table and the heat bar both compute from shared/src/progression.ts
 * - the same functions the server scores a cook with - so the widths quoted
 * here are the widths a player gets. The demo on the page is a demo and says
 * so: it draws the real bands and lets you stop the marker, and nothing about
 * it reaches a server or a save.
 */

import {
  CONFIG,
  MAX_FINE_WINDOW_PCT,
  MAX_SUPERB_WINDOW_PCT,
  RECIPES,
  SECTIONS as BIOMES,
  SKILL_IDS,
  heatWindows,
  ingredient,
  timingWindowPct,
  type Recipe,
  type SkillId,
} from "@crazycauldron/shared";
import { html } from "../dom.js";
import { band } from "../layout.js";
import { SPRITES } from "../sprites.js";

/** One line of plain English per skill, beside what the content file says. */
const WHAT_IT_DOES: Record<SkillId, string> = {
  foraging:
    "Plants, mushrooms and honey. Levels open the next biome's plant life, reveal rare nodes on the minimap, and add carry slots.",
  prospecting:
    "Salt, clay, iron and crystal. Levels open the next biome's minerals and add a chance of a double drop, mineral by mineral.",
  knifework:
    "The prep step. Levels add ingredient slots — two at the start, six by the end — and improve the quality prep can reach.",
  firecraft:
    "The heat. Every technique is a Firecraft unlock, the timing window widens with every level, and two- then three-pot cooking arrive at 8 and 16.",
  spicecraft:
    "Seasoning, and the dangerous ingredients. Levels make nightshade pepper and dragon's breath chili safe to handle and add quality-step chances.",
};

/** The icon each skill borrows, since skills have no art of their own. */
const SKILL_ART: Record<SkillId, string> = {
  foraging: SPRITES.node("node_herb"),
  prospecting: SPRITES.node("node_clay"),
  knifework: SPRITES.ingredient("sunwheat"),
  firecraft: SPRITES.prop("prop_campfire"),
  spicecraft: SPRITES.ingredient("nightshade_pepper"),
};

/** The unlocks worth naming, rather than all of them. */
function headlineUnlocks(skill: SkillId): string[] {
  return CONFIG.unlocks[skill]
    .filter((unlock) => unlock.kind !== "gatherSpeed")
    .slice(0, 5)
    .map((unlock) => `${unlock.level} · ${unlock.label}`);
}

function skillCard(skill: SkillId): ReturnType<typeof html> {
  const core = CONFIG.skills.coreStat[skill];
  return html`
    <article class="card">
      <img
        class="sprite"
        src="${SKILL_ART[skill]}"
        alt=""
        loading="lazy"
        decoding="async"
        style="height: 3rem; width: auto; margin-bottom: 0.5rem"
      />
      <h3>${CONFIG.skills.names[skill]}</h3>
      <p class="small mono muted">
        1–${CONFIG.skills.maxLevel} · +${core.perLevelPct}% ${core.label} a level
      </p>
      <p class="small">${WHAT_IT_DOES[skill]}</p>
      <ul class="small muted mono" style="list-style: none; padding: 0">
        ${headlineUnlocks(skill).map((line) => html`<li>${line}</li>`)}
      </ul>
      <p class="small muted">At 20: <strong>${CONFIG.skills.titles[skill]}</strong></p>
    </article>
  `;
}

/** The Superb and Fine bands at a Firecraft level, with nothing else helping. */
function windowsAt(firecraft: number) {
  const levels = {
    foraging: 1,
    prospecting: 1,
    knifework: 1,
    firecraft,
    spicecraft: 1,
  };
  return heatWindows(timingWindowPct(levels, 0), 0.5);
}

export function skillsSection(): ReturnType<typeof html> {
  const low = windowsAt(1);
  const high = windowsAt(CONFIG.skills.maxLevel);

  return band({
    id: "skills",
    painting: "map_forest",
    label: "skills.txt",
    body: html`
      <h2>Five skills, and one Chef Level over the top of them</h2>
      <p class="lead">
        Every skill runs 1 to ${CONFIG.skills.maxLevel} on its own track. Chef Level is
        the one that everything feeds: it runs 1 to ${CONFIG.chef.maxLevel}, it is what
        opens the next biome, and it is what the leaderboard sorts on.
      </p>

      <div class="grid cols-3">${SKILL_IDS.map(skillCard)}</div>

      <div class="card card-warm" style="margin-top: 1.4rem">
        <h3>The window grows with Firecraft</h3>
        <p class="small">
          The Superb band is <strong>${low.superbPct.toFixed(1)}%</strong> of the bar at
          Firecraft 1 and <strong>${high.superbPct.toFixed(1)}%</strong> at
          ${CONFIG.skills.maxLevel} — wider again with a better pan and with Knifework
          behind it, and capped at ${MAX_SUPERB_WINDOW_PCT}% so there is always a bar
          left to miss. Fine is ${CONFIG.cooking.fineWindowMultiplier} times as wide,
          capped at ${MAX_FINE_WINDOW_PCT}%.
        </p>
        ${heatDemo()}
      </div>
    `,
  });
}

/**
 * The heat bar, on the page.
 *
 * Client-side and cosmetic: it draws the bands the server would compute at the
 * chosen Firecraft level and bounces a marker across them. Stopping it tells
 * you what you would have cooked, and that is the whole of it - there is no
 * request, no score and no save behind this.
 */
function heatDemo(): ReturnType<typeof html> {
  return html`
    <div class="heat" id="heat-demo">
      <div class="filters" role="group" aria-label="Firecraft level">
        ${[1, 10, CONFIG.skills.maxLevel].map(
          (level) => html`
            <button class="chip" data-firecraft="${level}" aria-pressed="${level === 1}">
              Firecraft ${level}
            </button>
          `,
        )}
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
  `;
}

/**
 * Runs the demo. Called once, after the markup is in the document.
 *
 * One rAF loop that stops itself when the bar scrolls out of view, because a
 * marketing page should not keep a phone's GPU awake for a widget nobody is
 * looking at.
 */
export function startHeatDemo(): void {
  const track = document.getElementById("heat-track");
  const fine = document.getElementById("heat-fine");
  const superb = document.getElementById("heat-superb");
  const marker = document.getElementById("heat-marker");
  const result = document.getElementById("heat-result");
  const demo = document.getElementById("heat-demo");
  if (!track || !fine || !superb || !marker || !result || !demo) return;

  let firecraft = 1;
  let windows = windowsAt(firecraft);
  let running = true;
  let visible = true;
  let position = 0;

  const draw = () => {
    fine.style.left = `${windows.fineFrom * 100}%`;
    fine.style.width = `${(windows.fineTo - windows.fineFrom) * 100}%`;
    superb.style.left = `${windows.superbFrom * 100}%`;
    superb.style.width = `${(windows.superbTo - windows.superbFrom) * 100}%`;
  };

  const judge = () => {
    if (position >= windows.superbFrom && position <= windows.superbTo) return "Superb";
    if (position >= windows.fineFrom && position <= windows.fineTo) return "Fine";
    return "Common";
  };

  for (const chip of Array.from(demo.querySelectorAll<HTMLButtonElement>("[data-firecraft]"))) {
    chip.addEventListener("click", () => {
      firecraft = Number(chip.dataset.firecraft ?? "1");
      windows = windowsAt(firecraft);
      for (const other of Array.from(
        demo.querySelectorAll<HTMLButtonElement>("[data-firecraft]"),
      )) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
      running = true;
      result.textContent = `Superb is ${windows.superbPct.toFixed(1)}% of the bar here.`;
      draw();
    });
  }

  const stopButton = demo.querySelector<HTMLButtonElement>("[data-heat-stop]");
  const toggle = () => {
    running = !running;
    result.textContent = running
      ? "A demo. Nothing here is scored or saved."
      : `${judge()}. A demo — nothing here is scored or saved.`;
    stopButton?.setAttribute("aria-pressed", String(!running));
  };
  stopButton?.addEventListener("click", toggle);
  track.addEventListener("click", toggle);

  // The marker sweeps the bar at the game's own rate, ping-ponging.
  const sweepMs = CONFIG.cooking.barMs / CONFIG.cooking.markerSpeedMultiplier;
  let last = performance.now();
  let elapsed = 0;

  const tick = (now: number) => {
    const delta = Math.min(64, now - last);
    last = now;
    if (running && visible) {
      elapsed += delta;
      const phase = (elapsed % (sweepMs * 2)) / sweepMs;
      position = phase <= 1 ? phase : 2 - phase;
      marker.style.left = `${position * 100}%`;
    }
    requestAnimationFrame(tick);
  };

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible = entry.isIntersecting;
      },
      { rootMargin: "120px" },
    ).observe(track);
  }

  draw();
  requestAnimationFrame(tick);
}

function biomeName(index: number): string {
  return BIOMES.find((section) => section.index === index)?.name ?? "";
}

const TECHNIQUE_LABEL: Record<string, string> = {
  raw: "Raw",
  pan_fry: "Pan-fry",
  simmer: "Simmer",
  bake: "Bake",
  clay_bake: "Clay bake",
  roast: "Roast",
  smoke: "Smoke",
  chill: "Chill",
};

function requirementText(recipe: Recipe): string {
  const parts = Object.entries(recipe.requirements).map(
    ([skill, level]) => `${CONFIG.skills.names[skill as SkillId]} ${level}`,
  );
  return parts.length === 0 ? "No requirements" : parts.join(" · ");
}

function recipeCard(recipe: Recipe): ReturnType<typeof html> {
  return html`
    <article class="card recipe" data-biome="${recipe.section}">
      <img
        class="sprite"
        src="${SPRITES.dish(recipe.id)}"
        alt=""
        width="64"
        height="64"
        loading="lazy"
        decoding="async"
      />
      <div>
        <h3>${recipe.name}</h3>
        <p class="meta">
          ${biomeName(recipe.section)} · ${TECHNIQUE_LABEL[recipe.technique] ?? recipe.technique}
          · ${recipe.chefXp} XP · ${recipe.sellCoins} coins
        </p>
        <p class="small" style="margin: 0.3rem 0 0">
          ${recipe.ingredients
            .map((part) => `${part.qty}× ${ingredient(part.id).name}`)
            .join(", ")}
        </p>
        <p class="meta">${requirementText(recipe)}</p>
      </div>
    </article>
  `;
}

export function cookingSection(): ReturnType<typeof html> {
  const quality = CONFIG.cooking.quality;

  return band({
    id: "cooking",
    painting: "map_caves",
    label: "cooking.txt",
    body: html`
      <h2>One bar, three outcomes</h2>
      <p class="lead">
        Prep the ingredients, then the heat bar: a marker sweeps back and forth for
        ${(CONFIG.cooking.barMs / 1000).toFixed(0)} seconds and you click to stop it.
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
              <td class="num">×${quality.common.xp}</td>
              <td class="num">×${quality.common.coins}</td>
              <td class="small muted">Anywhere else, or the clock running out</td>
            </tr>
            <tr>
              <td>Fine</td>
              <td class="num">×${quality.fine.xp}</td>
              <td class="num">×${quality.fine.coins}</td>
              <td class="small muted">The wider band</td>
            </tr>
            <tr>
              <td>Superb</td>
              <td class="num">×${quality.superb.xp}</td>
              <td class="num">×${quality.superb.coins}</td>
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

      <h3 style="margin-top: 1.8rem">All ${RECIPES.length} recipes</h3>
      <div class="filters" role="group" aria-label="Filter recipes by biome">
        <button class="chip" data-filter="all" aria-pressed="true">All</button>
        ${BIOMES.map(
          (biome) => html`
            <button class="chip" data-filter="${biome.index}" aria-pressed="false">
              ${biome.name}
            </button>
          `,
        )}
      </div>
      <div class="recipe-list" id="recipe-list">${RECIPES.map(recipeCard)}</div>
    `,
  });
}

/** Wires the recipe filter chips. The list itself is already in the document. */
export function startRecipeBrowser(): void {
  const list = document.getElementById("recipe-list");
  if (!list) return;

  const chips = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-filter]"));
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const want = chip.dataset.filter ?? "all";
      for (const other of chips) other.setAttribute("aria-pressed", String(other === chip));
      for (const card of Array.from(list.querySelectorAll<HTMLElement>(".recipe"))) {
        card.hidden = want !== "all" && card.dataset.biome !== want;
      }
    });
  }
}
