/**
 * Whether an area's furniture actually fits on it.
 *
 * Buildings, gates and gather nodes are placed by hand over a painting, and
 * the failure modes are quiet ones: a node in a stream, two nodes on the same
 * cell, a shop front nobody can reach, a portal walled off from the spawn.
 * None of those throw - they just look wrong, and only to somebody who happens
 * to walk that way. So the rules are written down here and checked, and the
 * server refuses to start on an area that breaks them.
 *
 * The rules, in one place:
 *
 *   - every area has a walkable mask the right size
 *   - the spawn is walkable
 *   - nothing occupies the same cell as anything else
 *   - a gather node stands on open ground with somewhere to stand beside it
 *   - nodes keep two cells from each other and from every zone
 *   - every zone and every node is reachable on foot from the spawn
 */

import { AREAS, HUB_MAP, areaFor, isWalkableOn, nodesOf, zonesOf } from "./area.js";
import { SECTIONS } from "./content/index.js";
import type { AreaZone } from "./content/types.js";
import type { TilePos } from "./types.js";

/** Cells a node keeps clear of any other node and of every zone. */
export const NODE_CLEARANCE = 2;

export interface LayoutProblem {
  map: number;
  message: string;
}

const chebyshev = (a: TilePos, b: TilePos) =>
  Math.max(Math.abs(a.tileX - b.tileX), Math.abs(a.tileY - b.tileY));

/** Chebyshev distance from a cell to the nearest cell of a zone. */
export function distanceToZone(zone: AreaZone, tileX: number, tileY: number): number {
  const dx = Math.max(zone.c - tileX, 0, tileX - (zone.c + zone.w - 1));
  const dy = Math.max(zone.r - tileY, 0, tileY - (zone.r + zone.h - 1));
  return Math.max(dx, dy);
}

/** Every cell reachable on foot from one starting cell. */
export function reachableFrom(mapId: number, start: TilePos): Set<number> {
  const area = areaFor(mapId);
  const seen = new Set<number>();
  if (!isWalkableOn(mapId, start.tileX, start.tileY)) return seen;

  const id = (x: number, y: number) => y * area.cols + x;
  const stack: TilePos[] = [start];
  seen.add(id(start.tileX, start.tileY));

  while (stack.length > 0) {
    const { tileX, tileY } = stack.pop()!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = tileX + dx;
        const ny = tileY + dy;
        if (!isWalkableOn(mapId, nx, ny)) continue;
        // The same corner rule the pathfinder uses, so "reachable" here means
        // reachable there.
        if (dx !== 0 && dy !== 0) {
          if (!isWalkableOn(mapId, nx, tileY) && !isWalkableOn(mapId, tileX, ny)) continue;
        }
        const at = id(nx, ny);
        if (seen.has(at)) continue;
        seen.add(at);
        stack.push({ tileX: nx, tileY: ny });
      }
    }
  }
  return seen;
}

/** A walkable cell beside a zone that a player could act from. */
function standingRoom(mapId: number, zone: AreaZone, reach = 2): TilePos | null {
  for (let r = zone.r - reach; r < zone.r + zone.h + reach; r += 1) {
    for (let c = zone.c - reach; c < zone.c + zone.w + reach; c += 1) {
      if (isWalkableOn(mapId, c, r)) return { tileX: c, tileY: r };
    }
  }
  return null;
}

/** Checks one area and returns everything wrong with it, in reading order. */
export function validateLayout(mapId: number): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const say = (message: string) => problems.push({ map: mapId, message });

  const area = areaFor(mapId);

  if (area.walkable.length !== area.rows) {
    say(`the walkable mask has ${area.walkable.length} rows, expected ${area.rows}`);
    return problems;
  }
  for (const [index, row] of area.walkable.entries()) {
    if (row.length !== area.cols) {
      say(`walkable row ${index} is ${row.length} cells wide, expected ${area.cols}`);
      return problems;
    }
  }

  const spawn = { tileX: area.spawn.col, tileY: area.spawn.row };
  if (!isWalkableOn(mapId, spawn.tileX, spawn.tileY)) {
    say(`the spawn at ${spawn.tileX},${spawn.tileY} is not walkable`);
    return problems;
  }

  const reachable = reachableFrom(mapId, spawn);
  const canReach = (tile: TilePos) => reachable.has(tile.tileY * area.cols + tile.tileX);

  const zones = zonesOf(mapId);
  const nodes = nodesOf(mapId);

  // --- zones ---------------------------------------------------------------
  for (const zone of zones) {
    if (zone.c < 0 || zone.r < 0 || zone.c + zone.w > area.cols || zone.r + zone.h > area.rows) {
      say(`zone ${zone.id} runs off the edge of the map`);
    }
    if (zone.baseline < zone.r || zone.baseline >= zone.r + zone.h) {
      say(`zone ${zone.id} has a baseline outside its own footprint`);
    }

    for (const other of zones) {
      if (other.id === zone.id) continue;
      const overlaps =
        zone.c < other.c + other.w &&
        other.c < zone.c + zone.w &&
        zone.r < other.r + other.h &&
        other.r < zone.r + zone.h;
      if (overlaps) say(`zones ${zone.id} and ${other.id} overlap`);
    }

    if (zone.kind === "scenery") continue;

    const standing = standingRoom(mapId, zone);
    if (!standing) {
      say(`zone ${zone.id} has no walkable cell beside it`);
    } else if (!canReach(standing)) {
      say(`zone ${zone.id} cannot be walked to from the spawn`);
    }

    if (zone.kind === "portal" && zone.section === undefined) {
      say(`portal ${zone.id} does not say where it leads`);
    }
  }

  // --- nodes ---------------------------------------------------------------
  for (const node of nodes) {
    const tile = { tileX: node.c, tileY: node.r };
    const where = `${node.c},${node.r}`;

    if (!isWalkableOn(mapId, node.c, node.r)) {
      say(`node ${node.id} at ${where} is not on open ground`);
      continue;
    }
    if (!canReach(tile)) say(`node ${node.id} at ${where} cannot be walked to from the spawn`);

    for (const other of nodes) {
      if (other.id === node.id) continue;
      if (chebyshev(tile, { tileX: other.c, tileY: other.r }) < NODE_CLEARANCE) {
        say(`nodes ${node.id} and ${other.id} are fewer than ${NODE_CLEARANCE} cells apart`);
      }
    }

    for (const zone of zones) {
      if (distanceToZone(zone, node.c, node.r) < NODE_CLEARANCE) {
        say(`node ${node.id} is fewer than ${NODE_CLEARANCE} cells from zone ${zone.id}`);
      }
    }
  }

  // --- the nodes this area is supposed to have -----------------------------
  const section = SECTIONS.find((s) => s.index === mapId);
  if (section) {
    for (const wanted of section.nodes) {
      if (!nodes.some((n) => n.id === wanted.id)) {
        say(`${wanted.id} is in sections.json but has no place on the map`);
      }
    }
    for (const placed of nodes) {
      if (!section.nodes.some((n) => n.id === placed.id)) {
        say(`node ${placed.id} is placed but is not in sections.json`);
      }
    }
  } else if (nodes.length > 0) {
    say(`this map has ${nodes.length} node(s) but is not a gathering section`);
  }

  // --- the gates line up both ways -----------------------------------------
  if (mapId === HUB_MAP) {
    for (const wanted of SECTIONS) {
      const gate = zones.find((z) => z.kind === "portal" && z.section === wanted.index);
      if (!gate) say(`there is no gate to ${wanted.name}`);
    }
  } else if (!zones.some((z) => z.kind === "portal" && z.section === HUB_MAP)) {
    say("there is no way back to the hub");
  }

  return problems;
}

/** Every area, hub first. Empty means the world is laid out legally. */
export function validateAllLayouts(): LayoutProblem[] {
  return AREAS.map((a) => a.map).flatMap(validateLayout);
}
