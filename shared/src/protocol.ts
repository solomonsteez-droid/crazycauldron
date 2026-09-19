/**
 * Every payload that crosses the socket between the hub room and a client.
 *
 * The rule the whole block follows: the client sends *intent* and nothing else
 * - never a position, a quantity it computed, an XP figure or a timer. Each
 * server payload below is the authoritative answer to one of those intents.
 */

import type { Quality, SkillId } from "./content/index.js";

// --- client -> server ------------------------------------------------------

/** section 0 is the hub; 1..3 are the gathering maps. */
export interface TravelIntent {
  section: number;
}

export interface GatherIntent {
  nodeId: string;
}

export interface CookStartIntent {
  recipeId: string;
}

/** Sent once the 1.5s prep hold completes. Ignored when auto-prep applies. */
export interface CookPrepIntent {
  cookId: string;
}

/**
 * `elapsedMs` is measured by the client from the moment it received the heat
 * bar, not a wall-clock time: the two machines never have to agree on a clock,
 * and the server still cross-checks it against its own elapsed time.
 */
export interface CookStopIntent {
  cookId: string;
  elapsedMs: number;
}

export interface SellIntent {
  stackKey: string;
  qty: number;
}

export interface EatIntent {
  stackKey: string;
}

export interface BuyIntent {
  kind: "pan" | "bag";
  tier: number;
}

// --- server -> client ------------------------------------------------------

export interface InventoryStackView {
  key: string;
  kind: "ingredient" | "dish";
  id: string;
  name: string;
  quality?: Quality;
  qty: number;
  /** Epoch ms; set only on stacks that spoil (frost quartz). */
  expiresAt?: number;
  /** Ingredients only: what the tavern will not buy. */
  edible?: boolean;
}

export interface SkillView {
  id: SkillId;
  name: string;
  level: number;
  xp: number;
  intoLevel: number;
  levelSpan: number;
  maxed: boolean;
  /** "Simmer unlocks in 1 Firecraft level", or null when nothing is left. */
  nextUnlock: string | null;
}

export interface CodexEntryView {
  recipeId: string;
  cooked: boolean;
  bestQuality: Quality | null;
  cookedCount: number;
}

/** Why a recipe cannot be cooked right now, for the kitchen list. */
export interface RecipeAvailabilityView {
  recipeId: string;
  cookable: boolean;
  reasons: string[];
}

export interface ProfilePayload {
  wallet: string;
  displayName: string;
  coins: number;
  chefLevel: number;
  chefXp: number;
  chefIntoLevel: number;
  chefLevelSpan: number;
  chefMaxed: boolean;
  skills: SkillView[];
  inventory: InventoryStackView[];
  usedSlots: number;
  carrySlots: number;
  panTier: number;
  bagTier: number;
  /** Epoch ms, or 0 when no buff is running. */
  buffExpiresAt: number;
  codex: CodexEntryView[];
  unlockedSections: number[];
  titles: string[];
  nextGoal: string | null;
  /** Server clock at send time, so the client can age timers without drifting. */
  serverNow: number;
}

export interface NodeStateView {
  id: string;
  /** Epoch ms this player may gather it again; 0 means ready now. */
  readyAt: number;
  /** False when a level gate hides or blocks it. */
  available: boolean;
  reason?: string;
}

export interface NodesPayload {
  section: number;
  nodes: NodeStateView[];
  serverNow: number;
}

/** Sent the moment a gather is accepted, so the client can run its progress bar. */
export interface GatherStartedPayload {
  nodeId: string;
  durationMs: number;
  serverNow: number;
}

export interface GatherResultPayload {
  nodeId: string;
  ingredientId: string;
  name: string;
  qty: number;
  skill: SkillId;
  skillXp: number;
  chefXp: number;
  /** Epoch ms the node becomes gatherable again for this player. */
  readyAt: number;
  doubled: boolean;
}

/**
 * The heat bar, generated server-side. The marker starts at `startOffset`,
 * travels at `speed` bar-widths per ms in `direction`, and bounces at the ends;
 * the client only has to draw that, and the server recomputes the same position
 * from the reported elapsed time.
 */
export interface HeatBarPayload {
  cookId: string;
  recipeId: string;
  durationMs: number;
  speed: number;
  startOffset: number;
  direction: 1 | -1;
  /** Centre of the Superb window, 0..1 along the bar. */
  windowCentre: number;
  /** Full width of the Superb window as a percentage of the bar. */
  windowPct: number;
  fineWindowPct: number;
  serverNow: number;
}

export interface CookPreparedPayload {
  cookId: string;
  recipeId: string;
  prepMs: number;
  autoPrep: boolean;
  serverNow: number;
}

export interface CookResultPayload {
  cookId: string;
  recipeId: string;
  quality: Quality;
  /** Where the marker actually stopped, so the client can freeze it truthfully. */
  markerPos: number;
  windowCentre: number;
  chefXp: number;
  skillXp: { skill: SkillId; xp: number }[];
  /** Set when nightshade or dragon's breath pulled the dish down a step. */
  downgraded: boolean;
  /** Set when spicecraft pushed it up a step. */
  upgraded: boolean;
  cookMs: number;
}

export interface SoldPayload {
  name: string;
  qty: number;
  coins: number;
  totalCoins: number;
}

export interface AtePayload {
  name: string;
  buffExpiresAt: number;
  gatherSpeedPct: number;
}

export interface BoughtPayload {
  kind: "pan" | "bag";
  tier: number;
  name: string;
  coins: number;
  totalCoins: number;
}

/** Every refusal the server sends back, with a reason the UI can show. */
export interface RejectedPayload {
  action: string;
  reason: string;
  message: string;
}

// --- leaderboard (HTTP) ----------------------------------------------------

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  displayName: string;
  chefLevel: number;
  chefXp: number;
  titles: string[];
}

export interface LeaderboardPayload {
  rows: LeaderboardRow[];
  serverNow: number;
}
