/**
 * Levels, XP curves and everything a level unlocks.
 *
 * Pure functions over plain numbers, deliberately free of any server or client
 * import: the server computes rewards with these, the client renders panels
 * with these, and scripts/simulate-progression.ts tunes the curve with these.
 * One implementation means the three can never disagree about what a level
 * grants.
 */

import {
  CONFIG,
  SKILL_IDS,
  findIngredient,
  type GatherSkillId,
  type Ingredient,
  type Quality,
  type SkillId,
  type SkillRequirements,
  type Technique,
  type Unlock,
} from "./content/index.js";

/** Level -> XP for every skill, and separately for the chef track. */
export type SkillLevels = Record<SkillId, number>;
export type SkillXp = Record<SkillId, number>;

function buildCumulative(base: number, growth: number, maxLevel: number): number[] {
  // cumulative[L] = total XP needed to *be* level L. Level 1 costs nothing.
  const cumulative = [0, 0];
  let step = base;
  for (let level = 2; level <= maxLevel; level += 1) {
    cumulative[level] = Math.round((cumulative[level - 1] ?? 0) + step);
    step *= growth;
  }
  return cumulative;
}

const SKILL_CUMULATIVE = buildCumulative(
  CONFIG.skills.baseXp,
  CONFIG.skills.growth,
  CONFIG.skills.maxLevel,
);
const CHEF_CUMULATIVE = buildCumulative(CONFIG.chef.baseXp, CONFIG.chef.growth, CONFIG.chef.maxLevel);

function levelForXp(cumulative: number[], maxLevel: number, xp: number): number {
  let level = 1;
  while (level < maxLevel && xp >= (cumulative[level + 1] ?? Infinity)) level += 1;
  return level;
}

export const SKILL_MAX_LEVEL = CONFIG.skills.maxLevel;
export const CHEF_MAX_LEVEL = CONFIG.chef.maxLevel;

export function skillLevelForXp(xp: number): number {
  return levelForXp(SKILL_CUMULATIVE, SKILL_MAX_LEVEL, xp);
}

export function chefLevelForXp(xp: number): number {
  return levelForXp(CHEF_CUMULATIVE, CHEF_MAX_LEVEL, xp);
}

/** Total XP required to be at `level`. */
export function skillXpToReach(level: number): number {
  return SKILL_CUMULATIVE[Math.min(Math.max(level, 1), SKILL_MAX_LEVEL)] ?? 0;
}

export function chefXpToReach(level: number): number {
  return CHEF_CUMULATIVE[Math.min(Math.max(level, 1), CHEF_MAX_LEVEL)] ?? 0;
}

export interface LevelProgress {
  level: number;
  /** XP into the current level, and what the level costs end to end. */
  intoLevel: number;
  levelSpan: number;
  /** 0..1, for a progress bar. 1 when maxed. */
  fraction: number;
  maxed: boolean;
}

function progress(cumulative: number[], maxLevel: number, xp: number): LevelProgress {
  const level = levelForXp(cumulative, maxLevel, xp);
  if (level >= maxLevel) {
    return { level, intoLevel: 0, levelSpan: 0, fraction: 1, maxed: true };
  }
  const floor = cumulative[level] ?? 0;
  const ceiling = cumulative[level + 1] ?? floor;
  const span = Math.max(ceiling - floor, 1);
  const into = Math.max(xp - floor, 0);
  return { level, intoLevel: into, levelSpan: span, fraction: into / span, maxed: false };
}

export function skillProgress(xp: number): LevelProgress {
  return progress(SKILL_CUMULATIVE, SKILL_MAX_LEVEL, xp);
}

export function chefProgress(xp: number): LevelProgress {
  return progress(CHEF_CUMULATIVE, CHEF_MAX_LEVEL, xp);
}

export function emptySkillXp(): SkillXp {
  return { foraging: 0, prospecting: 0, knifework: 0, firecraft: 0, spicecraft: 0 };
}

export function levelsFromXp(xp: SkillXp): SkillLevels {
  return {
    foraging: skillLevelForXp(xp.foraging),
    prospecting: skillLevelForXp(xp.prospecting),
    knifework: skillLevelForXp(xp.knifework),
    firecraft: skillLevelForXp(xp.firecraft),
    spicecraft: skillLevelForXp(xp.spicecraft),
  };
}

// --------------------------------------------------------------------------
// Unlocks
// --------------------------------------------------------------------------

function meetsRequires(requires: SkillRequirements | undefined, levels: SkillLevels): boolean {
  if (!requires) return true;
  return SKILL_IDS.every((skill) => (levels[skill] ?? 1) >= (requires[skill] ?? 0));
}

/** Every unlock a player has actually earned, including cross-skill requirements. */
export function earnedUnlocks(skill: SkillId, levels: SkillLevels): Unlock[] {
  return CONFIG.unlocks[skill].filter(
    (u) => levels[skill] >= u.level && meetsRequires(u.requires, levels),
  );
}

function allEarned(levels: SkillLevels): { skill: SkillId; unlock: Unlock }[] {
  return SKILL_IDS.flatMap((skill) =>
    earnedUnlocks(skill, levels).map((unlock) => ({ skill, unlock })),
  );
}

export interface PendingUnlock {
  skill: SkillId;
  unlock: Unlock;
  levelsAway: number;
  xpAway: number;
}

/** The next thing this one skill will grant, or null when it is maxed out. */
export function nextUnlockForSkill(
  skill: SkillId,
  levels: SkillLevels,
  xp: number,
): PendingUnlock | null {
  const level = levels[skill];
  const upcoming = CONFIG.unlocks[skill]
    .filter((u) => u.level > level)
    .sort((a, b) => a.level - b.level)[0];
  if (!upcoming) return null;
  return {
    skill,
    unlock: upcoming,
    levelsAway: upcoming.level - level,
    xpAway: Math.max(skillXpToReach(upcoming.level) - xp, 0),
  };
}

/**
 * The closest unlock across every skill - the HUD's "next goal".
 * Ranked by XP remaining rather than levels, so the line points at the thing
 * actually within reach rather than whichever skill happens to be cheapest.
 */
export function nextGoal(levels: SkillLevels, xp: SkillXp): PendingUnlock | null {
  const candidates = SKILL_IDS.map((skill) => nextUnlockForSkill(skill, levels, xp[skill])).filter(
    (c): c is PendingUnlock => c !== null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.xpAway < best.xpAway ? c : best));
}

/** "Simmer unlocks in 1 Firecraft level" */
export function describeUnlock(pending: PendingUnlock): string {
  const skillName = CONFIG.skills.names[pending.skill];
  const plural = pending.levelsAway === 1 ? "level" : "levels";
  return `${pending.unlock.label} unlocks in ${pending.levelsAway} ${skillName} ${plural}`;
}

// --------------------------------------------------------------------------
// Derived stats
// --------------------------------------------------------------------------

/**
 * "Every other level gives +2% to that skill's core stat": levels that carry no
 * explicit unlock are the ones that pay out the flat bonus.
 */
export function coreStatBonusPct(skill: SkillId, levels: SkillLevels): number {
  const level = levels[skill];
  const withUnlocks = new Set(CONFIG.unlocks[skill].map((u) => u.level));
  let bonus = 0;
  for (let l = 2; l <= level; l += 1) {
    if (!withUnlocks.has(l)) bonus += CONFIG.skills.coreStat[skill].perLevelPct;
  }
  return bonus;
}

export function techniquesUnlocked(levels: SkillLevels): Set<Technique> {
  const set = new Set<Technique>();
  for (const { unlock } of allEarned(levels)) {
    if (unlock.kind === "technique") set.add(unlock.value as Technique);
  }
  return set;
}

export function maxPots(levels: SkillLevels): number {
  let pots = 1;
  for (const u of earnedUnlocks("firecraft", levels)) {
    if (u.kind === "pots") pots = Math.max(pots, u.value as number);
  }
  return pots;
}

/** Distinct ingredients a recipe may use. Gates the five-ingredient recipes. */
export function ingredientSlots(levels: SkillLevels): number {
  let slots = 0;
  for (const u of earnedUnlocks("knifework", levels)) {
    if (u.kind === "slots") slots = Math.max(slots, u.value as number);
  }
  return slots;
}

/** Best quality the player's prep can reach, before spicecraft adjustments. */
export function prepQualityCap(levels: SkillLevels): Quality {
  let cap: Quality = "common";
  for (const u of earnedUnlocks("knifework", levels)) {
    if (u.kind === "prepQuality") cap = u.value as Quality;
  }
  return cap;
}

export function autoPrepSections(levels: SkillLevels): Set<number> {
  const set = new Set<number>();
  for (const u of earnedUnlocks("knifework", levels)) {
    if (u.kind === "autoPrep") set.add(u.value as number);
  }
  return set;
}

export function carrySlots(levels: SkillLevels, bagTier: number): number {
  let slots = CONFIG.economy.inventory.baseSlots;
  for (const skill of SKILL_IDS) {
    for (const u of earnedUnlocks(skill, levels)) {
      if (u.kind === "carrySlots") slots += u.value as number;
    }
  }
  for (const bag of CONFIG.economy.bag) {
    if (bag.tier > 0 && bag.tier <= bagTier) slots += bag.slots;
  }
  return slots;
}

/**
 * Multiplier applied to gathering time. Unlock bonuses, the skill's core stat
 * and the well-fed buff all stack additively, which keeps the numbers legible.
 */
export function gatherSpeedMultiplier(
  levels: SkillLevels,
  skill: GatherSkillId,
  buffActive: boolean,
): number {
  let pct = coreStatBonusPct(skill, levels);
  for (const u of earnedUnlocks(skill, levels)) {
    if (u.kind === "gatherSpeed") pct += u.value as number;
  }
  if (buffActive) pct += CONFIG.economy.buff.gatherSpeedPct;
  return 1 + pct / 100;
}

export function gatherDurationMs(
  levels: SkillLevels,
  skill: GatherSkillId,
  buffActive: boolean,
): number {
  const base = CONFIG.gathering.baseMs[skill];
  return Math.round(base / gatherSpeedMultiplier(levels, skill, buffActive));
}

export function cookDurationMs(levels: SkillLevels): number {
  const bonus = coreStatBonusPct("firecraft", levels);
  return Math.round(CONFIG.cooking.cookMs / (1 + bonus / 100));
}

/**
 * Half-width of the Superb window as a percentage of the bar.
 *
 * Firecraft sets the base (12% at 1, 40% at 20). The pan adds flat percentage
 * points on top, and knifework's core stat scales the result - blade precision
 * reads as "the window you already have, but finer".
 */
export function timingWindowPct(levels: SkillLevels, panTier: number): number {
  const { windowPctAtLevel1, windowPctAtLevel20 } = CONFIG.cooking;
  const span = SKILL_MAX_LEVEL - 1;
  const t = Math.min(Math.max(levels.firecraft - 1, 0), span) / span;
  const base = windowPctAtLevel1 + (windowPctAtLevel20 - windowPctAtLevel1) * t;

  const pan = CONFIG.economy.pan.find((p) => p.tier === panTier);
  const withPan = base + (pan?.windowBonusPct ?? 0);
  const blade = 1 + coreStatBonusPct("knifework", levels) / 100;
  return Math.min(withPan * blade, 100);
}


/**
 * The two bands on the heat bar, as positions rather than widths.
 *
 * The widths alone were not enough, and at high Firecraft they stopped being
 * usable at all. `timingWindowPct` reaches about 40 at Firecraft 20, and Fine
 * is 3.95 times that - 158% of a bar that is 100% wide. Drawn from a centre
 * and a half-width, both ends ran off the track; judged from the same numbers,
 * the server was scoring against a window nobody could see the edges of.
 *
 * So the widths are clamped, the centre is chosen so the wider band fits, and
 * what comes out is four numbers between 0 and 1. The client draws exactly
 * those and the server judges exactly those, which is the only way the drawn
 * zone and the scored zone cannot drift apart.
 */
export const MAX_SUPERB_WINDOW_PCT = 45;
export const MAX_FINE_WINDOW_PCT = 90;

/**
 * How far the centre stays from either end, at minimum.
 *
 * A window hard against the edge is reachable only at the moment the marker
 * turns around, which is a different game from the one the rest of the bar is
 * playing.
 */
const MIN_CENTRE_MARGIN = 0.1;

export interface HeatWindows {
  centre: number;
  /** Full widths, as a percentage of the bar, after clamping. */
  superbPct: number;
  finePct: number;
  /** The bands themselves, 0..1 along the bar. */
  superbFrom: number;
  superbTo: number;
  fineFrom: number;
  fineTo: number;
}

/**
 * Clamps the two widths and lays them out around a centre.
 *
 * Fine is never narrower than Superb - it contains it - and never wider than
 * the cap, so a maxed-out player gets a band they can see rather than a bar
 * that is entirely window.
 */
export function heatWindows(rawWindowPct: number, centre: number): HeatWindows {
  const superbPct = Math.min(Math.max(rawWindowPct, 0), MAX_SUPERB_WINDOW_PCT);
  const finePct = Math.min(
    Math.max(rawWindowPct * CONFIG.cooking.fineWindowMultiplier, superbPct),
    MAX_FINE_WINDOW_PCT,
  );

  const superbHalf = superbPct / 200;
  const fineHalf = finePct / 200;
  const clamp = (n: number) => Math.min(Math.max(n, 0), 1);

  return {
    centre,
    superbPct,
    finePct,
    superbFrom: clamp(centre - superbHalf),
    superbTo: clamp(centre + superbHalf),
    fineFrom: clamp(centre - fineHalf),
    fineTo: clamp(centre + fineHalf),
  };
}

/**
 * Where to put the window so the whole of it is on the bar.
 *
 * `roll` is 0..1 from the caller's own generator, so the server can seed this
 * however it likes and a test can pin it.
 */
export function pickWindowCentre(finePct: number, roll: number): number {
  const margin = Math.min(Math.max(finePct / 200, MIN_CENTRE_MARGIN), 0.5);
  return margin + roll * Math.max(1 - 2 * margin, 0);
}

/** Which band a stopped marker landed in. Bounds, not distances - see above. */
export function qualityForPosition(windows: HeatWindows, markerPos: number): Quality {
  if (markerPos >= windows.superbFrom && markerPos <= windows.superbTo) return "superb";
  if (markerPos >= windows.fineFrom && markerPos <= windows.fineTo) return "fine";
  return "common";
}

/** Sections whose *plants* or *minerals* this player may gather from. */
export function gatherSectionAccess(levels: SkillLevels, skill: GatherSkillId): Set<number> {
  const set = new Set<number>([1]);
  for (const u of earnedUnlocks(skill, levels)) {
    if (u.kind === "sectionAccess") set.add(u.value as number);
  }
  return set;
}

/** Ingredients hidden until a foraging level reveals them (moonpetal, chili). */
export function isIngredientVisible(levels: SkillLevels, ing: Ingredient): boolean {
  const gate = CONFIG.unlocks.foraging.find((u) => u.kind === "reveal" && u.value === ing.id);
  if (!gate) return true;
  return levels.foraging >= gate.level;
}

export function rareNodesOnMinimap(levels: SkillLevels): boolean {
  return earnedUnlocks("foraging", levels).some((u) => u.kind === "revealRare");
}

/** Why a node cannot be gathered right now, or null when it can. */
export function gatherBlockReason(levels: SkillLevels, ing: Ingredient): string | null {
  if (!isIngredientVisible(levels, ing)) return "not_visible";
  if (!gatherSectionAccess(levels, ing.skill).has(ing.section)) return "section_skill";
  return null;
}

export function doubleDropChance(levels: SkillLevels, ing: Ingredient): number {
  if (ing.skill !== "prospecting") return 0;
  const tags = earnedUnlocks("prospecting", levels)
    .filter((u) => u.kind === "doubleDrop")
    .map((u) => u.value as string);

  const matches = tags.some(
    (tag) =>
      tag === "all" ||
      (tag === "salt" && ing.salt === true) ||
      (tag === "iron" && ing.id === "iron_flake") ||
      (tag === "sugar" && ing.sugar === true) ||
      (tag === "starlight" && ing.starlight === true),
  );
  return matches ? CONFIG.gathering.doubleDropChance : 0;
}

export function isIngredientSafe(levels: SkillLevels, ing: Ingredient): boolean {
  if (ing.safeSpicecraft === undefined) return true;
  return levels.spicecraft >= ing.safeSpicecraft;
}

export function titlesEarned(levels: SkillLevels): string[] {
  return SKILL_IDS.filter((skill) => levels[skill] >= SKILL_MAX_LEVEL).map(
    (skill) => CONFIG.skills.titles[skill],
  );
}

// --------------------------------------------------------------------------
// Quality
// --------------------------------------------------------------------------

const STEPS = CONFIG.cooking.qualitySteps;

export function stepQuality(quality: Quality, delta: number): Quality {
  const index = STEPS.indexOf(quality);
  const next = Math.min(Math.max(index + delta, 0), STEPS.length - 1);
  return STEPS[next] ?? quality;
}

export function qualityMultipliers(quality: Quality): { xp: number; coins: number } {
  return CONFIG.cooking.quality[quality];
}

/**
 * Spicecraft perks that can push a finished dish up a step. Returned as a
 * probability so the server can roll it once, authoritatively.
 */
export function bonusQualityStepChance(levels: SkillLevels, recipeSection: number, usesHoney: boolean): number {
  const earned = earnedUnlocks("spicecraft", levels);
  if (earned.some((u) => u.kind === "qualityStep" && u.value === "all")) return 1;

  const tags = earned.filter((u) => u.kind === "qualityChance").map((u) => u.value as string);
  const honeyPerk = tags.includes("honey") && usesHoney;
  const cavePerk = tags.includes("cave") && recipeSection === 3;
  return honeyPerk || cavePerk ? 0.25 : 0;
}

export function spicedXpBonusPct(levels: SkillLevels): number {
  const perk = earnedUnlocks("spicecraft", levels).find((u) => u.kind === "xpBonus");
  return perk?.pct ?? 0;
}

/** Coins the tavern pays, after quality and spicecraft's core stat. */
export function sellValue(levels: SkillLevels, baseCoins: number, quality: Quality): number {
  const multiplier = qualityMultipliers(quality).coins;
  const spice = 1 + coreStatBonusPct("spicecraft", levels) / 100;
  return Math.max(1, Math.round(baseCoins * multiplier * spice));
}

/**
 * XP a finished dish pays out, per skill.
 *
 * Lives here rather than in the room so the server, the kitchen panel and
 * scripts/simulate-progression.ts all read the same arithmetic - a simulation
 * that modelled its own XP curve would be measuring itself, not the game.
 *
 * Firecraft always earns the recipe value. Knifework and spicecraft earn half
 * when the recipe asks for them, and a smaller base share when it does not -
 * every dish is still chopped and seasoned.
 *
 * That base share is not decoration. Every recipe that grants knifework XP also
 * requires Knifework 2 or more, and the same holds for spicecraft, so without
 * it both skills are pinned at level 1 forever - which in turn pins ingredient
 * slots at 2 and makes 18 of the 20 recipes permanently uncookable.
 *
 * Quality multiplies all three, and spicecraft 19 adds its bonus on spiced
 * dishes.
 */
export function cookXpAwards(
  recipe: { chefXp: number; requirements: SkillRequirements; ingredients: { id: string }[] },
  levels: SkillLevels,
  quality: Quality,
): { skill: SkillId; xp: number }[] {
  const {
    firecraftShare,
    knifeworkShare,
    spicecraftShare,
    knifeworkBaseShare,
    spicecraftBaseShare,
  } = CONFIG.cooking.cookXp;
  const qualityXp = qualityMultipliers(quality).xp;

  const ingredientIds = recipe.ingredients.map((i) => i.id);
  const spiceBonus = recipeUsesSpice(ingredientIds) ? 1 + spicedXpBonusPct(levels) / 100 : 1;

  const shares: { skill: SkillId; share: number }[] = [
    { skill: "firecraft", share: firecraftShare },
    {
      skill: "knifework",
      share: recipe.requirements.knifework !== undefined ? knifeworkShare : knifeworkBaseShare,
    },
    {
      skill: "spicecraft",
      share: recipe.requirements.spicecraft !== undefined ? spicecraftShare : spicecraftBaseShare,
    },
  ];

  return shares
    .map(({ skill, share }) => ({
      skill,
      xp: Math.round(recipe.chefXp * share * qualityXp * spiceBonus),
    }))
    .filter((award) => award.xp > 0);
}

/** True when a recipe uses any ingredient tagged as spiced. */
export function recipeUsesSpice(ingredientIds: string[]): boolean {
  return ingredientIds.some((id) => findIngredient(id)?.spiced === true);
}

export function recipeUsesHoney(ingredientIds: string[]): boolean {
  return ingredientIds.some((id) => findIngredient(id)?.honey === true);
}
