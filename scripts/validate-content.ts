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
  AREAS,
  HUB_MAP,
  ALL_WARDROBE_ITEMS,
  DORMANT_SHOP_ITEMS,
  DORMANT_WARDROBE_ITEMS,
  SHOP_ITEMS,
  WARDROBE_ITEMS,
  areaFor,
  findPath,
  isWalkableOn,
  lifeFor,
  nodesOf,
  villagerGround,
  zonesOf,
  CONFIG,
  INGREDIENTS,
  RECIPES,
  SECTIONS,
  SKILL_IDS,
  findIngredient,
  validateAllLayouts,
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

// --- what each section grows -----------------------------------------------

/*
 * Where anything stands is checked in shared/src/layout.ts against the painted
 * maps, and again below where nodes have to be walkable to. What is left here
 * is what a section *is*: twelve nodes, each yielding something that belongs to
 * it, and no more rare ones than the cap allows.
 */
for (const sec of SECTIONS) {
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
 * renamed is exactly the kind of thing that only shows up when somebody loads
 * the game and looks.
 */
const villagerIds = new Set<string>();
const hatIds = new Set(WARDROBE_ITEMS.filter((i) => i.kind === "hat").map((i) => i.id));
/*
 * Dormant, and still checked. A villager's cloak is not drawn while the slot
 * is off, but the assignment is kept - and an id that stops resolving is a
 * rename nobody finished, which is worth catching now rather than on the day
 * the slot comes back.
 */
const cloakIds = new Set(ALL_WARDROBE_ITEMS.filter((i) => i.kind === "cloak").map((i) => i.id));

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
  if (villager.cloak && !cloakIds.has(villager.cloak)) {
    note(`villager ${villager.id} wears unknown cloak ${villager.cloak}`);
  }
  if (villager.lines.length === 0) note(`villager ${villager.id} has nothing to say`);
}

const crowd = AMBIENCE.villagers;
if (crowd.min > crowd.max) note(`villager min ${crowd.min} is above max ${crowd.max}`);
if (crowd.max > crowd.roster.length) {
  note(`up to ${crowd.max} villagers are wanted but only ${crowd.roster.length} are authored`);
}
if (crowd.stepMs <= 0) note("villagers step every 0ms, which would never move them");

const ground = villagerGround();
if (ground.length < crowd.max * 4) {
  note(`villagers have only ${ground.length} legal cells to walk in the hub`);
}

for (const area of AREAS) {
  if (!lifeFor(area.map)) note(`${area.id} has no ambient particles authored`);
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

// --- the painted areas -----------------------------------------------------

/*
 * Every node has to be reachable from the spawn, on foot, with the same
 * pathfinder the server uses. Walkable is not the same as reachable: a node on
 * an island of grass behind a stream passes every other check and cannot be
 * gathered.
 */
for (const area of AREAS) {
  const spawn = { tileX: area.spawn.col, tileY: area.spawn.row };
  const walk = (x: number, y: number) => isWalkableOn(area.map, x, y);

  for (const node of nodesOf(area.map)) {
    const beside: { tileX: number; tileY: number }[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (walk(node.c + dx, node.r + dy)) beside.push({ tileX: node.c + dx, tileY: node.r + dy });
      }
    }
    if (beside.length === 0) {
      note(`${area.id}: nothing can stand beside node ${node.id}`);
      continue;
    }
    const reachable = beside.some(
      (tile) =>
        (tile.tileX === spawn.tileX && tile.tileY === spawn.tileY) ||
        findPath(spawn, tile, walk).length > 0,
    );
    if (!reachable) note(`${area.id}: node ${node.id} cannot be walked to from the spawn`);
  }

  for (const zone of zonesOf(area.map)) {
    if (zone.kind === "scenery") continue;
    if (zone.name === "" && zone.kind === "portal") {
      note(`${area.id}: portal ${zone.id} has no name to show`);
    }
  }
}

if (areaFor(HUB_MAP).nodes.length > 0) note("the hub has gather nodes, which it should not");

// --- layout ----------------------------------------------------------------

/*
 * The same check the server runs before it will start. Here too, so a bad
 * placement is caught by the content pass rather than by a failed deploy.
 */
for (const problem of validateAllLayouts()) {
  note(`map ${problem.map}: ${problem.message}`);
}

// --- the shop --------------------------------------------------------------

/*
 * The shop sells shortcuts, not exclusives. Everything in it must be a
 * cosmetic somebody could also earn, and must not be a tier garment: those are
 * held rather than owned, and buying one would spend the balance that grants
 * it - a purchase that revokes itself.
 */
const shopSeen = new Set<string>();
for (const item of SHOP_ITEMS) {
  const wardrobe = WARDROBE_ITEMS.find((w) => w.id === item.itemId);
  if (!wardrobe) {
    const dormant = DORMANT_WARDROBE_ITEMS.some((w) => w.id === item.itemId);
    note(
      dormant
        ? `the shop sells ${item.itemId}, which belongs to a dormant slot - nobody could wear it`
        : `the shop sells ${item.itemId}, which is not a wardrobe item`,
    );
    continue;
  }
  if (wardrobe.unlock.type === "tier") {
    note(`the shop sells ${item.itemId}, a tier garment - buying it would revoke it`);
  }
  if (wardrobe.unlock.type === "start") {
    note(`the shop sells ${item.itemId}, which every player already starts with`);
  }
  if (item.cook <= 0) note(`${item.itemId} is priced at ${item.cook} $COOK`);
  if (item.cook % 2 !== 0) {
    note(`${item.itemId} costs ${item.cook} $COOK, which cannot be halved into whole tokens`);
  }
  if (shopSeen.has(item.itemId)) note(`the shop lists ${item.itemId} twice`);
  shopSeen.add(item.itemId);
}

// --- what is switched off --------------------------------------------------

/*
 * Dormant content is still content. It is not evaluated, which means nothing
 * else would notice it rotting - a duplicate id, a price that cannot be
 * halved, a garment that is dormant in one file and live in another. Checking
 * it costs nothing and is the difference between switching a slot back on and
 * excavating it.
 */
const liveIds = new Set(WARDROBE_ITEMS.map((i) => i.id));
for (const item of DORMANT_WARDROBE_ITEMS) {
  if (liveIds.has(item.id)) note(`${item.id} is both live and dormant`);
  if (!SNAKE.test(item.id)) note(`dormant wardrobe id is not snake_case: ${item.id}`);
  if (!item.name) note(`dormant item ${item.id} has no name`);
}

const dormantIds = new Set(DORMANT_WARDROBE_ITEMS.map((i) => i.id));
for (const item of DORMANT_SHOP_ITEMS) {
  if (!dormantIds.has(item.itemId) && !liveIds.has(item.itemId)) {
    note(`the dormant shop prices ${item.itemId}, which is not a wardrobe item at all`);
  }
  if (item.cook % 2 !== 0) {
    note(`dormant ${item.itemId} costs ${item.cook} $COOK, which cannot be halved`);
  }
}

// --- report ----------------------------------------------------------------
console.log(
  `content: ${INGREDIENTS.length} ingredients, ${RECIPES.length} recipes, ${SECTIONS.length} sections, ${SECTIONS.reduce((n, s) => n + s.nodes.length, 0)} nodes`,
);
console.log(
  `maps: ${AREAS.length} painted areas, ${AREAS.reduce((n, a) => n + a.zones.length, 0)} zones, ` +
    `${AREAS.reduce((n, a) => n + a.nodes.length, 0)} placed nodes`,
);
console.log(
  `ambience: ${AMBIENCE.villagers.roster.length} villagers, ${villagerGround().length} cells they may walk`,
);
console.log(
  `shop: ${SHOP_ITEMS.length} cosmetics for $COOK, ${DORMANT_SHOP_ITEMS.length} priced but dormant`,
);
console.log(
  `wardrobe: ${WARDROBE_ITEMS.length} items worn, ${DORMANT_WARDROBE_ITEMS.length} kept for a slot that is switched off`,
);

if (problems.length === 0) {
  console.log("validate-content: OK");
} else {
  console.error(`\nvalidate-content: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}
