import Phaser from "phaser";
import {
  HUB_TILES,
  MAP_SIZE,
  TILE_HEIGHT,
  TILE_WIDTH,
  isWalkable,
  tileToWorld,
  worldToTile,
  type TilePos,
} from "@crazycauldron/shared";
import { TEX_CAULDRON, TEX_TILE } from "./textures.js";

/**
 * Renders the hub floor once into a RenderTexture instead of creating ~576 tile
 * sprites. The floor never changes, so a single baked texture costs one draw
 * call and leaves the depth-sorted display list for players alone.
 *
 * Phaser's own isometric Tilemap is skipped deliberately: the grid already
 * lives in `shared` and driving it through a tilemap loader would introduce a
 * second definition of the same map.
 */
export class HubMap {
  /** World x of the RenderTexture's left edge; the map spans both signs of x. */
  private readonly offsetX = (MAP_SIZE * TILE_WIDTH) / 2;
  readonly floor: Phaser.GameObjects.RenderTexture;

  constructor(private readonly scene: Phaser.Scene) {
    const width = MAP_SIZE * TILE_WIDTH;
    const height = MAP_SIZE * TILE_HEIGHT + TILE_HEIGHT;

    this.floor = scene.add
      .renderTexture(-this.offsetX, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(-1);

    this.floor.beginDraw();
    // Back to front by tileX + tileY so the baked result matches the order
    // players are later depth-sorted in.
    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const id = HUB_TILES[y]?.[x];
        if (id === undefined) continue;
        const world = tileToWorld(x, y);
        this.floor.batchDrawFrame(
          TEX_TILE[id],
          undefined,
          world.x + this.offsetX - TILE_WIDTH / 2,
          world.y,
        );
      }
    }
    this.floor.endDraw();

    // The cauldron occupies the blocked 4x4 block at the centre of the plaza.
    const centre = this.tileCentre(MAP_SIZE / 2 - 1, MAP_SIZE / 2 - 1);
    scene.add
      .image(centre.x, centre.y + TILE_HEIGHT, TEX_CAULDRON)
      .setOrigin(0.5, 1)
      .setDepth(MAP_SIZE - 1);
  }

  /** World position of a tile's centre - where a standing sprite belongs. */
  tileCentre(tileX: number, tileY: number): { x: number; y: number } {
    const world = tileToWorld(tileX, tileY);
    return { x: world.x, y: world.y + TILE_HEIGHT / 2 };
  }

  /** Tile under a pointer, or null when it is off-map or unwalkable. */
  tileAt(worldX: number, worldY: number): TilePos | null {
    const { tileX, tileY } = worldToTile(worldX, worldY);
    const tile = { tileX: Math.floor(tileX), tileY: Math.floor(tileY) };
    return isWalkable(tile.tileX, tile.tileY) ? tile : null;
  }

  /** Centre of the map, for the initial camera position. */
  get centreOfMap(): { x: number; y: number } {
    return this.tileCentre(MAP_SIZE / 2, MAP_SIZE / 2);
  }

  /** Camera bounds that keep the diamond on screen. */
  applyCameraBounds() {
    this.scene.cameras.main.setBounds(
      -this.offsetX - TILE_WIDTH,
      -TILE_HEIGHT,
      MAP_SIZE * TILE_WIDTH + TILE_WIDTH * 2,
      MAP_SIZE * TILE_HEIGHT + TILE_HEIGHT * 3,
    );
  }
}
