import { TILE_HEIGHT, TILE_WIDTH } from "./constants.js";

/**
 * Tile -> world pixel, matching Phaser's IsometricTileToWorldXY so that
 * sprites and the tilemap layer agree on where a tile is.
 */
export function tileToWorld(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: (tileX - tileY) * (TILE_WIDTH / 2),
    y: (tileX + tileY) * (TILE_HEIGHT / 2),
  };
}

/** World pixel -> fractional tile. Floor the result to get the tile under a cursor. */
export function worldToTile(worldX: number, worldY: number): { tileX: number; tileY: number } {
  const halfW = TILE_WIDTH / 2;
  const halfH = TILE_HEIGHT / 2;
  return {
    tileX: (worldX / halfW + worldY / halfH) / 2,
    tileY: (worldY / halfH - worldX / halfW) / 2,
  };
}

export function shortenAddress(address: string): string {
  return address.length <= 9 ? address : `${address.slice(0, 4)}..${address.slice(-4)}`;
}
