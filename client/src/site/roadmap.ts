/**
 * The roadmap, written once.
 *
 * It appears in three places - a section of the front page, a page of its own
 * at /roadmap, and a chapter of the whitepaper - and three copies of a plan is
 * how a project ends up promising different things on different pages. So it
 * is data here, and each of the three renders it.
 *
 * Everything below the first floor is a plan and not a promise, and the page
 * says so in those words. The floor names are working titles.
 */

import { html } from "./dom.js";
import { band } from "./layout.js";
import { SPRITES } from "./sprites.js";

export interface Floor {
  id: string;
  name: string;
  status: "live" | "next" | "later";
  chefLevels: string;
  town: string;
  painting: string | null;
  biomes: string[];
  brings: string[];
}

export const FLOORS: Floor[] = [
  {
    id: "floor-1",
    name: "Floor 1 — The Village",
    status: "live",
    chefLevels: "Chef 1 to 30",
    town: "The village, with the Kitchen, the Tavern, the Outfitter and the cauldron.",
    painting: "map_hub",
    biomes: ["Meadows", "The Deep Forest", "Mystical Caves"],
    brings: [
      "24 ingredients and 20 recipes",
      "Five skills: Foraging, Prospecting, Knifework, Firecraft, Spicecraft",
      "Nine hats and seven companions",
      "The heat bar, pan and bag tiers, and the leaderboard",
    ],
  },
  {
    id: "floor-2",
    name: "Floor 2 — The Coast",
    status: "next",
    chefLevels: "Chef 30 to 60",
    town: "A harbour town, with its own kitchen.",
    painting: "map_meadows",
    biomes: ["Tidepools", "The Salt Marsh", "The Sunken Reef"],
    brings: [
      "Seafood and sea-plant ingredients",
      "20 new recipes",
      "A sixth skill: Fishing",
      "Two new techniques: Fermenting and Grilling",
    ],
  },
  {
    id: "floor-3",
    name: "Floor 3 — The Peaks",
    status: "later",
    chefLevels: "Chef 60 to 90",
    town: "A mountain monastery.",
    painting: "map_caves",
    biomes: ["Alpine Meadows", "The Frozen Forest", "The Sky Caves"],
    brings: [
      "Highland ingredients",
      "20 new recipes",
      "A seventh skill: Hunting",
      "Two new techniques: Smoking and Preserving",
      "The Grand Feast",
    ],
  },
];

export const MINIGAMES = [
  {
    name: "Cook-off",
    detail: "Two chefs, the same recipe, sixty seconds. Best score takes it.",
  },
  {
    name: "Ingredient Rush",
    detail: "A timed race to gather what a dish needs and get it cooked.",
  },
  {
    name: "Cauldron Duel",
    detail: "Your cooked dishes are a deck; their buffs play against each other.",
  },
  {
    name: "Weekly Chef's Challenge",
    detail: "One set dish, one week, one board.",
  },
];

export const COSMETICS_AND_QUESTS = [
  "Seasonal hats and companions",
  "Cloaks return with the art overhaul",
  "Camp decorations",
  "Villager quests, with stories rather than fetch lists",
  "Hidden recipes and secret spots",
  "Seasons, each with a technique, a limited cosmetic and a leaderboard reset",
];

export const NEXT_AFTER_LAUNCH = [
  "More room for players",
  "Smoother updates",
  "An art overhaul: characters redrawn with full outfits, to match the painted world",
  "Seasons",
];

export const LATER_IF_IT_GROWS = [
  "Legendary dishes and mastery",
  "Feasts",
  "More $COOK cosmetics, half of every purchase burned",
  "Holder tiers",
  "Paid upgrades, in coins or $COOK",
  "A player market — with a treasury fee and anti-bot rules in place first",
];

const STATUS_LABEL: Record<Floor["status"], string> = {
  live: "live",
  next: "next",
  later: "planned",
};

function floorCard(floor: Floor): ReturnType<typeof html> {
  return html`
    <article class="card floor" id="${floor.id}">
      ${floor.painting
        ? html`<img
            class="floor-art"
            src="${SPRITES.painting(floor.painting, true)}"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />`
        : ""}
      <div class="floor-head">
        <h3>${floor.name}</h3>
        <span class="badge badge-${floor.status}">${STATUS_LABEL[floor.status]}</span>
        <span class="mono muted">${floor.chefLevels}</span>
      </div>
      <p class="small">${floor.town}</p>
      <p class="small muted mono">${floor.biomes.join(" · ")}</p>
      <ul class="small">
        ${floor.brings.map((line) => html`<li>${line}</li>`)}
      </ul>
    </article>
  `;
}

/**
 * The roadmap's body, without the section furniture around it.
 *
 * Shared by the front page's band and the page at /roadmap, so the two cannot
 * say different things.
 */
export function roadmapBody(): ReturnType<typeof html> {
  return html`
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

    <div class="timeline">${FLOORS.map(floorCard)}</div>

    <h3 style="margin-top: 2rem">Minigames</h3>
    <p class="small muted">
      Opt-in, and the rewards are titles and cosmetics. Nothing in them pays out
      coins, $COOK or anything else, and nothing in them is wagered.
    </p>
    <div class="grid cols-4">
      ${MINIGAMES.map(
        (game) => html`
          <div class="card">
            <h3>${game.name}</h3>
            <p class="small muted">${game.detail}</p>
          </div>
        `,
      )}
    </div>

    <div class="grid cols-3" style="margin-top: 1.4rem">
      <div class="card">
        <h3>Cosmetics, quests and secrets</h3>
        <ul class="small">
          ${COSMETICS_AND_QUESTS.map((line) => html`<li>${line}</li>`)}
        </ul>
      </div>
      <div class="card">
        <h3>Next, after launch</h3>
        <ul class="small">${NEXT_AFTER_LAUNCH.map((line) => html`<li>${line}</li>`)}</ul>
      </div>
      <div class="card">
        <h3>Later, if the game grows</h3>
        <ul class="small">${LATER_IF_IT_GROWS.map((line) => html`<li>${line}</li>`)}</ul>
      </div>
    </div>
  `;
}

/** The front page's roadmap band. */
export function roadmapSection(): ReturnType<typeof html> {
  return band({
    id: "roadmap",
    painting: "map_forest",
    label: "roadmap.txt",
    body: roadmapBody(),
  });
}
