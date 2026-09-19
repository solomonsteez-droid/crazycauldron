/**
 * Which wardrobe items a player has earned.
 *
 * Pure functions over a snapshot, so the server can grant items and the client
 * can explain why something is still locked without either inventing its own
 * rules. The conditions themselves live in content/wardrobe.json.
 */

import wardrobeJson from "./content/wardrobe.json" with { type: "json" };
import { RECIPES, type Quality, type SkillId } from "./content/index.js";
import type { SkillLevels } from "./progression.js";

export type TierId = "bronze" | "silver" | "gold";
export type WardrobeKind = "hat" | "cloak";

/**
 * What a saved apron id becomes.
 *
 * Aprons were replaced by cloaks one for one, each keeping the condition that
 * earned it, so a player who had earned the Berry apron has earned the Berry
 * cloak. Anything not in this table is a garment that no longer exists and is
 * simply not worn.
 */
const APRON_TO_CLOAK: Record<string, string> = {
  apron_01_linen: "cloak_01_wool",
  apron_02_patched: "cloak_02_patched",
  apron_03_berry: "cloak_03_berry",
  apron_04_rugged: "cloak_04_rugged",
  apron_05_midnight: "cloak_05_midnight",
  apron_06_silver: "cloak_06_silver",
  apron_07_gold: "cloak_07_gold",
};

/** The cloak a stored wardrobe id means now, or null if it means nothing. */
export function migrateGarment(id: string): string | null {
  if (!id) return null;
  if (WARDROBE_ITEMS.some((item) => item.id === id)) return id;
  return APRON_TO_CLOAK[id] ?? null;
}

/** The cloak every player starts in. */
export const STARTER_CLOAK = "cloak_01_wool";

export type UnlockRule =
  | { type: "start" }
  | { type: "chefLevel"; level: number }
  | { type: "skillLevel"; skill: SkillId; level: number }
  | { type: "anySkillLevel"; level: number }
  | { type: "dishesCooked"; count: number }
  | { type: "cookQuality"; minQuality: Quality }
  | { type: "sectionRecipes"; section: number }
  | { type: "recipeQuality"; recipeNumber: number; quality: Quality }
  | { type: "tier"; tier: TierId };

export interface WardrobeItem {
  id: string;
  kind: WardrobeKind;
  name: string;
  unlock: UnlockRule;
}

interface WardrobeFile {
  tiers: { id: TierId; minHold: number }[];
  items: WardrobeItem[];
}

const file = wardrobeJson as unknown as WardrobeFile;
export const WARDROBE_ITEMS = file.items;
export const WARDROBE_TIERS = file.tiers;

const QUALITY_ORDER: Quality[] = ["common", "fine", "superb"];

/** The snapshot an unlock rule is judged against. */
export interface WardrobeSnapshot {
  chefLevel: number;
  levels: SkillLevels;
  /** Best quality ever reached per recipe id, for recipes actually cooked. */
  bestQuality: Record<string, Quality>;
  /** Total dishes cooked, across every recipe. */
  dishesCooked: number;
  /** Highest tier the cached $COOK balance currently supports, if any. */
  tier: TierId | null;
}

/** The tier a balance earns, or null below the lowest threshold. */
export function tierForBalance(balance: number): TierId | null {
  let earned: TierId | null = null;
  for (const tier of WARDROBE_TIERS) {
    if (balance >= tier.minHold) earned = tier.id;
  }
  return earned;
}

export function tierThreshold(tier: TierId): number {
  return WARDROBE_TIERS.find((t) => t.id === tier)?.minHold ?? 0;
}

const atLeast = (have: Quality | undefined, want: Quality): boolean =>
  have !== undefined && QUALITY_ORDER.indexOf(have) >= QUALITY_ORDER.indexOf(want);

/** True when the rule is satisfied right now. */
export function isUnlocked(rule: UnlockRule, snapshot: WardrobeSnapshot): boolean {
  switch (rule.type) {
    case "start":
      return true;
    case "chefLevel":
      return snapshot.chefLevel >= rule.level;
    case "skillLevel":
      return (snapshot.levels[rule.skill] ?? 1) >= rule.level;
    case "anySkillLevel":
      return Object.values(snapshot.levels).some((level) => level >= rule.level);
    case "dishesCooked":
      return snapshot.dishesCooked >= rule.count;
    case "cookQuality":
      return Object.values(snapshot.bestQuality).some((q) => atLeast(q, rule.minQuality));
    case "sectionRecipes": {
      const wanted = RECIPES.filter((r) => r.section === rule.section);
      return wanted.length > 0 && wanted.every((r) => snapshot.bestQuality[r.id] !== undefined);
    }
    case "recipeQuality": {
      const recipe = RECIPES[rule.recipeNumber - 1];
      return recipe ? atLeast(snapshot.bestQuality[recipe.id], rule.quality) : false;
    }
    case "tier":
      return snapshot.tier !== null && rankOf(snapshot.tier) >= rankOf(rule.tier);
    default:
      return false;
  }
}

function rankOf(tier: TierId): number {
  return WARDROBE_TIERS.findIndex((t) => t.id === tier);
}

/**
 * Human wording for a rule, shown under a locked item.
 *
 * Written from the content rather than hard-coded strings, so retuning a
 * threshold in wardrobe.json updates what the panel says about it.
 */
export function describeUnlockRule(rule: UnlockRule): string {
  switch (rule.type) {
    case "start":
      return "Yours from the start";
    case "chefLevel":
      return `Reach Chef Level ${rule.level}`;
    case "skillLevel":
      return `Reach ${rule.skill} ${rule.level}`;
    case "anySkillLevel":
      return `Take any skill to ${rule.level}`;
    case "dishesCooked":
      return `Cook ${rule.count} dishes`;
    case "cookQuality":
      return `Cook any dish at ${rule.minQuality} or better`;
    case "sectionRecipes":
      return `Cook every Deep Forest recipe at least once`;
    case "recipeQuality": {
      const recipe = RECIPES[rule.recipeNumber - 1];
      return `Cook ${recipe?.name ?? `recipe ${rule.recipeNumber}`} at ${rule.quality}`;
    }
    case "tier":
      return `Hold ${tierThreshold(rule.tier).toLocaleString()} $COOK`;
    default:
      return "Locked";
  }
}

/** Tier items stop being wearable the moment the balance stops backing them. */
export function requiredTier(itemId: string): TierId | null {
  const item = WARDROBE_ITEMS.find((i) => i.id === itemId);
  return item && item.unlock.type === "tier" ? item.unlock.tier : null;
}

export function wardrobeItem(itemId: string): WardrobeItem | undefined {
  return WARDROBE_ITEMS.find((i) => i.id === itemId);
}

/** Every item whose rule is satisfied but which the player has not been granted. */
export function newlyEarned(snapshot: WardrobeSnapshot, owned: ReadonlySet<string>): WardrobeItem[] {
  return WARDROBE_ITEMS.filter(
    (item) =>
      !owned.has(item.id) &&
      // Tier items are not "earned" - they come and go with the balance, so
      // they are never written into the permanent unlocked set.
      item.unlock.type !== "tier" &&
      isUnlocked(item.unlock, snapshot),
  );
}
