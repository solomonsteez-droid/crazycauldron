/**
 * The placeholder hub map. Lives in `shared` deliberately: the server validates
 * movement against this grid and the client draws from it, so there is exactly
 * one definition of where a player may stand.
 */

import { MAP_SIZE } from "./constants.js";
import { HUB_PORTALS, HUB_STATIONS } from "./content/index.js";
import { TileId, type TilePos } from "./types.js";

/** Where a freshly admitted player appears. Must be walkable. */
export const HUB_SPAWN: TilePos = { tileX: 12, tileY: 17 };

/** Ring of tiles around the edge that nobody may enter - keeps players on-map. */
const BORDER = 2;

/** The cauldron plinth: a solid 4x4 block in the middle of the plaza. */
const CAULDRON_MIN = MAP_SIZE / 2 - 2; // 10
const CAULDRON_MAX = MAP_SIZE / 2 + 1; // 13

function inCauldron(tileX: number, tileY: number): boolean {
  return (
    tileX >= CAULDRON_MIN && tileX <= CAULDRON_MAX && tileY >= CAULDRON_MIN && tileY <= CAULDRON_MAX
  );
}

export function inBounds(tileX: number, tileY: number): boolean {
  return tileX >= 0 && tileY >= 0 && tileX < MAP_SIZE && tileY < MAP_SIZE;
}

/**
 * A tile a player may occupy. The server is the only authority on this; the
 * client calls it purely to avoid drawing hopeless move previews.
 */
export function isWalkable(tileX: number, tileY: number): boolean {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return false;
  if (!inBounds(tileX, tileY)) return false;
  if (tileX < BORDER || tileY < BORDER) return false;
  if (tileX >= MAP_SIZE - BORDER || tileY >= MAP_SIZE - BORDER) return false;
  return !inCauldron(tileX, tileY);
}

const MID = MAP_SIZE / 2;

/** Every station and gate, as plain tiles. */
export function hubFeatureTiles(): TilePos[] {
  return [
    ...HUB_STATIONS.map((s) => ({ tileX: s.tileX, tileY: s.tileY })),
    ...HUB_PORTALS.map((p) => ({ tileX: p.tileX, tileY: p.tileY })),
  ];
}

/**
 * The tile a player stands on to use a feature - the first step of its spur.
 *
 * A building occupies its own tile and the path stops beside it, so the
 * doorway is a real place rather than a coincidence. Nothing may be drawn
 * there, which is what keeps a shrub out of the kitchen entrance.
 */
export function doorwayFor(feature: TilePos): TilePos {
  if (feature.tileY !== MID) {
    return { tileX: feature.tileX, tileY: feature.tileY + (feature.tileY < MID ? 1 : -1) };
  }
  if (feature.tileX !== MID) {
    return { tileX: feature.tileX + (feature.tileX < MID ? 1 : -1), tileY: feature.tileY };
  }
  return { tileX: feature.tileX, tileY: feature.tileY + 1 };
}

/**
 * Path tiles that run from the central avenues out to each station and gate.
 *
 * Every building and gate sits at the end of its own short spur rather than
 * floating in the grass, which is what makes the plaza read as a place people
 * walk through. The spur stops one tile short: the building stands on grass
 * with a path at its door, so "nothing may sit on a path" and "every building
 * is reachable" are both true at once. Built from the same content the server
 * and client position the features from, so moving one in sections.json moves
 * its path too.
 */
function buildSpurs(): Set<number> {
  const tiles = new Set<number>();
  const add = (x: number, y: number) => tiles.add(y * MAP_SIZE + x);

  for (const feature of hubFeatureTiles()) {
    // Along y to the middle row, then along x to the middle column. A feature
    // already on one of those lines skips that leg - stepping "towards" a row
    // you are already on never arrives.
    if (feature.tileY !== MID) {
      const stepY = feature.tileY < MID ? 1 : -1;
      for (let y = feature.tileY + stepY; y !== MID; y += stepY) add(feature.tileX, y);
    }
    if (feature.tileX !== MID) {
      const stepX = feature.tileX < MID ? 1 : -1;
      const startX = feature.tileY === MID ? feature.tileX + stepX : feature.tileX;
      for (let x = startX; x !== MID; x += stepX) add(x, MID);
    }
    add(MID, MID);

    const doorway = doorwayFor(feature);
    add(doorway.tileX, doorway.tileY);
  }
  return tiles;
}

const SPURS = buildSpurs();

/**
 * Visual layer only. A path ring circles the cauldron, two avenues cross the
 * plaza, and a spur reaches each station and gate.
 */
export function hubTileId(tileX: number, tileY: number): TileId {
  const ringMin = CAULDRON_MIN - 2;
  const ringMax = CAULDRON_MAX + 2;
  const onRing =
    tileX >= ringMin && tileX <= ringMax && tileY >= ringMin && tileY <= ringMax &&
    (tileX === ringMin || tileX === ringMax || tileY === ringMin || tileY === ringMax);

  const onAvenue = tileX === MID || tileX === MID - 1 || tileY === MID || tileY === MID - 1;
  const onSpur = SPURS.has(tileY * MAP_SIZE + tileX);

  return onRing || onAvenue || onSpur ? TileId.Path : TileId.Grass;
}

/** Row-major [y][x] tile ids, built once at module load for the tilemap. */
export const HUB_TILES: readonly (readonly TileId[])[] = Array.from({ length: MAP_SIZE }, (_, y) =>
  Array.from({ length: MAP_SIZE }, (_, x) => hubTileId(x, y)),
);
