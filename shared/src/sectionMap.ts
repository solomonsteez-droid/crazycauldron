/**
 * The three gathering maps, built the same way as the hub: a 24x24 walkable
 * grid defined once in `shared` so the server can validate movement against
 * exactly what the client draws.
 *
 * Each section's obstacles and node positions come from sections.json, so a
 * designer can move a node or carve a new lake without touching code.
 */

import { MAP_SIZE } from "./constants.js";
import { SECTIONS, findSection, type GatherNodeDef, type Rect } from "./content/index.js";
import { TileId, type TilePos } from "./types.js";
import { inBounds, isWalkable as isHubWalkable } from "./map.js";

/** Same border as the hub, so the two maps feel like one world. */
const BORDER = 2;

/** 0 is the hub; 1..3 are the sections, matching `Section.index`. */
export const HUB_MAP = 0;
export type MapId = number;

function inRect(rect: Rect, tileX: number, tileY: number): boolean {
  return (
    tileX >= rect.x && tileX < rect.x + rect.w && tileY >= rect.y && tileY < rect.y + rect.h
  );
}

export function isWalkableInSection(sectionIndex: number, tileX: number, tileY: number): boolean {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return false;
  if (!inBounds(tileX, tileY)) return false;
  if (tileX < BORDER || tileY < BORDER) return false;
  if (tileX >= MAP_SIZE - BORDER || tileY >= MAP_SIZE - BORDER) return false;

  const section = findSection(sectionIndex);
  if (!section) return false;
  return !section.obstacles.some((rect) => inRect(rect, tileX, tileY));
}

/** One predicate for every map, so callers never branch on hub-vs-section. */
export function isWalkableOn(mapId: MapId, tileX: number, tileY: number): boolean {
  return mapId === HUB_MAP
    ? isHubWalkable(tileX, tileY)
    : isWalkableInSection(mapId, tileX, tileY);
}

export function spawnFor(mapId: MapId): TilePos {
  const section = findSection(mapId);
  return section ? section.spawn : { tileX: 12, tileY: 17 };
}

/**
 * Visual layer only. Two avenues cross at the middle and obstacles read as
 * rock, which is enough for the placeholder art to show where you cannot walk.
 */
export function sectionTileId(sectionIndex: number, tileX: number, tileY: number): TileId {
  if (!isWalkableInSection(sectionIndex, tileX, tileY)) {
    const section = findSection(sectionIndex);
    const blocked = section?.obstacles.some((rect) => inRect(rect, tileX, tileY)) ?? false;
    if (blocked) return TileId.Rock;
  }
  const mid = MAP_SIZE / 2;
  const onAvenue = tileX === mid || tileX === mid - 1 || tileY === mid || tileY === mid - 1;
  return onAvenue ? TileId.Path : TileId.Grass;
}

/** Row-major [y][x] tile ids for a section, built once per section at load. */
const TILE_CACHE = new Map<number, readonly (readonly TileId[])[]>();

export function sectionTiles(sectionIndex: number): readonly (readonly TileId[])[] {
  const cached = TILE_CACHE.get(sectionIndex);
  if (cached) return cached;

  const tiles = Array.from({ length: MAP_SIZE }, (_, y) =>
    Array.from({ length: MAP_SIZE }, (_, x) => sectionTileId(sectionIndex, x, y)),
  );
  TILE_CACHE.set(sectionIndex, tiles);
  return tiles;
}

/** The gather node standing on a tile, if any. */
export function nodeAt(sectionIndex: number, tileX: number, tileY: number): GatherNodeDef | null {
  const section = findSection(sectionIndex);
  if (!section) return null;
  return section.nodes.find((n) => n.tileX === tileX && n.tileY === tileY) ?? null;
}

/**
 * A node is gathered from an adjacent tile, not by standing on it, so a player
 * walking past a node does not need to path *through* it.
 */
export function isAdjacentOrOn(a: TilePos, b: TilePos): boolean {
  return Math.abs(a.tileX - b.tileX) <= 1 && Math.abs(a.tileY - b.tileY) <= 1;
}

/** Sanity check used by the content test: every node must be reachable. */
export function sectionNodeTiles(sectionIndex: number): TilePos[] {
  return (findSection(sectionIndex)?.nodes ?? []).map((n) => ({ tileX: n.tileX, tileY: n.tileY }));
}

export const SECTION_INDEXES = SECTIONS.map((s) => s.index);
