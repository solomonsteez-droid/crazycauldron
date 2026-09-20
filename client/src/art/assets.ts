/**
 * Loads whatever art exists and draws stand-ins for whatever does not.
 *
 * Most of the art folders are still empty, so every lookup in the game goes
 * through a texture key that is guaranteed to exist: either the real sprite the
 * pipeline produced, or a palette-tinted placeholder generated at boot with the
 * item's initial on it. Nothing in the game has to ask whether art has landed.
 */

import Phaser from "phaser";
import {
  AMBIENCE,
  AREAS,
  INGREDIENTS,
  PALETTE,
  RECIPES,
  SECTIONS,
  hex,
  type Ingredient,
} from "@crazycauldron/shared";
import { GENERATED, type Manifest } from "./manifest.js";

export const BODY_FRAME = { width: 32, height: 48 };

export const bodyKey = (body: string) => `body:${body}`;
/**
 * A cosmetic, front or back.
 *
 * Most items are symmetric enough that the front art mirrored is a fair side
 * view and an honest back. Anything with a face, a bow or a brooch is not, and
 * the artist supplies an <id>_back.png; the manifest says which have one.
 */
export const hatKey = (id: string, back = false) => `hat:${id}${back ? ":back" : ""}`;

/**
 * A companion, walking beside its player.
 *
 * One image at every angle. A pet at this size is a silhouette with two eyes;
 * four drawings of one would be four chances for them to disagree, and the
 * follower turns by moving rather than by facing.
 */
export const companionKey = (id: string) => `companion:${id}`;
export const ingredientKey = (id: string) => `ingredient:${id}`;
export const dishKey = (recipeId: string) => `dish:${recipeId}`;
/**
 * Node art is keyed by archetype, not by ingredient.
 *
 * Eight drops cover twenty-four ingredients - every salt looks like salt - so
 * the ingredient names which archetype it grows on and the art is shared.
 */
export const nodeKey = (archetype: string, empty = false) =>
  `node:${archetype}${empty ? ":empty" : ""}`;

/**
 * Archetypes the pipeline actually produced art for.
 *
 * A generated stand-in is tinted by section accent so two nodes can be told
 * apart; processed art carries its own colour, and tinting it would only mute
 * it - so the two cases have to be distinguishable at draw time.
 */
const PROCESSED_NODES = new Set<string>();

export const hasProcessedNode = (archetype: string) => PROCESSED_NODES.has(archetype);

/** The archetype an ingredient grows on. */
export const nodeArchetype = (ingredientId: string): string =>
  INGREDIENTS.find((i) => i.id === ingredientId)?.node ?? "herb";
export const uiKey = (name: string) => `ui:${name}`;
export const propKey = (id: string) => `prop:${id}`;

/**
 * The archway drawn on each hub gate.
 *
 * The paintings show three dirt paths leaving the plaza and nothing to say
 * they are doors. A pulsing glow said "something is here" but not "you may go
 * through it", so the processed arch goes back on top - the one prop that
 * survived the move to painted maps, because it marks a thing the painting
 * does not depict.
 */
export const UNUSED_GATE_ART: Record<number, string> = {
  1: "portal_meadows",
  2: "portal_forest",
  3: "portal_caves",
};
/** One painting per area, loaded straight from client/public/assets/maps. */
export const mapKey = (areaId: string) => `map:${areaId}`;
export const effectKey = (name: string) => `fx:${name}`;
/** Recipe ids in authoring order, so dishes/recipe_NN.png maps to a recipe. */
const RECIPE_BY_INDEX = RECIPES.map((r) => r.id);
const recipeFile = (index: number) => `recipe_${String(index + 1).padStart(2, "0")}.png`;

/**
 * Queues every file the manifest says exists.
 *
 * Nothing here is required. A file that fails to load leaves its key unset and
 * the placeholder generated afterwards fills the gap.
 */
export function queueArt(scene: Phaser.Scene, manifest: Manifest): void {
  /*
   * The four paintings, before anything else.
   *
   * They are ~6MB each and the game cannot draw a frame without one, so they
   * are queued first and the boot screen waits on them. Nothing generates a
   * fallback: an area with no painting has no ground, and a coloured rectangle
   * would only hide which file is missing.
   */
  for (const area of AREAS) {
    scene.load.image(mapKey(area.id), `/assets/maps/${area.image}`);
  }

  /*
   * The four paintings, before anything else.
   *
   * They are ~6MB each and the game cannot draw a frame without one, so they
   * are queued first and the boot screen waits on them. Nothing generates a
   * fallback: an area with no painting has no ground, and a coloured rectangle
   * would only hide which file is missing.
   */
  for (const area of AREAS) {
    scene.load.image(mapKey(area.id), `/assets/maps/${area.image}`);
  }

  for (const body of Object.keys(manifest.bodies)) {
    scene.load.atlas(
      bodyKey(body),
      `${GENERATED}/characters/${body}.png`,
      `${GENERATED}/characters/${body}.json`,
    );
  }

  for (const hat of manifest.hats) {
    scene.load.image(hatKey(hat.id), `${GENERATED}/hats/${hat.id}.png`);
    if (hat.back) scene.load.image(hatKey(hat.id, true), `${GENERATED}/hats/${hat.id}_back.png`);
  }
  for (const companion of manifest.companions) {
    scene.load.image(companionKey(companion.id), `${GENERATED}/companions/${companion.id}.png`);
  }
  /*
   * No props are loaded at all now.
   *
   * The buildings, the ground and the shrubs are painted into the maps, and
   * the three gate arches - the last props still drawn - are built in code
   * by world/portal.ts. A painted arch is one picture, and a gate is the
   * loudest object in the hub: it has to turn, glow and throw motes, which
   * a picture cannot. The source drawings and the cut props are still on
   * disk and are named by UNUSED_GATE_ART; nothing fetches them.
   */

  for (const recipeId of manifest.dishes ?? []) {
    scene.load.image(dishKey(recipeId), `${GENERATED}/dishes/${recipeId}.png`);
  }

  for (const id of manifest.ingredients ?? []) {
    scene.load.image(ingredientKey(id), `${GENERATED}/ingredients/${id}.png`);
  }

  for (const node of manifest.nodes ?? []) {
    PROCESSED_NODES.add(node.id);
    scene.load.image(nodeKey(node.id), `${GENERATED}/nodes/node_${node.id}.png`);
    scene.load.image(nodeKey(node.id, true), `${GENERATED}/nodes/node_${node.id}_empty.png`);
  }

  const optional = manifest.optional ?? {};
  for (const file of optional.ui ?? []) {
    scene.load.image(uiKey(file.replace(/\.png$/, "")), `${GENERATED}/ui/${file}`);
  }
  for (const file of optional.effects ?? []) {
    scene.load.image(effectKey(file.replace(/\.png$/, "")), `${GENERATED}/effects/${file}`);
  }

  // A failed load must not stall boot; the placeholder pass covers it.
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    console.warn(`art: could not load ${file.key} (${file.url}) - using a placeholder`);
  });
}

// --------------------------------------------------------------------------
// Placeholders
// --------------------------------------------------------------------------

const RARITY_COLOUR: Record<string, number> = {
  common: PALETTE.dim,
  uncommon: PALETTE.skyGlow,
  rare: PALETTE.berry,
};

/** A rounded chip with a letter on it - enough to tell two items apart. */
function chip(
  scene: Phaser.Scene,
  key: string,
  size: number,
  fill: number,
  letter: string,
  shape: "round" | "square" | "diamond" = "round",
): void {
  if (scene.textures.exists(key)) return;

  const g = scene.add.graphics();
  const half = size / 2;

  g.fillStyle(PALETTE.shadow, 0.35);
  g.fillEllipse(half, size - 2, size * 0.7, 4);

  g.fillStyle(fill, 1);
  if (shape === "round") g.fillCircle(half, half, half - 2);
  else if (shape === "square") g.fillRoundedRect(2, 2, size - 4, size - 4, 3);
  else {
    g.fillPoints(
      [
        new Phaser.Geom.Point(half, 1),
        new Phaser.Geom.Point(size - 1, half),
        new Phaser.Geom.Point(half, size - 1),
        new Phaser.Geom.Point(1, half),
      ],
      true,
    );
  }

  g.lineStyle(1, PALETTE.night, 0.6);
  if (shape === "round") g.strokeCircle(half, half, half - 2);

  g.generateTexture(key, size, size);
  g.destroy();

  // The letter is a separate text render baked onto the chip.
  const text = scene.add
    .text(0, 0, letter.toUpperCase(), {
      fontFamily: "monospace",
      fontSize: `${Math.round(size * 0.5)}px`,
      color: hex(PALETTE.night),
    })
    .setOrigin(0.5);
  const render = scene.add.renderTexture(0, 0, size, size).setVisible(false);
  render.draw(key, 0, 0);
  render.draw(text, half, half);
  render.saveTexture(key);
  text.destroy();
}

/** Every placeholder the game might reach for. Cheap, and only drawn once. */
export function drawPlaceholders(scene: Phaser.Scene): void {
  for (const ing of INGREDIENTS) {
    chip(
      scene,
      ingredientKey(ing.id),
      16,
      RARITY_COLOUR[ing.rarity] ?? PALETTE.dim,
      ing.name[0] ?? "?",
      ing.skill === "prospecting" ? "diamond" : "round",
    );
  }

  for (const recipe of RECIPES) {
    chip(scene, dishKey(recipe.id), 20, PALETTE.parchment, recipe.name[0] ?? "?", "square");
  }

  // Nodes: a full tuft and a spent one per archetype, so the fallback keys
  // line up with the processed art.
  for (const ing of INGREDIENTS) {
    const accent = SECTIONS.find((s) => s.index === ing.section)?.accentColor ?? "#9a8f7a";
    const colour = Phaser.Display.Color.HexStringToColor(accent).color;
    nodeChip(scene, nodeKey(ing.node), colour, true);
    nodeChip(scene, nodeKey(ing.node, true), colour, false);
  }

  for (const name of ["scroll_card", "ribbon", "button", "slot", "xp_bar", "heat_bar"]) {
    panelChip(scene, uiKey(name), name);
  }

  for (const name of ["steam", "sizzle", "sparkle", "levelup"]) {
    effectStrip(scene, effectKey(name), name);
  }

}

function nodeChip(scene: Phaser.Scene, key: string, colour: number, full: boolean): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.shadow, 0.3);
  g.fillEllipse(8, 18, 12, 4);
  g.fillStyle(colour, full ? 1 : 0.5);
  g.fillRect(7, 10, 2, 8);
  if (full) {
    g.fillCircle(8, 7, 5);
    g.fillCircle(4, 10, 3);
    g.fillCircle(12, 10, 3);
  } else {
    g.fillCircle(8, 9, 2);
  }
  g.generateTexture(key, 16, 20);
  g.destroy();
}

function panelChip(scene: Phaser.Scene, key: string, name: string): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  const tall = name === "scroll_card";
  const w = tall ? 48 : 32;
  const h = name === "ribbon" ? 12 : tall ? 48 : 16;

  g.fillStyle(PALETTE.parchment, 1);
  g.fillRoundedRect(0, 0, w, h, 3);
  g.lineStyle(1, PALETTE.parchmentDark, 1);
  g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 3);
  if (name === "ribbon") {
    g.fillStyle(PALETTE.berry, 1);
    g.fillRect(0, 0, w, h);
  }
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Four frames in a row, matching the convention real effect art will use. */
function effectStrip(scene: Phaser.Scene, key: string, name: string): void {
  if (scene.textures.exists(key)) return;
  const size = 16;
  const frames = 4;
  const g = scene.add.graphics();

  const colour =
    name === "sizzle" ? PALETTE.saffron : name === "levelup" ? PALETTE.accent : PALETTE.parchment;

  for (let f = 0; f < frames; f += 1) {
    const ox = f * size;
    const grow = 1 + f * 0.6;
    g.fillStyle(colour, 0.9 - f * 0.2);
    if (name === "sizzle") {
      g.fillRect(ox + 7 - f, 8 - f, 2 + f, 2);
      g.fillRect(ox + 8, 7 + f, 2, 2);
    } else {
      g.fillCircle(ox + 8, 10 - f * 2, 2 * grow);
      if (f > 0) g.fillCircle(ox + 5, 12 - f, grow);
    }
  }

  g.generateTexture(key, size * frames, size);
  g.destroy();

  // Register the four frames so it can drive an animation directly.
  const texture = scene.textures.get(key);
  for (let f = 0; f < frames; f += 1) texture.add(f, 0, f * size, 0, size, size);
}

export function ingredientOf(id: string): Ingredient | undefined {
  return INGREDIENTS.find((i) => i.id === id);
}

export { recipeFile };
