/**
 * The one place the JSON content files are read.
 *
 * Both runtimes load these the same way: Vite inlines the JSON for the browser
 * and Node parses it through the import attribute. Everything downstream -
 * server, client and the progression simulation - goes through the lookup maps
 * below, so tuning a number never means touching code.
 */

import ingredientsJson from "./ingredients.json" with { type: "json" };
import recipesJson from "./recipes.json" with { type: "json" };
import sectionsJson from "./sections.json" with { type: "json" };
import skillsJson from "./skills.json" with { type: "json" };
import type {
  GatherNodeDef,
  Ingredient,
  Recipe,
  Section,
  SectionsFile,
  SkillId,
  SkillsFile,
} from "./types.js";

export * from "./types.js";

export const INGREDIENTS = ingredientsJson as Ingredient[];
export const RECIPES = recipesJson as Recipe[];
export const CONFIG = skillsJson as unknown as SkillsFile;

const sectionsFile = sectionsJson as unknown as SectionsFile;
export const SECTIONS = sectionsFile.sections;
export const HUB_STATIONS = sectionsFile.hub.stations;
export const HUB_PORTALS = sectionsFile.hub.portals;

export const SKILL_IDS = CONFIG.skills.list;

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
