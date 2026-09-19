/**
 * Coins, food buffs and upgrades.
 *
 * Coins are off-chain and live only in the player row - nothing here touches a
 * wallet or a token. The tavern prices a dish from the recipe's sell value and
 * the quality it was cooked at, both of which the server already knows, so a
 * client asking to sell can only name a stack, never a price.
 */

import {
  CONFIG,
  findRecipe,
  sellValue,
  type Quality,
} from "@crazycauldron/shared";
import { displayNameFor, type PlayerState } from "./state.js";

export interface EconomyRefusal {
  ok: false;
  reason: string;
  message: string;
}

export interface SoldResult {
  ok: true;
  name: string;
  qty: number;
  coins: number;
}

/** The tavern buys dishes. Ingredients are not food, and iron is not either. */
export function sellStack(state: PlayerState, stackKey: string, qty: number): SoldResult | EconomyRefusal {
  const stack = state.getStack(stackKey);
  if (!stack) return { ok: false, reason: "no_stack", message: "You are not carrying that." };
  if (stack.kind !== "dish") {
    return { ok: false, reason: "not_a_dish", message: "The tavern only buys cooked dishes." };
  }

  const wanted = Math.floor(Number(qty));
  if (!Number.isFinite(wanted) || wanted < 1 || wanted > stack.qty) {
    return { ok: false, reason: "bad_quantity", message: "You do not have that many." };
  }

  const recipe = findRecipe(stack.id);
  if (!recipe) return { ok: false, reason: "unknown_dish", message: "Nobody wants that." };

  const each = sellValue(state.levels, recipe.sellCoins, (stack.quality ?? "common") as Quality);
  const total = each * wanted;
  const name = displayNameFor(stack.kind, stack.id, stack.quality);

  if (!state.removeItem(stackKey, wanted)) {
    return { ok: false, reason: "bad_quantity", message: "You do not have that many." };
  }
  state.coins += total;

  return { ok: true, name, qty: wanted, coins: total };
}

export interface AteResult {
  ok: true;
  name: string;
  buffExpiresAt: number;
  gatherSpeedPct: number;
}

/**
 * Eating a dish grants the well-fed buff. Any dish does the same thing, which
 * keeps the decision simple: sell it, or eat it.
 */
export function eatStack(state: PlayerState, stackKey: string, now: number): AteResult | EconomyRefusal {
  const stack = state.getStack(stackKey);
  if (!stack) return { ok: false, reason: "no_stack", message: "You are not carrying that." };
  if (stack.kind !== "dish") {
    return { ok: false, reason: "not_a_dish", message: "Cook it first." };
  }

  const name = displayNameFor(stack.kind, stack.id, stack.quality);
  if (!state.removeItem(stackKey, 1)) {
    return { ok: false, reason: "no_stack", message: "You are not carrying that." };
  }

  // Eating again refreshes rather than stacks, so the buff cannot be banked.
  const { durationMs, gatherSpeedPct } = CONFIG.economy.buff;
  state.buffExpiresAt = now + durationMs;

  return { ok: true, name, buffExpiresAt: state.buffExpiresAt, gatherSpeedPct };
}

export interface BoughtResult {
  ok: true;
  kind: "pan" | "bag";
  tier: number;
  name: string;
  coins: number;
}

/**
 * Upgrades are bought one tier at a time, in order. Tiers cannot be skipped -
 * partly so the cost curve means something, partly so a mistyped tier cannot
 * hand out the iron pan for the price of a stone one.
 */
export function buyUpgrade(
  state: PlayerState,
  kind: "pan" | "bag",
  tier: number,
): BoughtResult | EconomyRefusal {
  const wanted = Math.floor(Number(tier));
  const current = kind === "pan" ? state.panTier : state.bagTier;

  if (!Number.isFinite(wanted)) {
    return { ok: false, reason: "bad_tier", message: "No such upgrade." };
  }
  if (wanted <= current) {
    return { ok: false, reason: "already_owned", message: "You already have that." };
  }
  if (wanted !== current + 1) {
    return { ok: false, reason: "skipped_tier", message: "Buy the next tier first." };
  }

  const option =
    kind === "pan"
      ? CONFIG.economy.pan.find((p) => p.tier === wanted)
      : CONFIG.economy.bag.find((b) => b.tier === wanted);
  if (!option) return { ok: false, reason: "bad_tier", message: "No such upgrade." };

  if (state.coins < option.coins) {
    return {
      ok: false,
      reason: "too_poor",
      message: `That costs ${option.coins} coins; you have ${state.coins}.`,
    };
  }

  // The iron pan also wants iron flakes. Check everything before spending.
  const materials = kind === "pan" ? (option as { items?: { id: string; qty: number }[] }).items ?? [] : [];
  for (const item of materials) {
    if (state.countIngredient(item.id) < item.qty) {
      return {
        ok: false,
        reason: "missing_materials",
        message: `Also needs ${item.qty} ${displayNameFor("ingredient", item.id)}.`,
      };
    }
  }

  state.coins -= option.coins;
  for (const item of materials) state.removeIngredient(item.id, item.qty);

  if (kind === "pan") state.panTier = wanted;
  else state.bagTier = wanted;

  return { ok: true, kind, tier: wanted, name: option.name, coins: option.coins };
}
