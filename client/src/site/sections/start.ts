/**
 * How it works, and the world it happens in.
 *
 * Both sections are drawn from shared/src/content - the same JSON the server
 * runs the game from. Nothing here is a number somebody typed twice: the Chef
 * Level a biome opens at, the hours it takes to get there, and which
 * ingredients grow where are all read, so retuning the game retunes the page.
 */

import { CONFIG, INGREDIENTS, SECTIONS as BIOMES, type Section } from "@crazycauldron/shared";
import { html } from "../dom.js";
import { band } from "../layout.js";
import { SPRITES } from "../sprites.js";
import type { SiteConfig } from "../data.js";

const PAINTING_FOR_BIOME: Record<number, string> = {
  1: "map_meadows",
  2: "map_forest",
  3: "map_caves",
};

/** The ingredients that grow in one biome, as their own icons. */
function ingredientRow(sectionIndex: number): ReturnType<typeof html> {
  const grown = INGREDIENTS.filter((item) => item.section === sectionIndex);
  return html`
    <div class="grid" style="grid-template-columns: repeat(4, 1fr); gap: 0.35rem">
      ${grown.map(
        (item) => html`
          <div class="sprite-tile" title="${item.name}">
            <img
              class="sprite"
              src="${SPRITES.ingredient(item.id)}"
              alt="${item.name}"
              width="64"
              height="64"
              loading="lazy"
              decoding="async"
            />
          </div>
        `,
      )}
    </div>
    <p class="small muted mono" style="margin-top: 0.5rem">
      ${grown.map((item) => item.name).join(" · ")}
    </p>
  `;
}

/**
 * How long a biome is away, in hours.
 *
 * Read from the Chef curve's own targets rather than written down: the numbers
 * the designer tunes against are exactly the numbers a reader wants, and a
 * second copy of them would be wrong within a patch.
 */
function hoursTo(chefLevel: number): string {
  if (chefLevel <= 1) return "from the first minute";
  const hours = CONFIG.chef.targetHours[String(chefLevel)];
  return hours === undefined ? `at Chef Level ${chefLevel}` : `about ${hours} hours in`;
}

function biomeCard(biome: Section): ReturnType<typeof html> {
  const painting = PAINTING_FOR_BIOME[biome.index];
  return html`
    <article class="card">
      ${painting
        ? html`<img
            class="sprite"
            style="width: 100%; height: 7rem; object-fit: cover; border-radius: 6px; image-rendering: auto; margin-bottom: 0.7rem"
            src="${SPRITES.painting(painting, true)}"
            alt="${biome.name}"
            loading="lazy"
            decoding="async"
          />`
        : ""}
      <h3 style="color: ${biome.accentColor}">${biome.name}</h3>
      <p class="small mono muted">
        ${biome.unlockChefLevel <= 1
          ? "Open from the start"
          : `Chef Level ${biome.unlockChefLevel}`}
        · ${hoursTo(biome.unlockChefLevel)}
      </p>
      ${ingredientRow(biome.index)}
    </article>
  `;
}

export function howItWorksSection(config: SiteConfig): ReturnType<typeof html> {
  const steps = [
    {
      title: `Hold ${config.minHold.toLocaleString()} $COOK`,
      body: `The door opens at ${config.minHold.toLocaleString()} $COOK in your wallet. It is checked when you sign in and every half hour while you play, and nothing is ever taken from your wallet to enter.`,
    },
    {
      title: "Connect Phantom and sign in",
      body: "One signature, which is free and is not a transaction: it proves the wallet is yours and does nothing else. No approvals, no spend permissions, no gas.",
    },
    {
      title: "Gather, cook, sell, level up",
      body: "Forage the meadows, time the heat bar, sell what you cook to the Tavern, and put the coins into a better pan so the next dish is easier.",
    },
  ];

  const loop = [
    { title: "Expedition", art: SPRITES.node("node_berry"), body: "Pick a biome and fill the bag." },
    { title: "Kitchen", art: SPRITES.prop("kitchen"), body: "Prep, then time the heat." },
    { title: "Tavern", art: SPRITES.prop("tavern"), body: "Sell the dish. Eat one yourself." },
    { title: "Deeper", art: SPRITES.prop("portal_forest"), body: "Chef Levels open the next biome." },
  ];

  return band({
    id: "how-it-works",
    painting: "map_hub",
    label: "how-it-works.txt",
    eager: true,
    body: html`
      <h2>Three steps in, and then a loop</h2>
      <ol class="steps">
        ${steps.map(
          (step) => html`
            <li>
              <h3>${step.title}</h3>
              <p class="small muted">${step.body}</p>
            </li>
          `,
        )}
      </ol>

      <div class="loop" style="margin-top: 2rem">
        ${loop.map(
          (stop, index) => html`
            ${index > 0 ? html`<div class="loop-arrow">→</div>` : ""}
            <div class="card loop-step">
              <img
                class="sprite"
                src="${stop.art}"
                alt=""
                height="72"
                loading="lazy"
                decoding="async"
                style="height: 4.5rem; width: auto"
              />
              <h3>${stop.title}</h3>
              <p class="small muted">${stop.body}</p>
            </div>
          `,
        )}
      </div>
      <p class="small muted" style="margin-top: 0.8rem">
        Gather nodes are per-player, so nobody is racing you for a bush.
      </p>
    `,
  });
}

export function worldSection(): ReturnType<typeof html> {
  return band({
    id: "the-world",
    painting: "map_meadows",
    label: "the-world.txt",
    body: html`
      <h2>One village, three biomes</h2>
      <p class="lead">
        Floor 1 is a painted village with a Kitchen, a Tavern, an Outfitter and the
        cauldron, and three ways out of it. Each biome grows eight ingredients of its
        own, and each opens at a Chef Level rather than a paywall.
      </p>
      <div class="grid cols-3">${BIOMES.map(biomeCard)}</div>
      <p class="small muted" style="margin-top: 0.9rem">
        ${INGREDIENTS.length} ingredients in all. Two of them — moonpetal and dragon's
        breath chili — are rare, and never more than
        ${CONFIG.gathering.maxRareNodesPerSection} nodes of them exist in a biome at a
        time.
      </p>
    `,
  });
}
