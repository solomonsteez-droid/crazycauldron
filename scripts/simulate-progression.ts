/**
 * Models a player working the gather-cook-sell loop and reports hours-to-level.
 *
 * The point is to tune the Chef curve against the brief's targets - Chef 10 in
 * about 2.5 hours, 20 in 10, 30 in 25 - without having to play for 25 hours.
 *
 * Every rule it obeys comes from the same shared code the server runs: level
 * curves, unlock gates, gather durations, timing windows and XP payouts. The
 * only things invented here are the *behavioural* assumptions listed under
 * PLAYER below, which is where the error bars live.
 *
 *   npx tsx scripts/simulate-progression.ts            # report
 *   npx tsx scripts/simulate-progression.ts --tune     # search for a curve
 *   npx tsx scripts/simulate-progression.ts --verbose  # per-level detail
 */

import {
  CONFIG,
  RECIPES,
  SECTIONS,
  MOVE_STEP_MS,
  SKILL_IDS,
  chefLevelForXp,
  chefXpToReach,
  cookDurationMs,
  cookXpAwards,
  gatherDurationMs,
  ingredient,
  ingredientSlots,
  levelsFromXp,
  autoPrepSections,
  techniquesUnlocked,
  timingWindowPct,
  emptySkillXp,
  type Quality,
  type Recipe,
  type SkillLevels,
  type SkillXp,
} from "@crazycauldron/shared";

// --------------------------------------------------------------------------
// Behavioural assumptions - the only numbers not taken from the game content
// --------------------------------------------------------------------------

const PLAYER = {
  /**
   * How accurately a normal player stops the marker, as a standard deviation
   * in milliseconds. The marker speed turns that into a distance along the
   * bar, which is why the +15% speed retune makes the same reaction worth less.
   */
  timingSigmaMs: 70,

  /** Tiles walked between two nodes in a section, on average. */
  tilesBetweenNodes: 8,

  /** Tiles from a section spawn to the hub kitchen, one way. */
  tilesSectionToKitchen: 16,

  /** Dishes cooked per trip, so travel is amortised the way a player would. */
  batchSize: 5,

  /** Dead time per action for reading the UI and clicking. */
  reactionSeconds: 0.6,

  /** Fraction of cooked dishes eaten for the buff rather than sold. */
  eatenFraction: 0.1,
} as const;

const SECONDS_PER_HOUR = 3600;
const TIME_CAP_HOURS = 200;

// --------------------------------------------------------------------------
// Quality model
// --------------------------------------------------------------------------

/** Normal CDF, for turning a timing error into a hit probability. */
function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 applied to erf.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return x >= 0 ? 0.5 + y / 2 : 0.5 - y / 2;
}

/** The player's timing error expressed as a fraction of the bar. */
const POSITION_SIGMA =
  (PLAYER.timingSigmaMs * 3 * CONFIG.cooking.markerSpeedMultiplier) / CONFIG.cooking.barMs;

/** Chance the stop lands within `halfWidth` bar-widths of the centre. */
function hitChance(halfWidth: number): number {
  return 2 * normalCdf(halfWidth / POSITION_SIGMA) - 1;
}

/**
 * Expected distribution of dish qualities, given the window the player's
 * firecraft and pan produce - then capped by what knifework prep allows.
 */
function qualityMix(levels: SkillLevels, panTier: number): Record<Quality, number> {
  const windowPct = timingWindowPct(levels, panTier);
  const superb = hitChance(windowPct / 200);
  const fine = Math.max(hitChance((windowPct * CONFIG.cooking.fineWindowMultiplier) / 200) - superb, 0);
  const common = Math.max(1 - superb - fine, 0);

  // Knifework no longer caps the outcome; the bar alone decides it.
  return { common, fine, superb };
}

// --------------------------------------------------------------------------
// The loop
// --------------------------------------------------------------------------

interface NodeSupply {
  count: number;
  respawnSeconds: number;
}

/** How many nodes of an ingredient exist, and how fast they come back. */
const SUPPLY = new Map<string, NodeSupply>();
for (const section of SECTIONS) {
  for (const node of section.nodes) {
    const ing = ingredient(node.ingredient);
    const existing = SUPPLY.get(node.ingredient);
    SUPPLY.set(node.ingredient, {
      count: (existing?.count ?? 0) + 1,
      respawnSeconds: CONFIG.gathering.respawnMs[ing.rarity] / 1000,
    });
  }
}


/**
 * How a section's nodes divide between the two gathering skills.
 *
 * Gathering XP is split this way rather than strictly by the recipe's own
 * ingredients. A player working the Meadows for sunwheat walks past the rock
 * salt and takes it too - and modelling it any other way produces a player who
 * picks an all-foraging recipe, never earns a single prospecting point, and is
 * locked out of section-3 minerals (Prospecting 10) and every caves recipe
 * behind them for the rest of the run.
 */
const SECTION_SKILL_SPLIT = new Map<number, { foraging: number; prospecting: number }>();
for (const section of SECTIONS) {
  let foraging = 0;
  let prospecting = 0;
  for (const node of section.nodes) {
    if (ingredient(node.ingredient).skill === "foraging") foraging += 1;
    else prospecting += 1;
  }
  SECTION_SKILL_SPLIT.set(section.index, { foraging, prospecting });
}

const walkSeconds = (tiles: number) => (tiles * MOVE_STEP_MS) / 1000;

/** Recipes this player can actually cook, ignoring what is in the bag. */
function cookableRecipes(levels: SkillLevels, chefLevel: number): Recipe[] {
  const techniques = techniquesUnlocked(levels);
  const slots = ingredientSlots(levels);

  return RECIPES.filter((recipe) => {
    const meetsStated = Object.entries(recipe.requirements).every(
      ([skill, level]) => levels[skill as keyof SkillLevels] >= level,
    );
    if (!meetsStated) return false;

    // Starter recipes teach their own technique; see server/src/game/cooking.ts.
    const isStarter = Object.keys(recipe.requirements).length === 0;
    if (!isStarter && !techniques.has(recipe.technique)) return false;
    if (recipe.ingredients.length > slots) return false;

    // Foraging and prospecting gate which ground you may work, and the section
    // itself is gated on Chef Level at the portal.
    return recipe.ingredients.every((item) => {
      const ing = ingredient(item.id);
      const section = SECTIONS.find((entry) => entry.index === ing.section);
      if (section && chefLevel < section.unlockChefLevel) return false;

      const gate = CONFIG.unlocks[ing.skill].find(
        (u) => u.kind === "sectionAccess" && u.value === ing.section,
      );
      if (gate && levels[ing.skill] < gate.level) return false;

      const reveal = CONFIG.unlocks.foraging.find(
        (u) => u.kind === "reveal" && u.value === ing.id,
      );
      return !reveal || levels.foraging >= reveal.level;
    });
  });
}

/**
 * The best recipe on offer: the one paying the most chef XP per second of the
 * whole gather-cook loop.
 *
 * Not simply the highest-XP dish. Chasing that alone parks the player on the
 * Dragon breath feast pot, whose chili has a single node on a 15-minute
 * respawn - so the "best" dish is mostly spent waiting, which is not what a
 * player would actually keep doing.
 */
function chooseRecipe(
  options: Recipe[],
  levels: SkillLevels,
  panTier: number,
): { recipe: Recipe } & ReturnType<typeof rateFor> {
  return options
    .map((recipe) => ({ recipe, ...rateFor(recipe, levels, panTier) }))
    .reduce((a, b) => (b.chefXp / b.seconds > a.chefXp / a.seconds ? b : a));
}

/** Expected chef XP per second of the whole loop, for one recipe. */
function rateFor(recipe: Recipe, levels: SkillLevels, panTier: number) {
  const { yieldMin, yieldMax, xpMin, xpMax, sectionMultiplier } = CONFIG.gathering;
  const avgYield = (yieldMin + yieldMax) / 2;
  const avgGatherXp = (xpMin + xpMax) / 2;
  const batch = PLAYER.batchSize;

  let gatherSeconds = 0;
  let gatherXp = 0;
  const sectionsVisited = new Set<number>();

  for (const item of recipe.ingredients) {
    const ing = ingredient(item.id);
    sectionsVisited.add(ing.section);

    const gathers = Math.ceil((item.qty * batch) / avgYield);
    const perGather =
      gatherDurationMs(levels, ing.skill, false) / 1000 +
      walkSeconds(PLAYER.tilesBetweenNodes) +
      PLAYER.reactionSeconds;

    const supply = SUPPLY.get(item.id) ?? { count: 1, respawnSeconds: 60 };

    // Working k nodes in rotation, a round takes k gathers; if that is quicker
    // than the respawn, the player waits for the first node to come back.
    const rounds = Math.ceil(gathers / supply.count);
    const roundSeconds = supply.count * perGather;
    const waiting = Math.max(0, rounds - 1) * Math.max(0, supply.respawnSeconds - roundSeconds);

    gatherSeconds += gathers * perGather + waiting;
    gatherXp += gathers * avgGatherXp * (sectionMultiplier[String(ing.section)] ?? 1);
  }

  // Cooking: prep, bar, cook time, plus a click.
  const autoPrep = autoPrepSections(levels).has(recipe.section);
  const perCook =
    (autoPrep ? 0 : CONFIG.cooking.prepMs / 1000) +
    CONFIG.cooking.barMs / 1000 +
    cookDurationMs(levels) / 1000 +
    PLAYER.reactionSeconds;

  // Travel: out to the ingredients and back to the kitchen once per batch,
  // plus a hop per extra section the recipe draws on.
  const travel =
    walkSeconds(PLAYER.tilesSectionToKitchen) * 2 +
    walkSeconds(PLAYER.tilesSectionToKitchen) * Math.max(0, sectionsVisited.size - 1);

  const mix = qualityMix(levels, panTier);
  let cookXp = 0;
  for (const [quality, share] of Object.entries(mix) as [Quality, number][]) {
    if (share <= 0) continue;
    const awards = cookXpAwards(recipe, levels, quality);
    cookXp += share * awards.reduce((total, a) => total + a.xp, 0);
  }

  const seconds = gatherSeconds + batch * perCook + travel;
  // Chef XP mirrors every skill award, so the chef gain is the sum of both.
  const chefXp = gatherXp + batch * cookXp;

  return { seconds, chefXp, gatherXp, cookXp: batch * cookXp, batch, sectionsVisited };
}


/** Divides a batch of gathering XP across the sections that were worked. */
function splitGatherXp(
  gatherXp: number,
  sections: Set<number>,
): { foraging: number; prospecting: number } {
  let foragingWeight = 0;
  let prospectingWeight = 0;
  for (const index of sections) {
    const split = SECTION_SKILL_SPLIT.get(index);
    if (!split) continue;
    foragingWeight += split.foraging;
    prospectingWeight += split.prospecting;
  }
  const total = Math.max(foragingWeight + prospectingWeight, 1);
  return {
    foraging: (gatherXp * foragingWeight) / total,
    prospecting: (gatherXp * prospectingWeight) / total,
  };
}


/**
 * A level table built here rather than read from the shared module.
 *
 * The shared curve is fixed at import time, so exploring a different skill base
 * means computing levels locally. Everything downstream takes a SkillLevels
 * record, so the rest of the shared code is used unchanged.
 */
function makeLevelTable(base: number, growth: number, maxLevel: number): number[] {
  const cumulative = [0, 0];
  let step = base;
  for (let level = 2; level <= maxLevel; level += 1) {
    cumulative[level] = Math.round((cumulative[level - 1] ?? 0) + step);
    step *= growth;
  }
  return cumulative;
}

function levelFor(table: number[], maxLevel: number, xp: number): number {
  let level = 1;
  while (level < maxLevel && xp >= (table[level + 1] ?? Infinity)) level += 1;
  return level;
}

function levelsFrom(table: number[], xp: SkillXp): SkillLevels {
  const at = (value: number) => levelFor(table, CONFIG.skills.maxLevel, value);
  return {
    foraging: at(xp.foraging),
    prospecting: at(xp.prospecting),
    knifework: at(xp.knifework),
    firecraft: at(xp.firecraft),
    spicecraft: at(xp.spicecraft),
  };
}

export interface SimResult {
  hoursToChef: Map<number, number>;
  timeline: { chefLevel: number; hours: number; recipe: string }[];
  cappedOut: boolean;
}

function simulate(verbose = false): SimResult {
  const skillXp: SkillXp = emptySkillXp();
  let chefXp = 0;
  let seconds = 0;
  let panTier = 0;

  const hoursToChef = new Map<number, number>();
  const timeline: { chefLevel: number; hours: number; recipe: string }[] = [];
  const milestones = new Map<string, number>();
  let lastLevel = 1;

  while (chefLevelForXp(chefXp) < CONFIG.chef.maxLevel) {
    if (seconds > TIME_CAP_HOURS * SECONDS_PER_HOUR) {
      return { hoursToChef, timeline, cappedOut: true };
    }

    const levels = levelsFromXp(skillXp);

    // A player buys the pan upgrades as they become affordable; approximate
    // that by tier-ing up on firecraft, which is what actually gates the value.
    if (levels.firecraft >= 8) panTier = 2;
    else if (levels.firecraft >= 4) panTier = 1;

    const options = cookableRecipes(levels, chefLevelForXp(chefXp));
    if (options.length === 0) {
      throw new Error(`nothing cookable at ${JSON.stringify(levels)} - progression is stuck`);
    }

    const best = chooseRecipe(options, levels, panTier);

    const beforeSeconds = seconds;
    const beforeXp = chefXp;
    seconds += best.seconds;
    chefXp += best.chefXp;

    // Gathering XP splits between the two gathering skills by which nodes were
    // worked; cooking XP goes where cookXpAwards says.
    const mix = qualityMix(levels, panTier);
    const dominantQuality = (Object.entries(mix) as [Quality, number][]).reduce((a, b) =>
      b[1] > a[1] ? b : a,
    )[0];

    const split = splitGatherXp(best.gatherXp, best.sectionsVisited);
    skillXp.foraging += split.foraging;
    skillXp.prospecting += split.prospecting;

    for (const award of cookXpAwards(best.recipe, levels, dominantQuality)) {
      skillXp[award.skill] += award.xp * best.batch;
    }

    // Report the first moment each skill milestone lands, so the acceptance
    // criteria ("Honeycap saute at Knifework 2") can be checked, not assumed.
    const after = levelsFromXp(skillXp);
    for (const skill of SKILL_IDS) {
      const was = milestones.get(skill) ?? 1;
      if (after[skill] > was) {
        milestones.set(skill, after[skill]);
        if (verbose && after[skill] <= 3) {
          console.log(
            `       ${CONFIG.skills.names[skill]} ${after[skill]} at ${(seconds / SECONDS_PER_HOUR).toFixed(2)}h`,
          );
        }
      }
    }

    const nowLevel = chefLevelForXp(chefXp);
    if (nowLevel > lastLevel) {
      for (let level = lastLevel + 1; level <= nowLevel; level += 1) {
        /*
         * Interpolate the crossing inside the batch rather than reporting the
         * batch end. A batch can run for minutes once respawn waits are in it,
         * and rounding up to its end is what made this disagree with the
         * tuner, which interpolates the same crossing.
         */
        const needed = chefXpToReach(level);
        const span = Math.max(chefXp - beforeXp, 1);
        const at = beforeSeconds + ((needed - beforeXp) / span) * (seconds - beforeSeconds);
        const hours = Math.max(beforeSeconds, Math.min(at, seconds)) / SECONDS_PER_HOUR;

        hoursToChef.set(level, hours);
        timeline.push({
          chefLevel: level,
          hours,
          recipe: best.recipe.name,
        });
        if (verbose) {
          console.log(
            `  Chef ${String(level).padStart(2)} at ${hours.toFixed(2).padStart(6)}h  ` +
              `cooking ${best.recipe.name}`,
          );
        }
      }
      lastLevel = nowLevel;
    }
  }

  return { hoursToChef, timeline, cappedOut: false };
}

// --------------------------------------------------------------------------
// Reporting and tuning
// --------------------------------------------------------------------------

const TARGETS = Object.entries(CONFIG.chef.targetHours).map(([level, hours]) => ({
  level: Number(level),
  hours,
}));

function report(result: SimResult) {
  console.log("\n  level   hours   target   delta");
  console.log("  -----   -----   ------   -----");

  let worst = 0;
  for (const target of TARGETS) {
    const actual = result.hoursToChef.get(target.level);
    if (actual === undefined) {
      console.log(`  ${String(target.level).padStart(5)}       -   ${String(target.hours).padStart(6)}   never reached`);
      worst = Infinity;
      continue;
    }
    const delta = (actual - target.hours) / target.hours;
    worst = Math.max(worst, Math.abs(delta));
    const sign = delta >= 0 ? "+" : "";
    console.log(
      `  ${String(target.level).padStart(5)}   ${actual.toFixed(2).padStart(5)}   ${String(
        target.hours,
      ).padStart(6)}   ${sign}${(delta * 100).toFixed(1)}%`,
    );
  }

  console.log(
    `\n  worst deviation: ${(worst * 100).toFixed(1)}% (tolerance 20%) - ${
      worst <= 0.2 ? "within target" : "OUT OF TOLERANCE"
    }`,
  );
  return worst;
}

/**
 * Searches base/growth for a curve that hits all three targets.
 *
 * The simulation reads the curve from CONFIG at import time, so the search
 * rebuilds the level table itself rather than re-importing the module.
 */
function tune() {
  console.log("searching chef.baseXp / chef.growth / skills.baseXp...\n");

  let best: { base: number; growth: number; skillBase: number; worst: number } | null = null;
  let gatingChef = makeLevelTable(CONFIG.chef.baseXp, CONFIG.chef.growth, CONFIG.chef.maxLevel);
  let round = 0;

  /*
   * The skill base shapes the XP rate over time, so it is worth searching - but
   * only within a range that keeps skills a progression rather than a formality.
   * Left unbounded the search drives it to 20, which maxes every skill inside
   * an hour and makes the unlock ladder meaningless.
   */
  const keepSkills = process.argv.includes("--keep-skills");
  const skillLow = keepSkills ? CONFIG.skills.baseXp : 120;
  const skillHigh = keepSkills ? CONFIG.skills.baseXp : 260;

  /*
   * Fixed point: each round searches against a gating curve, then adopts the
   * winner as the gating curve for the next round. Three or four rounds is
   * plenty - the section thresholds only move when the curve moves a lot.
   */
  for (round = 1; round <= 4; round += 1) {
    curveCache.clear();
    let roundBest: typeof best = null;

    for (let skillBase = skillLow; skillBase <= skillHigh; skillBase += 5) {
      const skillTable = makeLevelTable(skillBase, CONFIG.skills.growth, CONFIG.skills.maxLevel);
      const key = `r${round}s${skillBase}`;

      for (let growth = 1.02; growth <= 1.45; growth += 0.002) {
        for (let base = 40; base <= 4000; base += 10) {
          const worst = evaluate(base, growth, skillTable, gatingChef, key);
          if (worst === null) continue;
          if (!roundBest || worst < roundBest.worst) {
            roundBest = { base, growth, skillBase, worst };
          }
        }
      }
    }

    if (!roundBest) break;
    console.log(
      `  round ${round}: base ${roundBest.base}, growth ${roundBest.growth.toFixed(3)}, ` +
        `skills ${roundBest.skillBase} (worst ${(roundBest.worst * 100).toFixed(1)}%)`,
    );

    const settled =
      best !== null &&
      best.base === roundBest.base &&
      Math.abs(best.growth - roundBest.growth) < 1e-9 &&
      best.skillBase === roundBest.skillBase;
    best = roundBest;
    gatingChef = makeLevelTable(best.base, best.growth, CONFIG.chef.maxLevel);
    if (settled) break;
  }

  if (!best) {
    console.log("no curve found in the search space");
    return;
  }

  console.log(
    `best: chef.baseXp = ${best.base}, chef.growth = ${best.growth.toFixed(3)}, ` +
      `skills.baseXp = ${best.skillBase} (worst deviation ${(best.worst * 100).toFixed(1)}%)`,
  );
  console.log("\nSet those in shared/src/content/skills.json and re-run without --tune.");
}

/**
 * Worst relative error for a candidate curve.
 *
 * Reruns the loop with a substituted chef table. The XP the loop *earns* does
 * not depend on the chef curve at all - only skill levels drive it - so the
 * timeline of (seconds, chefXp) can be computed once and re-levelled cheaply.
 */
const curveCache = new Map<string, { seconds: number; chefXp: number }[]>();

/**
 * The earned-XP trace for a given skill curve.
 *
 * `chefTable` matters even though this measures XP rather than levels: the
 * sections unlock on Chef Level, so which recipes are reachable - and therefore
 * how fast XP comes in - depends on the very curve being evaluated. Passing the
 * compiled-in curve here instead made the tuner optimise against a fiction, and
 * it reported deviations that the real run did not reproduce.
 */
function earnCurve(
  skillTable: number[],
  chefTable: number[],
  key: string,
): { seconds: number; chefXp: number }[] {
  const cached = curveCache.get(key);
  if (cached) return cached;

  const skillXp: SkillXp = emptySkillXp();
  let chefXp = 0;
  let seconds = 0;
  let panTier = 0;
  const points: { seconds: number; chefXp: number }[] = [{ seconds: 0, chefXp: 0 }];

  // Run well past any plausible level-30 requirement.
  while (seconds < TIME_CAP_HOURS * SECONDS_PER_HOUR) {
    const levels = levelsFrom(skillTable, skillXp);
    if (levels.firecraft >= 8) panTier = 2;
    else if (levels.firecraft >= 4) panTier = 1;

    const options = cookableRecipes(levels, levelFor(chefTable, CONFIG.chef.maxLevel, chefXp));
    if (options.length === 0) break;

    const best = chooseRecipe(options, levels, panTier);

    seconds += best.seconds;
    chefXp += best.chefXp;

    const mix = qualityMix(levels, panTier);
    const dominantQuality = (Object.entries(mix) as [Quality, number][]).reduce((a, b) =>
      b[1] > a[1] ? b : a,
    )[0];

    const split = splitGatherXp(best.gatherXp, best.sectionsVisited);
    skillXp.foraging += split.foraging;
    skillXp.prospecting += split.prospecting;
    for (const award of cookXpAwards(best.recipe, levels, dominantQuality)) {
      skillXp[award.skill] += award.xp * best.batch;
    }

    points.push({ seconds, chefXp });
  }

  curveCache.set(key, points);
  return points;
}


/** Chef XP earned by a given moment, interpolating between recorded batches. */
function xpAt(points: { seconds: number; chefXp: number }[], seconds: number): number | null {
  const last = points[points.length - 1];
  if (!last || seconds > last.seconds) return null;

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.seconds < seconds) continue;
    const span = Math.max(b.seconds - a.seconds, 1);
    return a.chefXp + ((b.chefXp - a.chefXp) * (seconds - a.seconds)) / span;
  }
  return last.chefXp;
}

/** When a given amount of chef XP is reached, interpolated the same way. */
function secondsFor(points: { seconds: number; chefXp: number }[], xp: number): number | null {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.chefXp < xp) continue;
    const span = Math.max(b.chefXp - a.chefXp, 1);
    return a.seconds + ((b.seconds - a.seconds) * (xp - a.chefXp)) / span;
  }
  return null;
}

function evaluate(
  base: number,
  growth: number,
  skillTable: number[],
  gatingChef: number[],
  key: string,
): number | null {
  const cumulative = makeLevelTable(base, growth, CONFIG.chef.maxLevel);
  const points = earnCurve(skillTable, gatingChef, key);
  let worst = 0;

  for (const target of TARGETS) {
    const needed = cumulative[target.level] ?? Infinity;
    const reachedAt = secondsFor(points, needed);
    if (reachedAt === null) return null;

    const hours = reachedAt / SECONDS_PER_HOUR;
    worst = Math.max(worst, Math.abs(hours - target.hours) / target.hours);
  }
  return worst;
}

const args = process.argv.slice(2);

if (args.includes("--curve")) {
  const table = makeLevelTable(CONFIG.skills.baseXp, CONFIG.skills.growth, CONFIG.skills.maxLevel);
  const chefTable = makeLevelTable(CONFIG.chef.baseXp, CONFIG.chef.growth, CONFIG.chef.maxLevel);
  const points = earnCurve(table, chefTable, "diag");
  const at = (hours: number) => xpAt(points, hours * SECONDS_PER_HOUR) ?? 0;
  const x1 = at(2.5), x2 = at(10), x3 = at(25);
  console.log(`chef XP earned by 2.5h: ${Math.round(x1)}`);
  console.log(`chef XP earned by 10h : ${Math.round(x2)}  (ratio to 2.5h: ${(x2/x1).toFixed(2)})`);
  console.log(`chef XP earned by 25h : ${Math.round(x3)}  (ratio to 10h : ${(x3/x2).toFixed(2)})`);
  console.log(`
A geometric chef curve needs those two ratios to be similar.`);
} else if (args.includes("--tune")) {
  tune();
} else {
  const verbose = args.includes("--verbose");
  console.log("simulate-progression");
  console.log(
    `  chef curve: base ${CONFIG.chef.baseXp}, growth ${CONFIG.chef.growth} ` +
      `(max level ${CONFIG.chef.maxLevel})`,
  );
  console.log(
    `  assumptions: timing sigma ${PLAYER.timingSigmaMs}ms, batch ${PLAYER.batchSize} dishes, ` +
      `${PLAYER.reactionSeconds}s per action\n`,
  );

  if (verbose) console.log("  timeline:");
  const result = simulate(verbose);
  if (result.cappedOut) {
    console.log(`\n  never reached Chef ${CONFIG.chef.maxLevel} within ${TIME_CAP_HOURS}h`);
  }
  const worst = report(result);
  process.exitCode = worst <= 0.2 ? 0 : 1;
}
