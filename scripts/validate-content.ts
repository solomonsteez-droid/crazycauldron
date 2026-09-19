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
  AMBIENCE,
  CONFIG,
  INGREDIENTS,
  RECIPES,
  SECTIONS,
  SKILL_IDS,
  HUB_PORTALS,
  HUB_SPAWN,
  HUB_STATIONS,
  MAP_SIZE,
  decorFor,
  dressingFor,
  findIngredient,
  findPath,
  hubTileId,
  lifeFor,
  TERRAIN,
  validateAllLayouts,
  TileId,
  WARDROBE_ITEMS,
  isWalkable,
  isWalkableInSection,
  ingredientSlots,
  levelsFromXp,
  skillXpToReach,
  emptySkillXp,
  cookXpAwards,
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

/*
 * Starter recipes (those stating no requirements) are exempt from the technique
 * gate, or a new player could cook nothing at all. Every other recipe must
 * state a Firecraft level that already satisfies its own technique, so the
 * exemption never silently widens.
 */
const techniqueGate = new Map<string, number>();
for (const u of CONFIG.unlocks.firecraft) {
  if (u.kind === "technique") techniqueGate.set(String(u.value), u.level);
}
for (const r of RECIPES) {
  if (Object.keys(r.requirements).length === 0) continue;
  const gate = techniqueGate.get(r.technique);
  if (gate === undefined || gate <= 1) continue; // Level 1 is the floor everyone starts on.
  const stated = r.requirements.firecraft ?? 0;
  if (stated < gate) {
    note(
      `recipe ${r.id} states firecraft ${stated || "none"} but its technique "${r.technique}" needs ${gate}`,
    );
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

/*
 * The hub should not feel like three doors in a cupboard: stations must be at
 * least 4 tiles from each other and from the cauldron, and portals belong on
 * the outer edge rather than beside the plaza.
 */
const SPACING = 4;
const chebyshev = (a: { tileX: number; tileY: number }, b: { tileX: number; tileY: number }) =>
  Math.max(Math.abs(a.tileX - b.tileX), Math.abs(a.tileY - b.tileY));

for (let i = 0; i < HUB_STATIONS.length; i += 1) {
  const station = HUB_STATIONS[i]!;

  for (let j = i + 1; j < HUB_STATIONS.length; j += 1) {
    const other = HUB_STATIONS[j]!;
    const gap = chebyshev(station, other);
    if (gap < SPACING) note(`${station.id} and ${other.id} are only ${gap} tiles apart`);
  }

  // Distance to the cauldron block, which spans the middle 4x4 of the grid.
  const lo = MAP_SIZE / 2 - 2;
  const hi = MAP_SIZE / 2 + 1;
  const dx = Math.max(lo - station.tileX, 0, station.tileX - hi);
  const dy = Math.max(lo - station.tileY, 0, station.tileY - hi);
  const fromCauldron = Math.max(dx, dy);
  if (fromCauldron < SPACING) {
    note(`${station.id} is only ${fromCauldron} tiles from the cauldron`);
  }
}

/*
 * Nor should a station sit on the doorstep of the spawn: arriving in the hub
 * should mean walking somewhere, not already being there.
 */
for (const station of HUB_STATIONS) {
  const gap = chebyshev(station, HUB_SPAWN);
  if (gap < 3) note(`${station.id} is only ${gap} tiles from the hub spawn`);
}

for (const portal of HUB_PORTALS) {
  const edge = Math.min(
    portal.tileX,
    portal.tileY,
    MAP_SIZE - 1 - portal.tileX,
    MAP_SIZE - 1 - portal.tileY,
  );
  if (edge > 5) {
    note(`the portal to section ${portal.section} is ${edge} tiles in, not on the outer edge`);
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

/*
 * The deadlock guard. Cooking is the only source of Firecraft, Knifework and
 * Spicecraft XP, so if nothing at all is cookable on a fresh account the whole
 * progression never starts. This is what the starter-recipe exception exists
 * for; assert it actually works rather than trusting it.
 */
const startingSlots = ingredientSlots(startingLevels);
const openers = RECIPES.filter((r) => {
  const meetsStated = Object.entries(r.requirements).every(
    ([skill, level]) => startingLevels[skill as SkillId] >= level,
  );
  const isStarter = Object.keys(r.requirements).length === 0;
  const hasTechnique = isStarter || techniquesUnlocked(startingLevels).has(r.technique);
  return meetsStated && hasTechnique && r.ingredients.length <= startingSlots;
});
if (openers.length === 0) {
  note("a brand new player can cook nothing at all - progression can never start");
} else {
  console.log(`  note: a new player can cook ${openers.map((r) => r.id).join(", ")}`);
}

/*
 * Every skill must be able to earn its first XP.
 *
 * Firecraft, knifework and spicecraft are all cooking-only skills, so if the
 * only recipes paying a skill also require it above level 1, that skill is
 * pinned forever - and with it every unlock and recipe behind it.
 */
for (const skill of ["firecraft", "knifework", "spicecraft"] as const) {
  const reachable = openers.some((recipe) =>
    cookXpAwards(recipe, startingLevels, "common").some((a) => a.skill === skill && a.xp > 0),
  );
  if (!reachable) {
    note(`no recipe a new player can cook awards ${skill} XP - that skill can never leave level 1`);
  }
}

// --- ambience --------------------------------------------------------------

/*
 * The decoration has to hold together too. A villager wearing a hat that was
 * renamed, or a well placed on the kitchen doorstep, is exactly the kind of
 * thing that only shows up when someone loads the game and looks.
 */
const villagerIds = new Set<string>();
const hatIds = new Set(WARDROBE_ITEMS.filter((i) => i.kind === "hat").map((i) => i.id));
const apronIds = new Set(WARDROBE_ITEMS.filter((i) => i.kind === "apron").map((i) => i.id));

for (const villager of AMBIENCE.villagers.roster) {
  if (!SNAKE.test(villager.id)) note(`villager id is not snake_case: ${villager.id}`);
  if (villagerIds.has(villager.id)) note(`duplicate villager id: ${villager.id}`);
  villagerIds.add(villager.id);

  if (villager.body !== "male" && villager.body !== "female") {
    note(`villager ${villager.id} has body "${villager.body}", which is not a sheet`);
  }
  if (villager.hat && !hatIds.has(villager.hat)) {
    note(`villager ${villager.id} wears unknown hat ${villager.hat}`);
  }
  if (villager.apron && !apronIds.has(villager.apron)) {
    note(`villager ${villager.id} wears unknown apron ${villager.apron}`);
  }
  if (villager.lines.length === 0) note(`villager ${villager.id} has nothing to say`);
}

const crowd = AMBIENCE.villagers;
if (crowd.min > crowd.max) note(`villager min ${crowd.min} is above max ${crowd.max}`);
if (crowd.max > crowd.roster.length) {
  note(`up to ${crowd.max} villagers are wanted but only ${crowd.roster.length} are authored`);
}
if (crowd.stepMs <= 0) note("villagers step every 0ms, which would never move them");

const stationTiles = new Set(HUB_STATIONS.map((s) => `${s.tileX},${s.tileY}`));
const portalTiles = new Set(HUB_PORTALS.map((p) => `${p.tileX},${p.tileY}`));

for (const prop of AMBIENCE.hubProps.items) {
  const at = `${prop.tileX},${prop.tileY}`;
  if (!isWalkable(prop.tileX, prop.tileY)) {
    note(`hub prop ${prop.prop} at ${at} is off the walkable map`);
  }
  if (hubTileId(prop.tileX, prop.tileY) === TileId.Path) {
    note(`hub prop ${prop.prop} at ${at} stands on a path`);
  }
  if (stationTiles.has(at) || portalTiles.has(at)) {
    note(`hub prop ${prop.prop} at ${at} stands on a building or a gate`);
  }
}

for (const map of TERRAIN.maps) {
  const named = map.decor ?? [];
  const resolved = decorFor(map.map);
  if (named.length !== resolved.length) {
    const missing = named.filter((id) => !resolved.some((piece) => piece.id === id));
    note(`map ${map.map} lists decor its "${map.pack}" pack does not have: ${missing.join(", ")}`);
  }
  if (!dressingFor(map.map)) note(`map ${map.map} has terrain but no dressing settings`);
  if (!lifeFor(map.map)) note(`map ${map.map} has terrain but no ambient particles`);
}

const stops = AMBIENCE.dayNight.stops;
if (AMBIENCE.dayNight.cycleMinutes <= 0) note("the day-night cycle is zero minutes long");
if (stops.length < 2) note("the day-night cycle needs at least two stops to blend between");
if (stops[0]?.at !== 0 || stops[stops.length - 1]?.at !== 1) {
  note("the day-night stops must run from 0 to 1 so the loop joins up");
}
for (let i = 1; i < stops.length; i += 1) {
  if (stops[i]!.at <= stops[i - 1]!.at) {
    note(`day-night stop "${stops[i]!.label}" is not after "${stops[i - 1]!.label}"`);
  }
}
if (stops[0]?.tint !== stops[stops.length - 1]?.tint) {
  note("the day-night loop ends on a different colour than it starts, so it will jump");
}

const cueIds = new Set<string>();
for (const cue of AMBIENCE.sound.cues) {
  if (cueIds.has(cue.id)) note(`duplicate sound cue: ${cue.id}`);
  cueIds.add(cue.id);
  if (cue.tone <= 0 || cue.ms <= 0) note(`sound cue ${cue.id} has no fallback tone to play`);
}
for (const [channel, level] of Object.entries(AMBIENCE.sound.defaults)) {
  if (level < 0 || level > 1) note(`default ${channel} volume ${level} is outside 0..1`);
}

// --- layout ----------------------------------------------------------------

/*
 * The same check the server runs before it will start. Here too, so a bad
 * placement is caught by the content pass rather than by a failed deploy.
 */
for (const problem of validateAllLayouts()) {
  note(`map ${problem.map}: ${problem.message}`);
}

// --- report ----------------------------------------------------------------
console.log(
  `content: ${INGREDIENTS.length} ingredients, ${RECIPES.length} recipes, ${SECTIONS.length} sections, ${SECTIONS.reduce((n, s) => n + s.nodes.length, 0)} nodes`,
);
console.log(
  `ambience: ${AMBIENCE.villagers.roster.length} villagers, ${AMBIENCE.hubProps.items.length} hub props, ${TERRAIN.maps.reduce((n, m) => n + decorFor(m.map).length, 0)} decor pieces`,
);

if (problems.length === 0) {
  console.log("validate-content: OK");
} else {
  console.error(`\nvalidate-content: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}
