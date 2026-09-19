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


/**
 * One settled $COOK purchase.
 *
 * The signature is the primary key, which is the whole point: a transaction
 * can only be spent once, and the second attempt to claim it collides.
 */
export interface PurchaseRecord {
  signature: string;
  wallet: string;
  itemId: string;
  cook: number;
  at: string;
}

export interface GameRepository {
  load(wallet: string): Promise<GameStateRecord>;
  save(state: GameStateRecord): Promise<void>;
  topByChefXp(limit: number): Promise<LeaderboardEntry[]>;

  /**
   * Records a purchase and grants the item, or reports that this signature
   * has already been claimed.
   *
   * One call rather than a check and then a write: between the two, the same
   * signature submitted twice would pass the check twice. Recording the
   * signature is what makes the claim exclusive, so the insert is the check.
   */
  claimPurchase(record: PurchaseRecord): Promise<{ granted: boolean }>;

  /** What a wallet has bought, newest first. */
  purchasesOf(wallet: string): Promise<PurchaseRecord[]>;

  /**
   * A named switch, shared by every process.
   *
   * On Colyseus Cloud there are as many processes as cores, each with its own
   * memory, and a switch that lives in one of them is a switch that half the
   * players never see. The database is the one thing all of them agree on.
   */
  readFlag(name: string): Promise<string | null>;
  writeFlag(name: string, value: string): Promise<void>;
}
