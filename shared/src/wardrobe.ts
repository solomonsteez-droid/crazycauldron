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

/**
 * Kinds a wardrobe item can be.
 *
 * Two are worn: a hat and a companion. "cloak" is dormant - the items, the art
 * and the conditions that earn them all still exist, but nothing evaluates
 * them. The kind stays in the type because the dormant entries still declare
 * it, and because leaving it out would make turning the slot back on a
 * type-level change rather than a data one.
 */
export type WardrobeKind = "hat" | "cloak" | "companion";

/**
 * What a saved apron id becomes.
 *
 * Aprons were replaced by cloaks one for one, each keeping the condition that
 * earned it. Cloaks are themselves dormant now, but the mapping stays: an
 * apron id in an old save still resolves to something real, which is what
 * keeps it in the player's earned set instead of being quietly dropped.
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

/**
 * What a stored wardrobe id means now, or null if it means nothing.
 *
 * Dormant items count as real. A player who earned the Midnight cloak keeps
 * it in their unlocked set while the slot is switched off - the alternative is
 * deleting it from every save on the next login, which is not something a
 * dormant feature should be allowed to do.
 */
export function migrateGarment(id: string): string | null {
  if (!id) return null;
  if (ALL_WARDROBE_ITEMS.some((item) => item.id === id)) return id;
  return APRON_TO_CLOAK[id] ?? null;
}

/**
 * The cloak a player's record carries by default.
 *
 * Nothing wears it: the slot is dormant and no room state, profile or sprite
 * mentions a cloak. It is still written so that a record saved today is a
 * record the slot can be switched back on over.
 */
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
  /** Items kept whole but switched off; see the note at the top of the file. */
  dormant?: WardrobeItem[];
}

const file = wardrobeJson as unknown as WardrobeFile;

/**
 * What a player can earn and wear. Hats, at launch.
 *
 * Everything that decides - what is granted, what a panel lists, what the shop
 * may sell - reads this. Nothing reads the dormant list except the two places
 * that must not forget an id exists: migration, and looking up a name.
 */
export const WARDROBE_ITEMS = file.items;

/** Preserved, not active. Conditions and names intact, nothing evaluating them. */
export const DORMANT_WARDROBE_ITEMS = file.dormant ?? [];

/** Both lists, for the cases where an id has to resolve whether or not it is live. */
export const ALL_WARDROBE_ITEMS = [...WARDROBE_ITEMS, ...DORMANT_WARDROBE_ITEMS];

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

/**
 * An item by id, dormant ones included.
 *
 * A name is wanted for anything a player might still have in their record, and
 * a dormant garment is exactly that - so this searches both lists while
 * everything that grants or equips searches only the live one.
 */
export function wardrobeItem(itemId: string): WardrobeItem | undefined {
  return ALL_WARDROBE_ITEMS.find((i) => i.id === itemId);
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
