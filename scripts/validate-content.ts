/**
 * Checks the JSON content files hang together.
 *
 * Types catch the shape of the data; this catches the meaning - a recipe
 * pointing at an ingredient that does not exist, a node placed inside a rock,
 * a technique no level ever unlocks, or a recipe nobody can ever cook because
 * it needs more ingredient slots than knifework 20 grants.
 *
 *   npx tsx scripts/validate-content.ts
 */

import {
  CONFIG,
  INGREDIENTS,
  RECIPES,
  SECTIONS,
  SKILL_IDS,
  HUB_PORTALS,
  HUB_STATIONS,
  findIngredient,
  findPath,
  isWalkable,
  isWalkableInSection,
  ingredientSlots,
  levelsFromXp,
  skillXpToReach,
  emptySkillXp,
  techniquesUnlocked,
  type SkillId,
} from "@crazycauldron/shared";

const problems: string[] = [];
const note = (message: string) => problems.push(message);

const SNAKE = /^[a-z][a-z0-9_]*$/;

// --- ids -------------------------------------------------------------------
const ingredientIds = new Set<string>();
for (const ing of INGREDIENTS) {
  if (!SNAKE.test(ing.id)) note(`ingredient id is not snake_case: ${ing.id}`);
  if (ingredientIds.has(ing.id)) note(`duplicate ingredient id: ${ing.id}`);
  ingredientIds.add(ing.id);
  if (ing.section < 1 || ing.section > SECTIONS.length) {
    note(`ingredient ${ing.id} has section ${ing.section}, which does not exist`);
  }
}

const recipeIds = new Set<string>();
for (const r of RECIPES) {
  if (!SNAKE.test(r.id)) note(`recipe id is not snake_case: ${r.id}`);
  if (recipeIds.has(r.id)) note(`duplicate recipe id: ${r.id}`);
  recipeIds.add(r.id);

  for (const item of r.ingredients) {
    if (!findIngredient(item.id)) note(`recipe ${r.id} uses unknown ingredient ${item.id}`);
    if (item.qty < 1) note(`recipe ${r.id} asks for ${item.qty} of ${item.id}`);
    if (findIngredient(item.id)?.edible === false) {
      note(`recipe ${r.id} cooks with ${item.id}, which is not edible`);
    }
  }
  for (const skill of Object.keys(r.requirements)) {
    if (!(SKILL_IDS as string[]).includes(skill)) {
      note(`recipe ${r.id} requires unknown skill ${skill}`);
    }
  }
}

// --- techniques ------------------------------------------------------------
const maxLevels = Object.fromEntries(
  SKILL_IDS.map((s) => [s, CONFIG.skills.maxLevel]),
) as Record<SkillId, number>;
const everyTechnique = techniquesUnlocked(maxLevels);
for (const r of RECIPES) {
  if (!everyTechnique.has(r.technique)) {
    note(`recipe ${r.id} uses technique "${r.technique}", which no level unlocks`);
  }
}

// --- ingredient slots ------------------------------------------------------
const maxSlots = ingredientSlots(maxLevels);
for (const r of RECIPES) {
  const distinct = r.ingredients.length;
  if (distinct > maxSlots) {
    note(`recipe ${r.id} needs ${distinct} slots but knifework tops out at ${maxSlots}`);
  }
}

/**
 * Slot limits are a second gate on top of each recipe's own requirements, so a
 * recipe can list knifework 9 yet still need knifework 10 to fit its
 * ingredients. Worth surfacing rather than leaving for a player to discover.
 */
for (const r of RECIPES) {
  const distinct = r.ingredients.length;
  let needed = 1;
  for (let level = 1; level <= CONFIG.skills.maxLevel; level += 1) {
    const levels = { ...maxLevels, knifework: level };
    if (ingredientSlots(levels) >= distinct) {
      needed = level;
      break;
    }
  }
  const stated = r.requirements.knifework ?? 0;
  if (needed > stated) {
    console.log(
      `  note: ${r.id} lists knifework ${stated || "none"} but its ${distinct} ingredients need knifework ${needed}`,
    );
  }
}

// --- maps ------------------------------------------------------------------
for (const station of HUB_STATIONS) {
  if (!isWalkable(station.tileX, station.tileY)) {
    note(`hub station ${station.id} sits on an unwalkable tile`);
  }
}
for (const portal of HUB_PORTALS) {
  if (!isWalkable(portal.tileX, portal.tileY)) {
    note(`hub portal to section ${portal.section} sits on an unwalkable tile`);
  }
}

for (const sec of SECTIONS) {
  const walkable = (x: number, y: number) => isWalkableInSection(sec.index, x, y);

  if (!walkable(sec.spawn.tileX, sec.spawn.tileY)) note(`${sec.id}: spawn is not walkable`);
  if (!walkable(sec.returnPortal.tileX, sec.returnPortal.tileY)) {
    note(`${sec.id}: return portal is not walkable`);
  }
  if (sec.nodes.length !== 12) note(`${sec.id}: has ${sec.nodes.length} nodes, expected 12`);

  const seen = new Set<string>();
  let rare = 0;
  for (const node of sec.nodes) {
    if (seen.has(node.id)) note(`${sec.id}: duplicate node id ${node.id}`);
    seen.add(node.id);

    const ing = findIngredient(node.ingredient);
    if (!ing) {
      note(`${sec.id}: node ${node.id} yields unknown ingredient ${node.ingredient}`);
      continue;
    }
    if (ing.section !== sec.index) {
      note(`${sec.id}: node ${node.id} yields ${ing.id}, which belongs to section ${ing.section}`);
    }
    if (ing.rarity === "rare") rare += 1;

    if (!walkable(node.tileX, node.tileY)) {
      note(`${sec.id}: node ${node.id} is on an unwalkable tile`);
    } else if (
      node.tileX !== sec.spawn.tileX ||
      node.tileY !== sec.spawn.tileY
    ) {
      const path = findPath(sec.spawn, { tileX: node.tileX, tileY: node.tileY }, walkable);
      if (path.length === 0) note(`${sec.id}: node ${node.id} is unreachable from the spawn`);
    }
  }

  if (rare > CONFIG.gathering.maxRareNodesPerSection) {
    note(`${sec.id}: ${rare} rare nodes, cap is ${CONFIG.gathering.maxRareNodesPerSection}`);
  }
}

// --- reachable progression -------------------------------------------------
// Every recipe should be cookable by a maxed player; anything else is content
// that can never be reached.
for (const r of RECIPES) {
  for (const [skill, level] of Object.entries(r.requirements)) {
    if (level > CONFIG.skills.maxLevel) {
      note(`recipe ${r.id} requires ${skill} ${level}, above the cap of ${CONFIG.skills.maxLevel}`);
    }
  }
}

const startingLevels = levelsFromXp(emptySkillXp());
if (startingLevels.firecraft !== 1) note("a new player does not start at firecraft 1");
if (skillXpToReach(1) !== 0) note("level 1 should cost no XP");

// --- report ----------------------------------------------------------------
console.log(
  `content: ${INGREDIENTS.length} ingredients, ${RECIPES.length} recipes, ${SECTIONS.length} sections, ${SECTIONS.reduce((n, s) => n + s.nodes.length, 0)} nodes`,
);

if (problems.length === 0) {
  console.log("validate-content: OK");
} else {
  console.error(`\nvalidate-content: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}
