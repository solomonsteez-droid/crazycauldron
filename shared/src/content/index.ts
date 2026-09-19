/**
 * The one place the JSON content files are read.
 *
 * Both runtimes load these the same way: Vite inlines the JSON for the browser
 * and Node parses it through the import attribute. Everything downstream -
 * server, client and the progression simulation - goes through the lookup maps
 * below, so tuning a number never means touching code.
 */

import ambienceJson from "./ambience.json" with { type: "json" };
import ingredientsJson from "./ingredients.json" with { type: "json" };
import recipesJson from "./recipes.json" with { type: "json" };
import sectionsJson from "./sections.json" with { type: "json" };
import shopJson from "./shop.json" with { type: "json" };
import skillsJson from "./skills.json" with { type: "json" };
import terrainJson from "./terrain.json" with { type: "json" };
import type {
  AmbienceFile,
  DecorPiece,
  GatherNodeDef,
  TerrainFile,
  Ingredient,
  Recipe,
  Section,
  SectionsFile,
  ShopFile,
  ShopItem,
  SkillId,
  SkillsFile,
} from "./types.js";

export * from "./types.js";

export const INGREDIENTS = ingredientsJson as Ingredient[];
export const RECIPES = recipesJson as Recipe[];
export const CONFIG = skillsJson as unknown as SkillsFile;

const sectionsFile = sectionsJson as unknown as SectionsFile;
export const SECTIONS = sectionsFile.sections;

export const SKILL_IDS = CONFIG.skills.list;

export const TERRAIN = terrainJson as unknown as TerrainFile;

/** What the shop sells, when the shop is on. */
export const SHOP_ITEMS: ShopItem[] = (shopJson as unknown as ShopFile).items;

/** The price of one cosmetic in whole $COOK, or undefined if it is not sold. */
export function shopPrice(itemId: string): number | undefined {
  return SHOP_ITEMS.find((item) => item.itemId === itemId)?.cook;
}

/** Terrain settings for a map id, falling back to the hub's. */
export function terrainFor(mapId: number) {
  return TERRAIN.maps.find((m) => m.map === mapId) ?? TERRAIN.maps[0]!;
}

/**
 * The scenery a map may be dressed with, resolved through its pack.
 *
 * A map names decor ids; the pack owns the files. Anything a map asks for that
 * its pack does not have is dropped here rather than failing a build, so
 * retiring one piece of art never breaks a map that still lists it.
 */
export function decorFor(mapId: number): DecorPiece[] {
  const map = terrainFor(mapId);
  const pieces = TERRAIN.decor[map.pack] ?? [];
  const wanted = map.decor ?? [];
  return wanted
    .map((id) => pieces.find((piece) => piece.id === id))
    .filter((piece): piece is DecorPiece => piece !== undefined);
}

export const AMBIENCE = ambienceJson as unknown as AmbienceFile;

/** Particle settings for a map, or null when it has none authored. */
export function lifeFor(mapId: number) {
  return AMBIENCE.life.maps.find((m) => m.map === mapId) ?? null;
}



const ingredientById = new Map(INGREDIENTS.map((i) => [i.id, i]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));
const sectionByIndex = new Map(SECTIONS.map((s) => [s.index, s]));
const nodeById = new Map<string, { node: GatherNodeDef; section: Section }>();
for (const section of SECTIONS) {
  for (const node of section.nodes) nodeById.set(node.id, { node, section });
}

/** Throws rather than returning undefined: a missing id is a content bug, not input. */
export function ingredient(id: string): Ingredient {
  const found = ingredientById.get(id);
  if (!found) throw new Error(`Unknown ingredient id: ${id}`);
  return found;
}

export function findIngredient(id: string): Ingredient | undefined {
  return ingredientById.get(id);
}

export function recipe(id: string): Recipe {
  const found = recipeById.get(id);
  if (!found) throw new Error(`Unknown recipe id: ${id}`);
  return found;
}

export function findRecipe(id: string): Recipe | undefined {
  return recipeById.get(id);
}

export function section(index: number): Section {
  const found = sectionByIndex.get(index);
  if (!found) throw new Error(`Unknown section index: ${index}`);
  return found;
}

export function findSection(index: number): Section | undefined {
  return sectionByIndex.get(index);
}

export function findNode(nodeId: string): { node: GatherNodeDef; section: Section } | undefined {
  return nodeById.get(nodeId);
}

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as string[]).includes(value);
}

/** Recipes a given section's kitchen list should show, in the order authored. */
export function recipesForSection(index: number): Recipe[] {
  return RECIPES.filter((r) => r.section === index);
}
