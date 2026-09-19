/**
 * Shapes of the JSON content files.
 *
 * The JSON is the source of truth for every tunable number in the game; these
 * interfaces only describe it. `resolveJsonModule` widens literals to `string`,
 * so index.ts casts each import to the types below once, in one place, rather
 * than every call site guessing.
 */

import type { TilePos } from "../types.js";

export type SkillId = "foraging" | "prospecting" | "knifework" | "firecraft" | "spicecraft";
export type GatherSkillId = Extract<SkillId, "foraging" | "prospecting">;
export type Rarity = "common" | "uncommon" | "rare";
export type Quality = "common" | "fine" | "superb";
export type Technique =
  | "raw"
  | "pan_fry"
  | "simmer"
  | "bake"
  | "clay_bake"
  | "roast"
  | "smoke"
  | "chill";

/** Requirement blocks are sparse: an absent skill means "no requirement". */
export type SkillRequirements = Partial<Record<SkillId, number>>;

export interface Ingredient {
  id: string;
  name: string;
  section: number;
  skill: GatherSkillId;
  rarity: Rarity;
  edible: boolean;
  /** Tags the spicecraft and prospecting unlocks key off. */
  honey?: boolean;
  salt?: boolean;
  sugar?: boolean;
  starlight?: boolean;
  spiced?: boolean;
  /** Spicecraft level at which this ingredient stops risking a quality drop. */
  safeSpicecraft?: number;
  /** Set on frost_quartz: the stack is dropped this long after gathering. */
  expiresMs?: number;
  note?: string;
}

export interface RecipeIngredient {
  id: string;
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  section: number;
  technique: Technique;
  chefXp: number;
  sellCoins: number;
  ingredients: RecipeIngredient[];
  requirements: SkillRequirements;
}

export interface GatherNodeDef {
  id: string;
  ingredient: string;
  tileX: number;
  tileY: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Section {
  id: string;
  index: number;
  name: string;
  unlockChefLevel: number;
  accent: string;
  accentColor: string;
  groundColor: string;
  spawn: TilePos;
  returnPortal: TilePos;
  obstacles: Rect[];
  nodes: GatherNodeDef[];
}

export interface HubStation {
  id: "kitchen" | "tavern" | "outfitter";
  name: string;
  tileX: number;
  tileY: number;
}

export interface HubPortal {
  section: number;
  tileX: number;
  tileY: number;
}

export interface SectionsFile {
  hub: { stations: HubStation[]; portals: HubPortal[] };
  sections: Section[];
}

export type UnlockKind =
  | "technique"
  | "pots"
  | "slots"
  | "prepQuality"
  | "autoPrep"
  | "carrySlots"
  | "gatherSpeed"
  | "revealRare"
  | "reveal"
  | "sectionAccess"
  | "doubleDrop"
  | "safeIngredient"
  | "qualityChance"
  | "xpBonus"
  | "qualityStep"
  | "title";

export interface Unlock {
  level: number;
  kind: UnlockKind;
  value: string | number | boolean;
  label: string;
  /** A second skill that must also be at this level, e.g. 5 slots needs spicecraft 10. */
  requires?: SkillRequirements;
  pct?: number;
}

export interface CoreStat {
  id: string;
  label: string;
  perLevelPct: number;
}

export interface QualityMultiplier {
  xp: number;
  coins: number;
}

export interface PanTier {
  tier: number;
  id: string;
  name: string;
  coins: number;
  windowBonusPct: number;
  items: RecipeIngredient[];
}

export interface BagTier {
  tier: number;
  name: string;
  coins: number;
  slots: number;
}

export interface SkillsFile {
  chef: {
    maxLevel: number;
    baseXp: number;
    growth: number;
    targetHours: Record<string, number>;
  };
  skills: {
    maxLevel: number;
    baseXp: number;
    growth: number;
    list: SkillId[];
    names: Record<SkillId, string>;
    titles: Record<SkillId, string>;
    coreStat: Record<SkillId, CoreStat>;
  };
  gathering: {
    baseMs: Record<GatherSkillId, number>;
    yieldMin: number;
    yieldMax: number;
    respawnMs: Record<Rarity, number>;
    xpMin: number;
    xpMax: number;
    sectionMultiplier: Record<string, number>;
    maxRareNodesPerSection: number;
    doubleDropChance: number;
  };
  cooking: {
    prepMs: number;
    barMs: number;
    cookMs: number;
    windowPctAtLevel1: number;
    windowPctAtLevel20: number;
    fineWindowMultiplier: number;
    nightshadeDowngradeChance: number;
    qualitySteps: Quality[];
    quality: Record<Quality, QualityMultiplier>;
    cookXp: {
      firecraftShare: number;
      knifeworkShare: number;
      spicecraftShare: number;
      /** Paid when the recipe does *not* require the skill; see skills.json. */
      knifeworkBaseShare: number;
      spicecraftBaseShare: number;
    };
  };
  economy: {
    inventory: { baseSlots: number; stackMax: number };
    pan: PanTier[];
    bag: BagTier[];
    buff: { id: string; label: string; gatherSpeedPct: number; durationMs: number };
  };
  unlocks: Record<SkillId, Unlock[]>;
}
