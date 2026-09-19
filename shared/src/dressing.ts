/**
 * Where a map's scenery stands.
 *
 * Planned here rather than in the renderer for two reasons. It is decided from
 * content - the pack a map draws from, how much of it, how hard it is pushed to
 * the edges - so it belongs beside the rest of the content. And it is a plan
 * before it is a picture, which means it can be checked: that nothing lands on
 * a path, in a doorway or on a gather node, that the middle of a map stays
 * clear to play in, and that the same seed always produces the same town.
 *
 * Nothing here blocks movement. Scenery is drawn behind whoever walks past it
 * and the server has never heard of it.
 */

import { MAP_SIZE } from "./constants.js";
import { AMBIENCE, HUB_PORTALS, HUB_STATIONS, decorFor, dressingFor, findSection } from "./content/index.js";
import { HUB_SPAWN, hubTileId } from "./map.js";
import { seededRandom } from "./random.js";
import { HUB_MAP, isWalkableOn, sectionTileId, spawnFor } from "./sectionMap.js";
import { TileId, type TilePos } from "./types.js";

/**
 * Tiles around a feature that stay clear.
 *
 * A shrub drawn on the kitchen door hides the door; one drawn beside it reads
 * as a garden. One tile of clearance is the whole difference.
 */
export const DRESSING_CLEARANCE = 1;

export interface DressingPlacement {
  tileX: number;
  tileY: number;
  /** A decor id from the map's pack; the art is looked up by the renderer. */
  decorId: string;
  /** Mirror it, so a handful of pieces do not read as a handful of pieces. */
  flip: boolean;
}

/** Everything on a map that scenery must not be placed on or beside. */
export function dressingKeepClear(mapId: number): TilePos[] {
  if (mapId === HUB_MAP) {
    return [
      ...HUB_STATIONS.map((s) => ({ tileX: s.tileX, tileY: s.tileY })),
      ...HUB_PORTALS.map((p) => ({ tileX: p.tileX, tileY: p.tileY })),
      HUB_SPAWN,
      ...AMBIENCE.hubProps.items.map((p) => ({ tileX: p.tileX, tileY: p.tileY })),
    ];
  }

  const section = findSection(mapId);
  if (!section) return [];
  return [
    ...section.nodes.map((n) => ({ tileX: n.tileX, tileY: n.tileY })),
    { ...section.returnPortal },
    spawnFor(mapId),
  ];
}

const tileIdOn = (mapId: number, tileX: number, tileY: number): TileId =>
  mapId === HUB_MAP ? hubTileId(tileX, tileY) : sectionTileId(mapId, tileX, tileY);

/**
 * The scenery for one map, in a fixed order.
 *
 * Seeded from ambience.json plus the map index, so every player sees the same
 * tree in the same place on every device and after every reload - and so a
 * designer who changes the seed gets a genuinely different arrangement rather
 * than the same one nudged.
 */
export function planDressing(mapId: number): DressingPlacement[] {
  const settings = dressingFor(mapId);
  const pieces = decorFor(mapId);
  if (!settings || pieces.length === 0) return [];

  const blocked = new Set<number>();
  const block = (tileX: number, tileY: number) => {
    if (tileX >= 0 && tileY >= 0 && tileX < MAP_SIZE && tileY < MAP_SIZE) {
      blocked.add(tileY * MAP_SIZE + tileX);
    }
  };

  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      if (!isWalkableOn(mapId, x, y) || tileIdOn(mapId, x, y) === TileId.Path) block(x, y);
    }
  }
  for (const tile of dressingKeepClear(mapId)) {
    for (let dx = -DRESSING_CLEARANCE; dx <= DRESSING_CLEARANCE; dx += 1) {
      for (let dy = -DRESSING_CLEARANCE; dy <= DRESSING_CLEARANCE; dy += 1) {
        block(tile.tileX + dx, tile.tileY + dy);
      }
    }
  }

  const random = seededRandom(AMBIENCE.dressing.seed + mapId * 7919);
  const middle = (MAP_SIZE - 1) / 2;
  const placements: DressingPlacement[] = [];

  /*
   * Bounded rather than exhaustive. A crowded map may simply have nowhere left
   * for its last few pieces, and the scatter should give up rather than spin
   * looking for a gap that is not there.
   */
  for (let attempt = 0; attempt < settings.count * 60 && placements.length < settings.count; attempt += 1) {
    const tileX = Math.floor(random() * MAP_SIZE);
    const tileY = Math.floor(random() * MAP_SIZE);
    const key = tileY * MAP_SIZE + tileX;
    if (blocked.has(key)) continue;

    /*
     * How far out this tile is: 0 at the centre, 1 at an edge. Raised to
     * edgeBias it becomes the chance of keeping the tile, so a bias of 1
     * scatters evenly and anything above thins out the middle.
     */
    const outward = Math.max(Math.abs(tileX - middle), Math.abs(tileY - middle)) / middle;
    if (random() > Math.pow(outward, settings.edgeBias)) continue;

    const piece = pieces[Math.floor(random() * pieces.length)]!;
    placements.push({ tileX, tileY, decorId: piece.id, flip: random() < 0.5 });
    blocked.add(key);
  }

  return placements;
}
