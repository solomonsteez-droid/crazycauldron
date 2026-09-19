/**
 * One player's progress, in memory, for as long as they are connected.
 *
 * This is the only thing the room mutates. Every action goes through a method
 * here, every method leaves the state consistent, and the room persists the
 * whole record afterwards - so there is no path where a reward is granted but
 * the cost is not.
 */

import {
  CONFIG,
  SKILL_IDS,
  chefLevelForXp,
  chefProgress,
  carrySlots as carrySlotsFor,
  describeUnlock,
  findIngredient,
  findRecipe,
  findSection,
  ingredient as ingredientOrThrow,
  levelsFromXp,
  nextGoal,
  nextUnlockForSkill,
  skillProgress,
  titlesEarned,
  type InventoryStackView,
  type ProfilePayload,
  type Quality,
  type SkillId,
  type SkillLevels,
  type SkillView,
} from "@crazycauldron/shared";
import { recipeAvailability } from "./cooking.js";
import type { CodexRecord, GameStateRecord, StackRecord } from "../db/gameTypes.js";

export type ItemKind = "ingredient" | "dish";

/** Dishes stack per quality, so a Superb flatbread never merges with a Common one. */
export function stackKey(kind: ItemKind, id: string, quality?: Quality): string {
  return kind === "dish" ? `dish:${id}:${quality ?? "common"}` : `ing:${id}`;
}

export function displayNameFor(kind: ItemKind, id: string, quality?: Quality): string {
  if (kind === "ingredient") return findIngredient(id)?.name ?? id;
  const recipe = findRecipe(id);
  const base = recipe?.name ?? id;
  return quality && quality !== "common" ? `${base} (${quality})` : base;
}

export class PlayerState {
  readonly wallet: string;
  displayName: string;
  coins: number;
  chefXp: number;
  skillXp: Record<SkillId, number>;
  panTier: number;
  bagTier: number;
  buffExpiresAt: number;
  /** Equipped wardrobe items. The linen apron is the starting garment. */
  hatId = "";
  apronId = "apron_01_linen";
  /** Keyed by stackKey so lookups and merges are both O(1). */
  private readonly stacks = new Map<string, StackRecord>();
  private readonly codex = new Map<string, CodexRecord>();
  readonly unlockedSections: Set<number>;
  readonly nodeReadyAt = new Map<string, number>();

  constructor(record: GameStateRecord, displayName: string) {
    this.wallet = record.wallet;
    this.displayName = displayName;
    this.coins = record.coins;
    this.chefXp = record.chefXp;
    this.skillXp = { ...record.skillXp };
    this.panTier = record.panTier;
    this.bagTier = record.bagTier;
    this.buffExpiresAt = record.buffExpiresAt;
    this.unlockedSections = new Set(record.unlockedSections);

    for (const stack of record.stacks) this.stacks.set(stack.key, { ...stack });
    for (const entry of record.codex) this.codex.set(entry.recipeId, { ...entry });

    // Section 1 is open from Chef 1, so a brand new player already has it.
    this.unlockedSections.add(1);
  }

  // --- derived -------------------------------------------------------------

  get levels(): SkillLevels {
    return levelsFromXp(this.skillXp);
  }

  get chefLevel(): number {
    return chefLevelForXp(this.chefXp);
  }

  get carrySlots(): number {
    return carrySlotsFor(this.levels, this.bagTier);
  }

  usedSlots(): number {
    return this.stacks.size;
  }

  buffActive(now: number): boolean {
    return this.buffExpiresAt > now;
  }

  // --- inventory -----------------------------------------------------------

  countIngredient(id: string): number {
    return this.stacks.get(stackKey("ingredient", id))?.qty ?? 0;
  }

  getStack(key: string): StackRecord | undefined {
    return this.stacks.get(key);
  }

  listStacks(): StackRecord[] {
    return [...this.stacks.values()];
  }

  /**
   * Room left for `qty` of an item, accounting for the 99-per-stack cap and the
   * slot count. Checked before a gather starts so a full bag refuses up front
   * rather than silently dropping the yield.
   */
  roomFor(kind: ItemKind, id: string, qty: number, quality?: Quality): number {
    const { stackMax } = CONFIG.economy.inventory;
    const key = stackKey(kind, id, quality);
    const existing = this.stacks.get(key);

    let room = existing ? Math.max(stackMax - existing.qty, 0) : 0;
    const freeSlots = Math.max(this.carrySlots - this.stacks.size, 0);
    room += freeSlots * stackMax;
    return Math.min(room, qty);
  }

  /** Adds what fits and returns how much that was. */
  addItem(kind: ItemKind, id: string, qty: number, quality?: Quality): number {
    const { stackMax } = CONFIG.economy.inventory;
    const key = stackKey(kind, id, quality);
    let remaining = Math.min(qty, this.roomFor(kind, id, qty, quality));
    const added = remaining;

    const expiresMs = kind === "ingredient" ? findIngredient(id)?.expiresMs : undefined;

    while (remaining > 0) {
      const existing = this.stacks.get(key);
      if (existing && existing.qty < stackMax) {
        const room = Math.min(stackMax - existing.qty, remaining);
        existing.qty += room;
        remaining -= room;
        // A topped-up perishable stack keeps the *earliest* expiry, so adding
        // fresh quartz cannot launder an old stack into lasting longer.
        continue;
      }
      if (existing) break; // Stack is full and slots are counted per item id.

      const take = Math.min(stackMax, remaining);
      this.stacks.set(key, {
        key,
        kind,
        id,
        ...(quality ? { quality } : {}),
        qty: take,
        ...(expiresMs ? { expiresAt: Date.now() + expiresMs } : {}),
      });
      remaining -= take;
    }
    return added - remaining;
  }

  removeItem(key: string, qty: number): boolean {
    const stack = this.stacks.get(key);
    if (!stack || stack.qty < qty) return false;
    stack.qty -= qty;
    if (stack.qty <= 0) this.stacks.delete(key);
    return true;
  }

  removeIngredient(id: string, qty: number): boolean {
    return this.removeItem(stackKey("ingredient", id), qty);
  }

  /** Drops spoiled stacks. Returns the names dropped so the UI can say so. */
  sweepExpired(now: number): string[] {
    const dropped: string[] = [];
    for (const [key, stack] of this.stacks) {
      if (stack.expiresAt !== undefined && stack.expiresAt <= now) {
        dropped.push(`${stack.qty} x ${displayNameFor(stack.kind, stack.id, stack.quality)}`);
        this.stacks.delete(key);
      }
    }
    return dropped;
  }

  // --- progression ---------------------------------------------------------

  /**
   * The one place XP is granted. Chef XP always mirrors the skill award, which
   * is what makes the chef track the sum of everything a player does.
   */
  awardSkillXp(skill: SkillId, xp: number): void {
    const amount = Math.max(0, Math.round(xp));
    if (amount === 0) return;
    this.skillXp[skill] += amount;
    this.chefXp += amount;
  }

  recordCooked(recipeId: string, quality: Quality): void {
    const steps = CONFIG.cooking.qualitySteps;
    const existing = this.codex.get(recipeId);
    if (!existing) {
      this.codex.set(recipeId, { recipeId, bestQuality: quality, cookedCount: 1 });
      return;
    }
    existing.cookedCount += 1;
    if (steps.indexOf(quality) > steps.indexOf(existing.bestQuality)) {
      existing.bestQuality = quality;
    }
  }

  canEnterSection(index: number): boolean {
    const section = findSection(index);
    if (!section) return false;
    return this.chefLevel >= section.unlockChefLevel;
  }

  markSectionEntered(index: number): void {
    this.unlockedSections.add(index);
  }

  // --- serialisation -------------------------------------------------------

  toRecord(): GameStateRecord {
    return {
      wallet: this.wallet,
      coins: this.coins,
      chefXp: this.chefXp,
      skillXp: { ...this.skillXp },
      panTier: this.panTier,
      bagTier: this.bagTier,
      buffExpiresAt: this.buffExpiresAt,
      stacks: this.listStacks(),
      codex: [...this.codex.values()],
      unlockedSections: [...this.unlockedSections],
      nodeReadyAt: Object.fromEntries(this.nodeReadyAt),
    };
  }

  private skillViews(): SkillView[] {
    const levels = this.levels;
    return SKILL_IDS.map((skill) => {
      const xp = this.skillXp[skill];
      const p = skillProgress(xp);
      const pending = nextUnlockForSkill(skill, levels, xp);
      return {
        id: skill,
        name: CONFIG.skills.names[skill],
        level: p.level,
        xp,
        intoLevel: p.intoLevel,
        levelSpan: p.levelSpan,
        maxed: p.maxed,
        nextUnlock: pending ? describeUnlock(pending) : null,
      };
    });
  }

  private inventoryViews(): InventoryStackView[] {
    return this.listStacks()
      .map((stack) => {
        const edible =
          stack.kind === "ingredient" ? (findIngredient(stack.id)?.edible ?? true) : true;
        return {
          key: stack.key,
          kind: stack.kind,
          id: stack.id,
          name: displayNameFor(stack.kind, stack.id, stack.quality),
          ...(stack.quality ? { quality: stack.quality } : {}),
          qty: stack.qty,
          ...(stack.expiresAt ? { expiresAt: stack.expiresAt } : {}),
          edible,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  toProfile(): ProfilePayload {
    const levels = this.levels;
    const chef = chefProgress(this.chefXp);
    const goal = nextGoal(levels, this.skillXp);

    return {
      wallet: this.wallet,
      displayName: this.displayName,
      coins: this.coins,
      chefLevel: chef.level,
      chefXp: this.chefXp,
      chefIntoLevel: chef.intoLevel,
      chefLevelSpan: chef.levelSpan,
      chefMaxed: chef.maxed,
      skills: this.skillViews(),
      inventory: this.inventoryViews(),
      usedSlots: this.usedSlots(),
      carrySlots: this.carrySlots,
      panTier: this.panTier,
      bagTier: this.bagTier,
      buffExpiresAt: this.buffExpiresAt,
      codex: [...this.codex.values()].map((entry) => ({
        recipeId: entry.recipeId,
        cooked: entry.cookedCount > 0,
        bestQuality: entry.bestQuality,
        cookedCount: entry.cookedCount,
      })),
      recipes: recipeAvailability(this),
      unlockedSections: [...this.unlockedSections].sort((a, b) => a - b),
      titles: titlesEarned(levels),
      nextGoal: goal ? describeUnlock(goal) : null,
      serverNow: Date.now(),
    };
  }
}

/** Re-exported so callers do not need the content module for one lookup. */
export { ingredientOrThrow as ingredient };
