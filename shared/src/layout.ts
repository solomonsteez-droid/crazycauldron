/**
 * Whether a map's furniture actually fits on it.
 *
 * Buildings, gates, props and gather nodes are all authored by hand in JSON,
 * and the failure modes are quiet ones: a shrub on the kitchen doorstep, two
 * nodes on the same tile, a well standing in the middle of a path. None of
 * those throw - they just look wrong, and only to somebody who happens to walk
 * past. So the rules are written down here and checked, and the server refuses
 * to start on a map that breaks them.
 *
 * The rules, in one place:
 *
 *   - nothing occupies the same tile as anything else
 *   - nothing stands on a path tile
 *   - nothing stands on, or within one tile of, a doorway
 *   - buildings keep a clear ring around themselves and around the cauldron
 *   - villagers have somewhere legal left to walk
 */

import { MAP_SIZE } from "./constants.js";
import { AMBIENCE, HUB_PORTALS, HUB_STATIONS, SECTIONS, findSection } from "./content/index.js";
import { doorwayFor, hubTileId, isWalkable } from "./map.js";
import { HUB_MAP, isWalkableOn, sectionTileId, spawnFor } from "./sectionMap.js";
import { TileId, type TilePos } from "./types.js";

/** Tiles that must stay clear around a building, and around the cauldron. */
export const BUILDING_CLEARANCE = 3;

/** The cauldron plinth, as a rectangle of tiles. */
const CAULDRON = { minX: MAP_SIZE / 2 - 2, maxX: MAP_SIZE / 2 + 1 };

export interface Placement {
  kind: "building" | "gate" | "prop" | "node" | "spawn";
  id: string;
  tileX: number;
  tileY: number;
}

export interface LayoutProblem {
  map: number;
  message: string;
}

const key = (tile: TilePos) => `${tile.tileX},${tile.tileY}`;
const chebyshev = (a: TilePos, b: TilePos) =>
  Math.max(Math.abs(a.tileX - b.tileX), Math.abs(a.tileY - b.tileY));

/** Chebyshev distance from a tile to the nearest tile of the cauldron block. */
function toCauldron(tile: TilePos): number {
  const dx = Math.max(CAULDRON.minX - tile.tileX, 0, tile.tileX - CAULDRON.maxX);
  const dy = Math.max(CAULDRON.minX - tile.tileY, 0, tile.tileY - CAULDRON.maxX);
  return Math.max(dx, dy);
}

/** Everything placed on a map, in the order a report should name it. */
export function placementsFor(mapId: number): Placement[] {
  if (mapId === HUB_MAP) {
    return [
      ...HUB_STATIONS.map((s): Placement => ({
        kind: "building",
        id: s.id,
        tileX: s.tileX,
        tileY: s.tileY,
      })),
      ...HUB_PORTALS.map((p): Placement => ({
        kind: "gate",
        id: `portal_${p.section}`,
        tileX: p.tileX,
        tileY: p.tileY,
      })),
      ...AMBIENCE.hubProps.items.map((p): Placement => ({
        kind: "prop",
        id: p.prop,
        tileX: p.tileX,
        tileY: p.tileY,
      })),
    ];
  }

  const section = findSection(mapId);
  if (!section) return [];
  return [
    ...section.nodes.map((n): Placement => ({
      kind: "node",
      id: n.id,
      tileX: n.tileX,
      tileY: n.tileY,
    })),
    {
      kind: "gate",
      id: "portal_hub",
      tileX: section.returnPortal.tileX,
      tileY: section.returnPortal.tileY,
    },
  ];
}

/** Every doorway on a map: the tile a player stands on to use a feature. */
export function doorwaysFor(mapId: number): TilePos[] {
  return placementsFor(mapId)
    .filter((p) => p.kind === "building" || p.kind === "gate")
    .map((p) => doorwayFor({ tileX: p.tileX, tileY: p.tileY }));
}

const tileIdOn = (mapId: number, tileX: number, tileY: number): TileId =>
  mapId === HUB_MAP ? hubTileId(tileX, tileY) : sectionTileId(mapId, tileX, tileY);

/**
 * Tiles a villager may stand on: walkable, and well clear of the cauldron and
 * of every shop front. Exported because the server walks them with it.
 */
export function villagerTiles(): TilePos[] {
  const keepAway = AMBIENCE.villagers.keepAwayTiles;
  const buildings = HUB_STATIONS.map((s) => ({ tileX: s.tileX, tileY: s.tileY }));
  const occupied = new Set(placementsFor(HUB_MAP).map((p) => key(p)));
  for (const doorway of doorwaysFor(HUB_MAP)) occupied.add(key(doorway));

  const tiles: TilePos[] = [];
  for (let tileY = 0; tileY < MAP_SIZE; tileY += 1) {
    for (let tileX = 0; tileX < MAP_SIZE; tileX += 1) {
      const tile = { tileX, tileY };
      if (!isWalkable(tileX, tileY)) continue;
      if (occupied.has(key(tile))) continue;
      if (toCauldron(tile) <= keepAway) continue;
      if (buildings.some((b) => chebyshev(b, tile) <= keepAway)) continue;
      tiles.push(tile);
    }
  }
  return tiles;
}

/** Checks one map and returns everything wrong with it, in reading order. */
export function validateLayout(mapId: number): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const say = (message: string) => problems.push({ map: mapId, message });

  const placements = placementsFor(mapId);
  const doorways = doorwaysFor(mapId);
  const seen = new Map<string, Placement>();

  for (const placement of placements) {
    const tile = { tileX: placement.tileX, tileY: placement.tileY };
    const at = key(tile);
    const label = `${placement.kind} ${placement.id} at ${at}`;

    const clash = seen.get(at);
    if (clash) say(`${label} is on top of ${clash.kind} ${clash.id}`);
    seen.set(at, placement);

    if (!isWalkableOn(mapId, tile.tileX, tile.tileY)) {
      say(`${label} is off the walkable map`);
    }
    if (tileIdOn(mapId, tile.tileX, tile.tileY) === TileId.Path) {
      say(`${label} stands on a path tile`);
    }

    // Its own doorway does not count against it; anyone else's does.
    const own = doorwayFor(tile);
    for (const doorway of doorways) {
      if (doorway.tileX === own.tileX && doorway.tileY === own.tileY) continue;
      if (chebyshev(doorway, tile) <= 1) {
        say(`${label} is within a tile of the doorway at ${key(doorway)}`);
        break;
      }
    }
  }

  if (mapId === HUB_MAP) {
    const buildings = placements.filter((p) => p.kind === "building");
    for (const building of buildings) {
      const tile = { tileX: building.tileX, tileY: building.tileY };

      if (toCauldron(tile) <= BUILDING_CLEARANCE) {
        say(
          `building ${building.id} at ${key(tile)} is ${toCauldron(tile)} tiles from the cauldron, ` +
            `which needs ${BUILDING_CLEARANCE + 1}`,
        );
      }

      for (const other of placements) {
        if (other === building) continue;
        const otherTile = { tileX: other.tileX, tileY: other.tileY };
        const gap = chebyshev(tile, otherTile);
        if (gap <= BUILDING_CLEARANCE) {
          say(
            `building ${building.id} at ${key(tile)} has ${other.kind} ${other.id} ` +
              `${gap} tile(s) away, inside its ${BUILDING_CLEARANCE}-tile ring`,
          );
        }
      }
    }

    const walkable = villagerTiles();
    if (walkable.length < AMBIENCE.villagers.max * 4) {
      say(
        `villagers have only ${walkable.length} legal tiles to walk, which is not ` +
          `room for ${AMBIENCE.villagers.max} of them`,
      );
    }
    const doorways = new Set(doorwaysFor(HUB_MAP).map(key));
    const onDoor = walkable.filter((tile) => doorways.has(key(tile)));
    if (onDoor.length > 0) {
      say(`villagers may stand in ${onDoor.length} doorway(s)`);
    }
  } else {
    const spawn = spawnFor(mapId);
    if (!isWalkableOn(mapId, spawn.tileX, spawn.tileY)) {
      say(`the spawn tile ${key(spawn)} is not walkable`);
    }
  }

  return problems;
}

/** Every map, hub first. Empty means the world is laid out legally. */
export function validateAllLayouts(): LayoutProblem[] {
  return [HUB_MAP, ...SECTIONS.map((s) => s.index)].flatMap(validateLayout);
}
