/**
 * Checks the ambience decisions that do not need a renderer.
 *
 *   npx tsx scripts/test-ambience.ts
 *
 * The day-night curve, the villager roster and the ground they are allowed to
 * walk on are all content-driven arithmetic, so "they never stand in a
 * doorway" and "the sky loop joins up" are claims with checks behind them
 * rather than things somebody once looked at.
 *
 * The scenery scatter used to be checked here too. There is no scatter any
 * more: the shrubs and the boulders are painted into the maps, which is most
 * of the point of a painted map.
 */

import {
  AMBIENCE,
  AREAS,
  CELL,
  DAY_CYCLE_MS,
  HUB_MAP,
  VILLAGER_KEEP_AWAY,
  areaFor,
  dayLabel,
  dayPhase,
  dayTint,
  darkestStop,
  hashSeed,
  interactiveZones,
  isWalkableOn,
  lifeFor,
  mixTint,
  nearZone,
  seededRandom,
  validateAllLayouts,
  villagerGround,
  zonesOf,
} from "@crazycauldron/shared";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

console.log("test-ambience\n");

// --- the seeded generator --------------------------------------------------
console.log("-- seeding --");
{
  const a = seededRandom(1234);
  const b = seededRandom(1234);
  const first = Array.from({ length: 20 }, () => a());
  const second = Array.from({ length: 20 }, () => b());
  check("the same seed gives the same sequence", first.every((v, i) => v === second[i]));

  const other = seededRandom(1235);
  const different = Array.from({ length: 20 }, () => other());
  check("a different seed does not", first.some((v, i) => v !== different[i]));
  check("every value is in 0..1", first.every((v) => v >= 0 && v < 1));
  check("two room ids seed different towns", hashSeed("room-a") !== hashSeed("room-b"));
}

// --- day and night ---------------------------------------------------------
console.log("\n-- day and night --");
{
  check("the cycle is twenty minutes", DAY_CYCLE_MS === 20 * 60_000, `${DAY_CYCLE_MS}ms`);
  check("dawn is phase zero", dayPhase(0) === 0);
  check("half way round is phase 0.5", Math.abs(dayPhase(DAY_CYCLE_MS / 2) - 0.5) < 1e-9);
  check("the phase wraps", dayPhase(DAY_CYCLE_MS) === 0);

  // The loop has to join up, or the sky jumps once every twenty minutes.
  const start = dayTint(0);
  const end = dayTint(DAY_CYCLE_MS - 1);
  const gap = Math.max(
    ...[16, 8, 0].map((shift) => Math.abs(((start >> shift) & 0xff) - ((end >> shift) & 0xff))),
  );
  check("the loop joins up at dawn", gap <= 2, `${gap}/255 apart`);

  /*
   * Nothing may get dark enough to hide what is standing on it. This matters
   * more than it did: the tint now multiplies a painting, where a heavy one
   * would be obvious, rather than a flat green tile where it was not.
   */
  check(
    "the ground never drops below half brightness",
    darkestStop() >= 0.5,
    `darkest channel ${(darkestStop() * 100).toFixed(0)}%`,
  );

  const labels = new Set<string>();
  for (let i = 0; i < 40; i += 1) labels.add(dayLabel((DAY_CYCLE_MS * i) / 40));
  check("every authored phase is reached", labels.size >= 5, [...labels].join(", "));

  check("white leaves a painting alone", mixTint(0x8fae9c, 0xffffff) === 0x8fae9c);
  check("black takes it to nothing", mixTint(0x8fae9c, 0x000000) === 0x000000);
}

// --- villagers -------------------------------------------------------------
console.log("\n-- villagers --");
{
  const crowd = AMBIENCE.villagers;
  check("four to six are wanted", crowd.min === 4 && crowd.max === 6, `${crowd.min}-${crowd.max}`);
  check("there are enough authored to fill a hub", crowd.roster.length >= crowd.max);
  check(
    "they walk slower than a player",
    crowd.stepMs > 180,
    `${crowd.stepMs}ms per cell against the player's 180ms`,
  );
  check(
    "every one of them has something to say",
    crowd.roster.every((v) => v.lines.length > 0 && v.lines.every((line) => line.trim() !== "")),
  );
  check(
    "each greeting is a single short line",
    crowd.roster.every((v) => v.lines.every((line) => line.length <= 60 && !line.includes("\n"))),
  );
}

// --- where villagers may walk ----------------------------------------------
console.log("\n-- villager ground --");
{
  const crowd = AMBIENCE.villagers;
  const ground = villagerGround();
  const keepClear = zonesOf(HUB_MAP).filter((z) => z.kind !== "portal");

  check("they have room to wander", ground.length > crowd.max * 10, `${ground.length} cells`);
  check(
    "every cell they may use is walkable",
    ground.every((t) => isWalkableOn(HUB_MAP, t.tileX, t.tileY)),
  );

  /*
   * The cauldron is a scenery zone on the painted hub rather than a block in
   * the middle of a grid, so "three clear of the cauldron" is measured against
   * that zone like any other.
   */
  check(
    `they stay ${VILLAGER_KEEP_AWAY} cells clear of the cauldron and the counters`,
    ground.every((t) =>
      keepClear.every((zone) => {
        const dx = Math.max(zone.c - t.tileX, 0, t.tileX - (zone.c + zone.w - 1));
        const dy = Math.max(zone.r - t.tileY, 0, t.tileY - (zone.r + zone.h - 1));
        return Math.max(dx, dy) > VILLAGER_KEEP_AWAY;
      }),
    ),
    keepClear.map((z) => z.id).join(", "),
  );
  check(
    "and never where a player has to stand to use something",
    ground.every((t) =>
      interactiveZones(HUB_MAP).every((zone) => !nearZone(zone, t.tileX, t.tileY)),
    ),
  );
}

// --- particles -------------------------------------------------------------
console.log("\n-- life --");
{
  for (const area of AREAS) {
    const life = lifeFor(area.map);
    check(`${area.id} has particles`, life !== null && life.everyMs > 0, life?.kind ?? "none");
  }

  const kitchen = zonesOf(HUB_MAP).find((z) => z.id === "kitchen");
  check(
    "the hub's smoke has a chimney to come out of",
    kitchen !== undefined,
    kitchen ? `kitchen at ${kitchen.c},${kitchen.r}` : "no kitchen zone",
  );
}

// --- layout ----------------------------------------------------------------
console.log("\n-- layout --");
{
  const problems = validateAllLayouts();
  check(
    "every map lays out legally",
    problems.length === 0,
    problems.map((p) => `map ${p.map}: ${p.message}`).join(" | "),
  );

  for (const area of AREAS) {
    const zones = interactiveZones(area.map);
    check(
      `${area.id}: every gate and counter has somewhere to stand`,
      zones.every((zone) => {
        for (let r = zone.r - 2; r < zone.r + zone.h + 2; r += 1) {
          for (let c = zone.c - 2; c < zone.c + zone.w + 2; c += 1) {
            if (isWalkableOn(area.map, c, r) && nearZone(zone, c, r)) return true;
          }
        }
        return false;
      }),
      zones.map((z) => z.id).join(", "),
    );
  }

  const hub = areaFor(HUB_MAP);
  check(
    "the hub's three counters are placed",
    ["kitchen", "tavern", "outfitter"].every((id) =>
      hub.zones.some((z) => z.id === id && z.kind === "building"),
    ),
  );
  check(
    "and its three gates",
    [1, 2, 3].every((section) =>
      hub.zones.some((z) => z.kind === "portal" && z.section === section),
    ),
  );
  check(
    "every zone's baseline is inside its own footprint",
    AREAS.every((area) => area.zones.every((z) => z.baseline >= z.r && z.baseline < z.r + z.h)),
    "which is what decides front from behind",
  );
  check("the cell size is what the maps were built at", CELL === 24, `${CELL}px`);
}

console.log(`\n${failures === 0 ? "test-ambience: OK" : `test-ambience: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
