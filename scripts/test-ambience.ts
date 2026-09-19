/**
 * Checks the ambience decisions that do not need a renderer.
 *
 * Scenery placement, the day-night curve and the villager roster are all
 * content-driven arithmetic, so "nothing is ever drawn on a path" and "the sky
 * loop joins up" are claims with checks behind them rather than things somebody
 * once looked at.
 *
 *   npx tsx scripts/test-ambience.ts
 */

import {
  AMBIENCE,
  DAY_CYCLE_MS,
  HUB_MAP,
  MAP_SIZE,
  TERRAIN,
  TileId,
  dayLabel,
  dayPhase,
  dayTint,
  darkestStop,
  decorFor,
  dressingFor,
  dressingKeepClear,
  hashSeed,
  hubTileId,
  HUB_STATIONS,
  BUILDING_CLEARANCE,
  doorwaysFor,
  placementsFor,
  validateAllLayouts,
  villagerTiles,
  isWalkableOn,
  mixTint,
  planDressing,
  sectionTileId,
  seededRandom,
  DRESSING_CLEARANCE,
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
  check(
    "a different seed does not",
    first.some((v, i) => v !== [...Array(20)].map(() => other())[i]),
  );
  check("every value is in 0..1", first.every((v) => v >= 0 && v < 1));
  check("two room ids seed different towns", hashSeed("room-a") !== hashSeed("room-b"));
}

// --- dressing --------------------------------------------------------------
console.log("\n-- dressing --");
for (const map of TERRAIN.maps) {
  const mapId = map.map;
  const settings = dressingFor(mapId);
  if (!settings) {
    check(`map ${mapId} has dressing settings`, false);
    continue;
  }

  const plan = planDressing(mapId);
  const again = planDressing(mapId);

  check(
    `${map.name}: the plan is stable`,
    JSON.stringify(plan) === JSON.stringify(again),
    `${plan.length} pieces`,
  );

  // A crowded map may fall short of its target; it must never fall far short.
  check(
    `${map.name}: it places roughly what was asked for`,
    plan.length >= settings.count * 0.7,
    `${plan.length} of ${settings.count}`,
  );

  const tileId = (x: number, y: number) =>
    mapId === HUB_MAP ? hubTileId(x, y) : sectionTileId(mapId, x, y);

  check(
    `${map.name}: nothing stands on a path`,
    plan.every((p) => tileId(p.tileX, p.tileY) !== TileId.Path),
  );
  check(
    `${map.name}: nothing stands where a player cannot walk`,
    plan.every((p) => isWalkableOn(mapId, p.tileX, p.tileY)),
  );

  const clear = dressingKeepClear(mapId);
  const tooClose = plan.filter((p) =>
    clear.some(
      (t) =>
        Math.abs(t.tileX - p.tileX) <= DRESSING_CLEARANCE &&
        Math.abs(t.tileY - p.tileY) <= DRESSING_CLEARANCE,
    ),
  );
  check(
    `${map.name}: nothing crowds a node, door or gate`,
    tooClose.length === 0,
    tooClose.map((p) => `${p.decorId}@${p.tileX},${p.tileY}`).join(" "),
  );

  check(
    `${map.name}: no two pieces share a tile`,
    new Set(plan.map((p) => p.tileY * MAP_SIZE + p.tileX)).size === plan.length,
  );

  const known = new Set(decorFor(mapId).map((piece) => piece.id));
  check(
    `${map.name}: every piece comes from its own pack`,
    plan.every((p) => known.has(p.decorId)),
  );

  // Edge bias: with a bias above 1 the outer half of the map must hold more
  // scenery than the inner half, or the setting is doing nothing.
  const middle = (MAP_SIZE - 1) / 2;
  const outer = plan.filter(
    (p) => Math.max(Math.abs(p.tileX - middle), Math.abs(p.tileY - middle)) / middle > 0.5,
  ).length;
  check(
    `${map.name}: it thins out towards the middle`,
    outer > plan.length - outer,
    `${outer} outer, ${plan.length - outer} inner`,
  );
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

  // Nothing may get dark enough to hide what is standing on it.
  check(
    "the ground never drops below half brightness",
    darkestStop() >= 0.5,
    `darkest channel ${(darkestStop() * 100).toFixed(0)}%`,
  );

  const labels = new Set<string>();
  for (let i = 0; i < 40; i += 1) labels.add(dayLabel((DAY_CYCLE_MS * i) / 40));
  check("every authored phase is reached", labels.size >= 5, [...labels].join(", "));

  check("white leaves a tint alone", mixTint(0x8fae9c, 0xffffff) === 0x8fae9c);
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
    `${crowd.stepMs}ms per tile against the player's 180ms`,
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
  const tiles = villagerTiles();
  const keepAway = crowd.keepAwayTiles;
  const buildings = HUB_STATIONS.map((s) => ({ tileX: s.tileX, tileY: s.tileY }));
  const middle = (MAP_SIZE - 1) / 2;

  check("they have room to wander", tiles.length > crowd.max * 10, `${tiles.length} tiles`);
  check(
    `they stay ${keepAway} tiles clear of the cauldron`,
    tiles.every(
      (t) => Math.max(Math.abs(t.tileX - middle), Math.abs(t.tileY - middle)) > keepAway + 1,
    ),
  );
  check(
    `and ${keepAway} tiles clear of every shop front`,
    tiles.every((t) =>
      buildings.every(
        (b) => Math.max(Math.abs(b.tileX - t.tileX), Math.abs(b.tileY - t.tileY)) > keepAway,
      ),
    ),
  );
  const doorways = new Set(doorwaysFor(HUB_MAP).map((d) => `${d.tileX},${d.tileY}`));
  check(
    "and never stand in a doorway",
    tiles.every((t) => !doorways.has(`${t.tileX},${t.tileY}`)),
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

  const hub = placementsFor(HUB_MAP);
  const onEdge = (t: { tileX: number; tileY: number }) =>
    t.tileX <= 2 || t.tileY <= 2 || t.tileX >= MAP_SIZE - 3 || t.tileY >= MAP_SIZE - 3;
  const onRing = (t: { tileX: number; tileY: number }) =>
    t.tileX <= 3 || t.tileY <= 3 || t.tileX >= MAP_SIZE - 4 || t.tileY >= MAP_SIZE - 4;

  const buildings = hub.filter((p) => p.kind === "building");
  const props = hub.filter((p) => p.kind === "prop");

  check(
    "the three buildings stand on the grid edge",
    buildings.length === 3 && buildings.every(onEdge),
    buildings.map((p) => `${p.id}@${p.tileX},${p.tileY}`).join(" "),
  );
  check(
    "the plaza props are out on the ring",
    props.length === 6 && props.every(onRing),
    props.map((p) => `${p.id}@${p.tileX},${p.tileY}`).join(" "),
  );
  check(
    `each building keeps its ${BUILDING_CLEARANCE}-tile ring`,
    buildings.every((b) =>
      hub.every(
        (o) =>
          o === b ||
          Math.max(Math.abs(o.tileX - b.tileX), Math.abs(o.tileY - b.tileY)) > BUILDING_CLEARANCE,
      ),
    ),
  );
  check(
    "nothing anywhere stands on a path",
    hub.every((p) => hubTileId(p.tileX, p.tileY) !== TileId.Path),
  );
}

// --- sound -----------------------------------------------------------------
console.log("\n-- sound --");
{
  check(
    "every map has an ambient bed named",
    TERRAIN.maps.every((m) => AMBIENCE.sound.ambient.some((a) => a.map === m.map)),
  );
  check(
    "every cue has a fallback tone",
    AMBIENCE.sound.cues.every((c) => c.tone > 0 && c.ms > 0),
  );
  check(
    "the default volumes are audible but not loud",
    Object.values(AMBIENCE.sound.defaults).every((v) => v > 0 && v <= 1),
  );
}

console.log(`\n${failures === 0 ? "test-ambience: OK" : `test-ambience: ${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
