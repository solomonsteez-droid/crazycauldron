/**
 * Pathfinding over the square cell grid.
 *
 * Shared so the server can turn a click destination into an authoritative
 * route; the client never sends a path, only where it wants to go.
 *
 * Eight directions now, not four. The old grid was isometric diamonds, where
 * the four diagonal steps were the only steps and a "straight" move did not
 * exist. Over a painting there is no lattice to respect, so a player walks the
 * way a person would: straight lines and diagonals, with the diagonals costing
 * what they actually cost.
 */

import { MAX_PATH_TILES } from "./constants.js";
import { isWalkableOn, HUB_MAP } from "./area.js";
import type { Facing, TilePos } from "./types.js";

/** Straight steps first, so a tie between equal routes prefers the plain one. */
const STEPS: readonly (readonly [dx: number, dy: number, cost: number])[] = [
  [0, -1, 10],
  [1, 0, 10],
  [0, 1, 10],
  [-1, 0, 10],
  [1, -1, 14],
  [1, 1, 14],
  [-1, 1, 14],
  [-1, -1, 14],
];

const key = (x: number, y: number) => y * 4096 + x;

/**
 * Shortest walkable route from `from` to `to`, excluding the start cell and
 * including the destination. Returns [] when unreachable, when the destination
 * is blocked, or when the shortest route is longer than MAX_PATH_TILES.
 *
 * A* with a Chebyshev-shaped heuristic, because a uniform-cost search over
 * eight directions expands roughly three times the frontier of one over four,
 * and the server runs this for every click from every player.
 *
 * `walkable` defaults to the hub; every other map passes its own.
 */
export function findPath(
  from: TilePos,
  to: TilePos,
  walkable: (tileX: number, tileY: number) => boolean = (x, y) => isWalkableOn(HUB_MAP, x, y),
): TilePos[] {
  if (!walkable(from.tileX, from.tileY)) return [];
  if (!walkable(to.tileX, to.tileY)) return [];
  if (from.tileX === to.tileX && from.tileY === to.tileY) return [];

  const start = key(from.tileX, from.tileY);
  const goal = key(to.tileX, to.tileY);

  /** Straight steps cost 10 and diagonals 14, which is 10 * sqrt(2) rounded. */
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - to.tileX);
    const dy = Math.abs(y - to.tileY);
    return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy);
  };

  const cameFrom = new Map<number, number>();
  const costSoFar = new Map<number, number>();
  cameFrom.set(start, start);
  costSoFar.set(start, 0);

  // A plain array used as a priority queue. The frontier here is a few hundred
  // cells at most on a 42x24 grid; a heap would be more code and no faster.
  const frontier: { tileX: number; tileY: number; priority: number }[] = [
    { tileX: from.tileX, tileY: from.tileY, priority: 0 },
  ];

  while (frontier.length > 0) {
    let bestAt = 0;
    for (let i = 1; i < frontier.length; i += 1) {
      if (frontier[i]!.priority < frontier[bestAt]!.priority) bestAt = i;
    }
    const current = frontier.splice(bestAt, 1)[0]!;
    const currentId = key(current.tileX, current.tileY);
    if (currentId === goal) return reconstruct(cameFrom, start, goal);

    const cost = costSoFar.get(currentId) ?? 0;
    // Each step of a diagonal route costs 14, so the budget is in those units.
    if (cost >= MAX_PATH_TILES * 14) continue;

    for (const [dx, dy, stepCost] of STEPS) {
      const tileX = current.tileX + dx;
      const tileY = current.tileY + dy;
      if (!walkable(tileX, tileY)) continue;

      /*
       * A diagonal may not squeeze between two blocked corners. Without this a
       * player slips through the gap where a building meets a fence, which
       * looks like walking through a wall because that is what it is.
       */
      if (dx !== 0 && dy !== 0) {
        if (!walkable(current.tileX + dx, current.tileY)) continue;
        if (!walkable(current.tileX, current.tileY + dy)) continue;
      }

      const id = key(tileX, tileY);
      const next = cost + stepCost;
      const known = costSoFar.get(id);
      if (known !== undefined && known <= next) continue;

      costSoFar.set(id, next);
      cameFrom.set(id, currentId);
      frontier.push({ tileX, tileY, priority: next + heuristic(tileX, tileY) });
    }
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
    if (path.length > MAX_PATH_TILES) return [];
  }
  return path.reverse();
}

/**
 * Facing implied by a single step.
 *
 * Four facings for eight directions: the body sheet has north, east, south and
 * west and nothing between, so a diagonal picks whichever axis it moved along
 * further, and a tie goes to the horizontal - a character walking north-east
 * reads better facing the camera's side than its back.
 */
export function facingFor(from: TilePos, to: TilePos, fallback: Facing): Facing {
  const dx = to.tileX - from.tileX;
  const dy = to.tileY - from.tileY;
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "e" : "w";
  return dy > 0 ? "s" : "n";
}
