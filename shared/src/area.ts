/**
 * The world, now that the world is a painting.
 *
 * Four hand-painted areas replaced the isometric tile grid. What is left of the
 * grid is invisible: a square lattice of 24px cells laid over each painting,
 * which is the only thing the server knows about the map. The paint says where
 * the tavern looks like it is; this says where a player may stand.
 *
 * Square rather than diamond, because there is nothing left to tile. A diamond
 * grid existed to line up with diamond tiles; over a painting it only means
 * that walking north-east costs a different distance to walking north, for no
 * reason anybody can see.
 *
 * Everything here is loaded from shared/src/content/maps/*.json, which is
 * written by scripts/build-areas.ts and corrected by hand in /dev/mapedit.
 */

import hubJson from "./content/maps/hub.json" with { type: "json" };
import meadowsJson from "./content/maps/meadows.json" with { type: "json" };
import forestJson from "./content/maps/deep_forest.json" with { type: "json" };
import cavesJson from "./content/maps/mystical_caves.json" with { type: "json" };
import type { AreaFile, AreaNode, AreaZone } from "./content/types.js";
import type { TilePos } from "./types.js";

export const AREAS: AreaFile[] = [
  hubJson as unknown as AreaFile,
  meadowsJson as unknown as AreaFile,
  forestJson as unknown as AreaFile,
  cavesJson as unknown as AreaFile,
];

const byMap = new Map(AREAS.map((a) => [a.map, a]));

/** 0 is the hub; 1..3 are the gathering areas, matching Section.index. */
export const HUB_MAP = 0;
export type MapId = number;

export function areaFor(mapId: MapId): AreaFile {
  return byMap.get(mapId) ?? AREAS[0]!;
}

export function findArea(mapId: MapId): AreaFile | undefined {
  return byMap.get(mapId);
}

/** World pixels per cell. The same for every area, and square. */
export const CELL = AREAS[0]!.cell;

/**
 * A cell's centre in world pixels.
 *
 * Callers keep saying "tile" because the movement protocol has always spoken
 * in tileX/tileY and there was no reason to churn every message to rename it.
 * A tile is now a square cell.
 */
export function cellToWorld(tileX: number, tileY: number): { x: number; y: number } {
  return { x: tileX * CELL + CELL / 2, y: tileY * CELL + CELL / 2 };
}

export function worldToCell(x: number, y: number): TilePos {
  return { tileX: Math.floor(x / CELL), tileY: Math.floor(y / CELL) };
}

export function inBoundsOn(mapId: MapId, tileX: number, tileY: number): boolean {
  const area = areaFor(mapId);
  return tileX >= 0 && tileY >= 0 && tileX < area.cols && tileY < area.rows;
}

/**
 * Whether a cell may be stood on. The one authority, used by the server to
 * validate every step and by the client only to avoid drawing hopeless moves.
 */
export function isWalkableOn(mapId: MapId, tileX: number, tileY: number): boolean {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return false;
  if (!inBoundsOn(mapId, tileX, tileY)) return false;
  return areaFor(mapId).walkable[tileY]?.[tileX] === ".";
}

/** Where a freshly admitted player appears in the hub. */
export const HUB_SPAWN: TilePos = {
  tileX: (byMap.get(HUB_MAP) ?? AREAS[0]!).spawn.col,
  tileY: (byMap.get(HUB_MAP) ?? AREAS[0]!).spawn.row,
};

export function spawnFor(mapId: MapId): TilePos {
  const area = areaFor(mapId);
  return { tileX: area.spawn.col, tileY: area.spawn.row };
}

/** The world rectangle an area's painting occupies. */
export function worldBoundsOf(mapId: MapId): { width: number; height: number } {
  const area = areaFor(mapId);
  return { width: area.cols * area.cell, height: area.rows * area.cell };
}

// --- zones -----------------------------------------------------------------

export function zonesOf(mapId: MapId): AreaZone[] {
  return areaFor(mapId).zones;
}

/** Zones a player can act on: the shop fronts and the gates. */
export function interactiveZones(mapId: MapId): AreaZone[] {
  return zonesOf(mapId).filter((z) => z.kind === "building" || z.kind === "portal");
}

export function zoneById(mapId: MapId, id: string): AreaZone | undefined {
  return zonesOf(mapId).find((z) => z.id === id);
}

export function zoneContains(zone: AreaZone, tileX: number, tileY: number): boolean {
  return (
    tileX >= zone.c && tileX < zone.c + zone.w && tileY >= zone.r && tileY < zone.r + zone.h
  );
}

/** The interactive zone a cell falls inside, if any. */
export function zoneAt(mapId: MapId, tileX: number, tileY: number): AreaZone | undefined {
  return interactiveZones(mapId).find((z) => zoneContains(z, tileX, tileY));
}

export function zoneCentre(zone: AreaZone): TilePos {
  return { tileX: Math.floor(zone.c + zone.w / 2), tileY: Math.floor(zone.r + zone.h / 2) };
}

/**
 * How close a player must be to a zone to use it.
 *
 * Measured to the zone's edge rather than its centre: a tavern nine cells wide
 * would otherwise be unusable from its own doorstep.
 */
export const ZONE_REACH = 2;

export function nearZone(zone: AreaZone, tileX: number, tileY: number): boolean {
  const dx = Math.max(zone.c - tileX, 0, tileX - (zone.c + zone.w - 1));
  const dy = Math.max(zone.r - tileY, 0, tileY - (zone.r + zone.h - 1));
  return Math.max(dx, dy) <= ZONE_REACH;
}

/**
 * The nearest walkable cell to a zone, for walking up to it.
 *
 * Searched outward from the zone's own footprint, because a painted building
 * is solid and the cell a player actually wants is the one just outside it.
 */
export function approachTo(mapId: MapId, zone: AreaZone, from: TilePos): TilePos | null {
  let best: TilePos | null = null;
  let bestDistance = Infinity;

  for (let r = zone.r - ZONE_REACH; r < zone.r + zone.h + ZONE_REACH; r += 1) {
    for (let c = zone.c - ZONE_REACH; c < zone.c + zone.w + ZONE_REACH; c += 1) {
      if (!isWalkableOn(mapId, c, r)) continue;
      if (!nearZone(zone, c, r)) continue;
      const distance = Math.max(Math.abs(c - from.tileX), Math.abs(r - from.tileY));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { tileX: c, tileY: r };
      }
    }
  }
  return best;
}

// --- gather nodes ----------------------------------------------------------

export function nodesOf(mapId: MapId): AreaNode[] {
  return areaFor(mapId).nodes;
}

export function areaNode(mapId: MapId, id: string): AreaNode | undefined {
  return nodesOf(mapId).find((n) => n.id === id);
}

/**
 * A node is gathered from beside it, not by standing on it.
 *
 * Chebyshev, so the eight cells around a node all count - on a square grid a
 * diagonal neighbour is as adjacent as an orthogonal one.
 */
export function isAdjacentOrOn(a: TilePos, b: TilePos): boolean {
  return Math.max(Math.abs(a.tileX - b.tileX), Math.abs(a.tileY - b.tileY)) <= 1;
}

/** Where a node stands, as a tile the rest of the game can reason about. */
export function nodeTile(node: AreaNode): TilePos {
  return { tileX: node.c, tileY: node.r };
}

// --- villagers -------------------------------------------------------------

/** How far a villager keeps from the cauldron and from every shop front. */
export const VILLAGER_KEEP_AWAY = 3;

/**
 * The cells a hub villager is allowed to stand on.
 *
 * Walkable, and well clear of the cauldron and of all three counters. A
 * villager loitering on the kitchen doorstep is exactly the kind of charm that
 * turns into an obstacle, and the zones are where players need to get to.
 */
export function villagerGround(): TilePos[] {
  const area = areaFor(HUB_MAP);
  const keepClear = area.zones.filter((z) => z.kind !== "portal");
  const doorways = new Set<string>();

  for (const zone of interactiveZones(HUB_MAP)) {
    for (let r = zone.r - ZONE_REACH; r < zone.r + zone.h + ZONE_REACH; r += 1) {
      for (let c = zone.c - ZONE_REACH; c < zone.c + zone.w + ZONE_REACH; c += 1) {
        if (nearZone(zone, c, r)) doorways.add(`${c},${r}`);
      }
    }
  }

  const tiles: TilePos[] = [];
  for (let tileY = 0; tileY < area.rows; tileY += 1) {
    for (let tileX = 0; tileX < area.cols; tileX += 1) {
      if (!isWalkableOn(HUB_MAP, tileX, tileY)) continue;
      if (doorways.has(`${tileX},${tileY}`)) continue;
      const tooClose = keepClear.some((zone) => {
        const dx = Math.max(zone.c - tileX, 0, tileX - (zone.c + zone.w - 1));
        const dy = Math.max(zone.r - tileY, 0, tileY - (zone.r + zone.h - 1));
        return Math.max(dx, dy) <= VILLAGER_KEEP_AWAY;
      });
      if (tooClose) continue;
      tiles.push({ tileX, tileY });
    }
  }
  return tiles;
}
