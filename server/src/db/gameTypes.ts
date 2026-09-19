import type { Quality, SkillId } from "@crazycauldron/shared";

/** One stack in a player's bag. Dishes and ingredients share the table. */
export interface StackRecord {
  key: string;
  kind: "ingredient" | "dish";
  id: string;
  quality?: Quality;
  qty: number;
  /** Epoch ms; only set on ingredients that spoil. */
  expiresAt?: number;
}

export interface CodexRecord {
  recipeId: string;
  bestQuality: Quality;
  cookedCount: number;
}

/**
 * Everything persisted about a player's progress. Loaded once on join, written
 * back after every state-changing action.
 */
export interface GameStateRecord {
  wallet: string;
  coins: number;
  chefXp: number;
  skillXp: Record<SkillId, number>;
  panTier: number;
  bagTier: number;
  /** Epoch ms the well-fed buff ends; 0 when none is running. */
  buffExpiresAt: number;
  stacks: StackRecord[];
  codex: CodexRecord[];
  unlockedSections: number[];
  /** Per-player node cooldowns, epoch ms. Persisted so relogging cannot reset them. */
  nodeReadyAt: Record<string, number>;
  /** Wardrobe items permanently earned. Tier items are never stored here. */
  unlockedItems: string[];
  hatId: string;
  cloakId: string;
}

export interface LeaderboardEntry {
  wallet: string;
  displayName: string;
  chefXp: number;
  /** Carried so the row can show earned titles without a second round trip. */
  skillXp: Record<SkillId, number>;
}

export interface GameRepository {
  load(wallet: string): GameStateRecord;
  save(state: GameStateRecord): void;
  topByChefXp(limit: number): LeaderboardEntry[];
}
