/**
 * Gathering: validate, time, then reward - all on the server.
 *
 * Nodes are per-player. Thirty people can stand on the same sunwheat and each
 * gets their own 60-second cooldown, which removes node contention as a
 * gameplay problem and as a source of server-side contention.
 */

import {
  CONFIG,
  doubleDropChance,
  findNode,
  gatherBlockReason,
  gatherDurationMs,
  ingredient,
  isAdjacentOrOn,
  type GatherNodeDef,
  type Ingredient,
  type NodeStateView,
  type Section,
  type TilePos,
} from "@crazycauldron/shared";
import type { PlayerState } from "./state.js";

export interface GatherRefusal {
  ok: false;
  reason: string;
  message: string;
}

export interface GatherPlan {
  ok: true;
  node: GatherNodeDef;
  section: Section;
  ing: Ingredient;
  durationMs: number;
}

const BLOCK_MESSAGES: Record<string, string> = {
  not_visible: "You cannot see anything worth taking here.",
  section_skill: "Your gathering skill is not high enough for this ground.",
};

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Everything that must be true before a gather timer starts. Checked again by
 * the caller on completion only for inventory room, since that is the one thing
 * another action could have changed in the meantime.
 */
export function planGather(
  state: PlayerState,
  currentSection: number,
  nodeId: string,
  playerTile: TilePos,
  now: number,
): GatherPlan | GatherRefusal {
  const found = findNode(nodeId);
  if (!found) return { ok: false, reason: "unknown_node", message: "No such node." };

  const { node, section } = found;
  if (section.index !== currentSection) {
    return { ok: false, reason: "wrong_section", message: "That node is in another section." };
  }
  if (!isAdjacentOrOn(playerTile, { tileX: node.tileX, tileY: node.tileY })) {
    return { ok: false, reason: "too_far", message: "Step closer to gather." };
  }

  const readyAt = state.nodeReadyAt.get(nodeId) ?? 0;
  if (readyAt > now) {
    const seconds = Math.ceil((readyAt - now) / 1000);
    return { ok: false, reason: "cooldown", message: `Regrows in ${seconds}s.` };
  }

  const ing = ingredientOf(node);
  const blocked = gatherBlockReason(state.levels, ing);
  if (blocked) {
    return {
      ok: false,
      reason: blocked,
      message: BLOCK_MESSAGES[blocked] ?? "You cannot gather that yet.",
    };
  }

  if (state.roomFor("ingredient", ing.id, 1) < 1) {
    return { ok: false, reason: "bag_full", message: "Your bag is full." };
  }

  return {
    ok: true,
    node,
    section,
    ing,
    durationMs: gatherDurationMs(state.levels, ing.skill, state.buffActive(now)),
  };
}

export interface GatherReward {
  qty: number;
  doubled: boolean;
  skillXp: number;
  readyAt: number;
}

/**
 * Rolls the yield and pays out. Called only after the timer the server itself
 * scheduled, so a client cannot shorten it.
 */
export function completeGather(state: PlayerState, plan: GatherPlan, now: number): GatherReward {
  const { yieldMin, yieldMax, respawnMs, xpMin, xpMax, sectionMultiplier } = CONFIG.gathering;

  let qty = randomInt(yieldMin, yieldMax);
  const doubled = Math.random() < doubleDropChance(state.levels, plan.ing);
  if (doubled) qty *= 2;

  const added = state.addItem("ingredient", plan.ing.id, qty);

  const multiplier = sectionMultiplier[String(plan.section.index)] ?? 1;
  const skillXp = randomInt(xpMin, xpMax) * multiplier;
  state.awardSkillXp(plan.ing.skill, skillXp);

  const readyAt = now + respawnMs[plan.ing.rarity];
  state.nodeReadyAt.set(plan.node.id, readyAt);

  return { qty: added, doubled, skillXp, readyAt };
}

/** What this player can see of a section's nodes right now. */
export function nodeStates(state: PlayerState, section: Section, now: number): NodeStateView[] {
  return section.nodes.map((node) => {
    const ing = ingredientOf(node);
    const blocked = gatherBlockReason(state.levels, ing);
    const readyAt = state.nodeReadyAt.get(node.id) ?? 0;
    return {
      id: node.id,
      readyAt: readyAt > now ? readyAt : 0,
      available: blocked === null,
      ...(blocked ? { reason: blocked } : {}),
    };
  });
}

function ingredientOf(node: GatherNodeDef): Ingredient {
  // validate-content proves every node points at a real ingredient, so the
  // throwing accessor is the honest one here: a miss is a content bug.
  return ingredient(node.ingredient);
}
