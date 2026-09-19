/**
 * Breadth-first pathfinding over the hub grid. Shared so the server can turn a
 * click destination into an authoritative tile-by-tile route; the client never
 * sends a path, only where it wants to go.
 */

import { MAX_PATH_TILES } from "./constants.js";
import { isWalkable } from "./map.js";
import type { Facing, TilePos } from "./types.js";

/** 4-directional movement: the isometric sprite sheet only has n/e/s/w. */
const STEPS: readonly (readonly [dx: number, dy: number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const key = (x: number, y: number) => y * 4096 + x;

/**
 * Shortest walkable route from `from` to `to`, excluding the start tile and
 * including the destination. Returns [] when unreachable, when the destination
 * is blocked, or when the shortest route is longer than MAX_PATH_TILES.
 *
 * `walkable` defaults to the hub grid; the sections pass their own predicate so
 * one search serves every map.
 */
export function findPath(
  from: TilePos,
  to: TilePos,
  walkable: (tileX: number, tileY: number) => boolean = isWalkable,
): TilePos[] {
  if (!walkable(from.tileX, from.tileY)) return [];
  if (!walkable(to.tileX, to.tileY)) return [];
  if (from.tileX === to.tileX && from.tileY === to.tileY) return [];

  const cameFrom = new Map<number, number>();
  const start = key(from.tileX, from.tileY);
  const goal = key(to.tileX, to.tileY);
  cameFrom.set(start, start);

  let frontier: TilePos[] = [from];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_PATH_TILES) {
    depth += 1;
    const next: TilePos[] = [];

    for (const tile of frontier) {
      for (const [dx, dy] of STEPS) {
        const tileX = tile.tileX + dx;
        const tileY = tile.tileY + dy;
        if (!walkable(tileX, tileY)) continue;

        const id = key(tileX, tileY);
        if (cameFrom.has(id)) continue;
        cameFrom.set(id, key(tile.tileX, tile.tileY));

        if (id === goal) return reconstruct(cameFrom, start, goal);
        next.push({ tileX, tileY });
      }
    }
    frontier = next;
  }

  return [];
}

function reconstruct(cameFrom: Map<number, number>, start: number, goal: number): TilePos[] {
  const path: TilePos[] = [];
  let cursor = goal;
  while (cursor !== start) {
    path.push({ tileX: cursor % 4096, tileY: Math.floor(cursor / 4096) });
    const prev = cameFrom.get(cursor);
    if (prev === undefined) return []; // Unreachable in practice; keeps types honest.
    cursor = prev;
  }
  return path.reverse();
}

/** Facing implied by a single step. Falls back to the previous facing if static. */
export function facingFor(from: TilePos, to: TilePos, fallback: Facing): Facing {
  const dx = to.tileX - from.tileX;
  const dy = to.tileY - from.tileY;
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "e" : "w";
  return dy > 0 ? "s" : "n";
}
