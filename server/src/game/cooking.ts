/**
 * The cooking mini-game, judged entirely on the server.
 *
 * The client is told where the marker starts, how fast it moves and where the
 * window is - enough to draw the bar - and replies with how long after the bar
 * arrived it clicked. The server recomputes the marker position from that same
 * arithmetic and decides the quality. A client that lies about the time is
 * caught by cross-checking against the server's own elapsed measurement; a
 * client that lies about the *result* has nothing to lie with, because it never
 * sends one.
 */

import {
  CONFIG,
  MAX_CLICK_LATENCY_MS,
  autoPrepSections,
  bonusQualityStepChance,
  cookDurationMs,
  cookXpAwards,
  findIngredient,
  ingredientSlots,
  prepQualityCap,
  recipe as recipeOrThrow,
  recipeUsesHoney,
  recipeUsesSpice,
  spicedXpBonusPct,
  stepQuality,
  techniquesUnlocked,
  timingWindowPct,
  qualityMultipliers,
  RECIPES,
  type Quality,
  type Recipe,
  type RecipeAvailabilityView,
  type SkillId,
  type SkillLevels,
} from "@crazycauldron/shared";
import type { PendingCook } from "./session.js";
import type { PlayerState } from "./state.js";

export interface CookRefusal {
  ok: false;
  reason: string;
  message: string;
}

export interface CookPlan {
  ok: true;
  recipe: Recipe;
  autoPrep: boolean;
  prepMs: number;
}

/**
 * Every reason a recipe might not be cookable, in the order a player would ask
 * them. Ingredient slots are a real gate on top of the recipe's own
 * requirements: a four-ingredient dish needs knifework 7 whether or not it says
 * so, which the kitchen list has to be able to explain.
 */
export function cookBlockers(state: PlayerState, recipe: Recipe): string[] {
  const levels = state.levels;
  const reasons: string[] = [];

  for (const [skill, needed] of Object.entries(recipe.requirements)) {
    const have = levels[skill as SkillId];
    if (have < needed) reasons.push(`Needs ${CONFIG.skills.names[skill as SkillId]} ${needed}`);
  }

  /*
   * A recipe that states no requirements is a starter recipe, and teaches its
   * own technique.
   *
   * Without this exception a new player is deadlocked: bake needs Firecraft 3,
   * simmer needs 2, and Firecraft XP comes only from cooking - while the two
   * techniques granted at level 1 (raw, pan_fry) are used solely by recipes
   * that need Knifework 2 and 3, which also only come from cooking. At all
   * level 1 exactly nothing is cookable.
   *
   * It costs nothing elsewhere: every other recipe states a Firecraft level at
   * or above its own technique gate, so the gate still binds for all 18 of
   * them. validate-content asserts that stays true.
   */
  const isStarter = Object.keys(recipe.requirements).length === 0;
  if (!isStarter && !techniquesUnlocked(levels).has(recipe.technique)) {
    reasons.push(`Technique "${recipe.technique}" is not unlocked`);
  }

  const slots = ingredientSlots(levels);
  if (recipe.ingredients.length > slots) {
    reasons.push(`Needs ${recipe.ingredients.length} ingredient slots, you have ${slots}`);
  }

  for (const item of recipe.ingredients) {
    const held = state.countIngredient(item.id);
    if (held < item.qty) {
      const name = findIngredient(item.id)?.name ?? item.id;
      reasons.push(`Needs ${item.qty} ${name} (have ${held})`);
    }
  }

  return reasons;
}

export function planCook(state: PlayerState, recipeId: string): CookPlan | CookRefusal {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, reason: "unknown_recipe", message: "No such recipe." };

  const blockers = cookBlockers(state, recipe);
  if (blockers.length > 0) {
    return { ok: false, reason: "not_cookable", message: blockers[0] ?? "You cannot cook that." };
  }

  if (state.roomFor("dish", recipe.id, 1, "common") < 1) {
    return { ok: false, reason: "bag_full", message: "No room for the finished dish." };
  }

  const autoPrep = autoPrepSections(state.levels).has(recipe.section);
  return { ok: true, recipe, autoPrep, prepMs: autoPrep ? 0 : CONFIG.cooking.prepMs };
}

/**
 * Generates the bar. Every value here is chosen server-side and remembered, so
 * the reply can be checked against what was actually sent.
 */
export function makeHeatBar(state: PlayerState, recipe: Recipe, cookId: string): PendingCook {
  const windowPct = timingWindowPct(state.levels, state.panTier);
  const durationMs = CONFIG.cooking.barMs;

  // Between 2.5 and 3.5 full passes of the bar: fast enough to need timing,
  // slow enough that the window is always reachable at least twice.
  const sweeps = 2.5 + Math.random();

  return {
    cookId,
    recipeId: recipe.id,
    prepared: false,
    barStartedAt: 0,
    durationMs,
    speed: sweeps / durationMs,
    startOffset: Math.random(),
    direction: Math.random() < 0.5 ? 1 : -1,
    // Kept off the very ends so a marker that bounces cannot skip past it.
    windowCentre: 0.2 + Math.random() * 0.6,
    windowPct,
    fineWindowPct: windowPct * CONFIG.cooking.fineWindowMultiplier,
  };
}

/**
 * Where the marker sits `elapsedMs` into the bar.
 *
 * The marker bounces between 0 and 1, which is a triangle wave: fold the
 * distance travelled into a period of 2 and mirror the second half.
 */
export function markerPosition(cook: PendingCook, elapsedMs: number): number {
  const travelled = cook.startOffset + cook.direction * cook.speed * elapsedMs;
  const cycle = ((travelled % 2) + 2) % 2;
  return cycle <= 1 ? cycle : 2 - cycle;
}

export interface ClickRefusal {
  ok: false;
  reason: string;
  message: string;
}

export interface ClickAccepted {
  ok: true;
  elapsedMs: number;
}

/**
 * Accepts or rejects the reported click time.
 *
 * The client's own measurement is used for the result - it is the only one that
 * reflects what the player actually saw - but only after the server has checked
 * it against its own elapsed time. The two can differ by the round trip and a
 * little jitter; they cannot differ by a second and a half.
 */
export function validateClick(
  cook: PendingCook,
  reportedMs: unknown,
  now: number,
): ClickAccepted | ClickRefusal {
  const elapsedMs = Number(reportedMs);
  if (!Number.isFinite(elapsedMs)) {
    return { ok: false, reason: "bad_click", message: "That click made no sense." };
  }
  if (elapsedMs < 0 || elapsedMs > cook.durationMs) {
    return { ok: false, reason: "click_out_of_range", message: "That click was off the bar." };
  }

  const serverElapsed = now - cook.barStartedAt;
  if (Math.abs(serverElapsed - elapsedMs) > MAX_CLICK_LATENCY_MS) {
    return { ok: false, reason: "implausible_latency", message: "Your connection is too far out of step." };
  }

  return { ok: true, elapsedMs };
}

export interface CookOutcome {
  quality: Quality;
  markerPos: number;
  chefXp: number;
  skillXp: { skill: SkillId; xp: number }[];
  downgraded: boolean;
  upgraded: boolean;
  cookMs: number;
}

/** Raw quality from where the marker stopped, before any skill adjustments. */
function qualityFromPosition(cook: PendingCook, markerPos: number): Quality {
  const distance = Math.abs(markerPos - cook.windowCentre);
  // windowPct is the full width of the window, so half of it is the reach.
  if (distance <= cook.windowPct / 200) return "superb";
  if (distance <= cook.fineWindowPct / 200) return "fine";
  return "common";
}

const STEPS = CONFIG.cooking.qualitySteps;

/**
 * Settles the dish: quality, ingredients spent, XP paid, codex updated.
 * Re-checks the ingredients, because the only thing that could have changed
 * them since the cook started is this same player eating something.
 */
export function resolveCook(
  state: PlayerState,
  cook: PendingCook,
  elapsedMs: number,
): CookOutcome | CookRefusal {
  const recipe = recipeOrThrow(cook.recipeId);
  const levels = state.levels;

  for (const item of recipe.ingredients) {
    if (state.countIngredient(item.id) < item.qty) {
      return { ok: false, reason: "missing_ingredients", message: "You ran out of ingredients." };
    }
  }

  const markerPos = markerPosition(cook, elapsedMs);
  let quality = qualityFromPosition(cook, markerPos);

  // Knifework caps how good the prep can be, so a perfect stop at knifework 1
  // still only produces a Common dish.
  const cap = prepQualityCap(levels);
  if (STEPS.indexOf(quality) > STEPS.indexOf(cap)) quality = cap;

  // An unsafe spice can pull the dish down a step.
  const ingredientIds = recipe.ingredients.map((i) => i.id);
  const risky = ingredientIds
    .map((id) => findIngredient(id))
    .find((ing) => ing?.safeSpicecraft !== undefined && levels.spicecraft < ing.safeSpicecraft);

  let downgraded = false;
  if (risky && Math.random() < CONFIG.cooking.nightshadeDowngradeChance) {
    quality = stepQuality(quality, -1);
    downgraded = true;
  }

  // Spicecraft perks can push it back up.
  let upgraded = false;
  const bonusChance = bonusQualityStepChance(levels, recipe.section, recipeUsesHoney(ingredientIds));
  if (bonusChance > 0 && Math.random() < bonusChance) {
    const raised = stepQuality(quality, 1);
    if (raised !== quality) {
      quality = raised;
      upgraded = true;
    }
  }

  for (const item of recipe.ingredients) state.removeIngredient(item.id, item.qty);
  state.addItem("dish", recipe.id, 1, quality);
  state.recordCooked(recipe.id, quality);

  // XP is worked out by the shared helper, so the simulation and the kitchen
  // panel can never disagree with what the room actually pays.
  const paid = cookXpAwards(recipe, levels, quality);
  for (const award of paid) state.awardSkillXp(award.skill, award.xp);

  return {
    quality,
    markerPos,
    chefXp: paid.reduce((total, a) => total + a.xp, 0),
    skillXp: paid,
    downgraded,
    upgraded,
    cookMs: cookDurationMs(levels),
  };
}

/** What the kitchen list shows: every recipe, and why each is or is not cookable. */
export function recipeAvailability(state: PlayerState): RecipeAvailabilityView[] {
  return RECIPES.map((recipe) => {
    const reasons = cookBlockers(state, recipe);
    return { recipeId: recipe.id, cookable: reasons.length === 0, reasons };
  });
}
