import Phaser from "phaser";
import { TILE_HEIGHT, TILE_WIDTH, TileId } from "@crazycauldron/shared";

/**
 * All art is generated at runtime. The skeleton ships no image assets on
 * purpose: there is nothing to license, nothing to load, and swapping in real
 * pixel art later means replacing these keys rather than editing every scene.
 */

export const TEX_TILE: Record<TileId, string> = {
  [TileId.Grass]: "tile-grass",
  [TileId.Path]: "tile-path",
  [TileId.Rock]: "tile-rock",
};
export const TEX_PLAYER_FRONT = "player-front";
export const TEX_PLAYER_BACK = "player-back";
export const TEX_CAULDRON = "cauldron";
export const TEX_MARKER = "move-marker";
export const TEX_NODE = "gather-node";
export const TEX_NODE_SPENT = "gather-node-spent";
export const TEX_PORTAL = "portal";
export const TEX_STATION = "station";

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

/** Diamond with its top vertex at (HALF_W, 0), matching the iso anchor. */
function diamond(g: Phaser.GameObjects.Graphics, fill: number, edge: number) {
  const points = [
    new Phaser.Geom.Point(HALF_W, 0),
    new Phaser.Geom.Point(TILE_WIDTH, HALF_H),
    new Phaser.Geom.Point(HALF_W, TILE_HEIGHT),
    new Phaser.Geom.Point(0, HALF_H),
  ];
  g.fillStyle(fill, 1);
  g.fillPoints(points, true);
  g.lineStyle(1, edge, 0.5);
  g.strokePoints(points, true);
}

export function createPlaceholderArt(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX_TILE[TileId.Grass])) return; // Already built this session.

  const g = scene.add.graphics();

  diamond(g, 0x3f6b46, 0x2b4a31);
  g.generateTexture(TEX_TILE[TileId.Grass], TILE_WIDTH, TILE_HEIGHT);
  g.clear();

  diamond(g, 0x6b5b45, 0x4b3f2f);
  g.generateTexture(TEX_TILE[TileId.Path], TILE_WIDTH, TILE_HEIGHT);
  g.clear();

  // Blocked tiles in the sections: darker and cooler, so an obstacle reads as
  // solid rather than as another shade of ground.
  diamond(g, 0x4a4652, 0x322f3a);
  g.generateTexture(TEX_TILE[TileId.Rock], TILE_WIDTH, TILE_HEIGHT);
  g.clear();

  // Move marker: a hollow diamond that sits on the destination tile.
  g.lineStyle(1, 0x7ce08a, 0.9);
  g.strokePoints(
    [
      new Phaser.Geom.Point(HALF_W, 1),
      new Phaser.Geom.Point(TILE_WIDTH - 1, HALF_H),
      new Phaser.Geom.Point(HALF_W, TILE_HEIGHT - 1),
      new Phaser.Geom.Point(1, HALF_H),
    ],
    true,
  );
  g.generateTexture(TEX_MARKER, TILE_WIDTH, TILE_HEIGHT);
  g.clear();

  drawToken(g, 0xe8d9b0, 0x6d3fa0);
  g.generateTexture(TEX_PLAYER_FRONT, 16, 24);
  g.clear();

  // Back view: hood only, no face - enough to read as "facing away".
  drawToken(g, 0x6d3fa0, 0x6d3fa0);
  g.generateTexture(TEX_PLAYER_BACK, 16, 24);
  g.clear();

  drawCauldron(g);
  g.generateTexture(TEX_CAULDRON, 96, 88);
  g.clear();

  // Nodes, portals and stations are all tinted at use, so each is drawn white
  // and coloured by the section palette rather than baked three times over.
  drawNode(g, true);
  g.generateTexture(TEX_NODE, 16, 20);
  g.clear();

  drawNode(g, false);
  g.generateTexture(TEX_NODE_SPENT, 16, 20);
  g.clear();

  drawPortal(g);
  g.generateTexture(TEX_PORTAL, 24, 30);
  g.clear();

  drawStation(g);
  g.generateTexture(TEX_STATION, 20, 22);
  g.destroy();
}

/** A tuft when full, a bare stem when spent. */
function drawNode(g: Phaser.GameObjects.Graphics, full: boolean) {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(8, 18, 11, 4);

  g.fillStyle(0xffffff, 1);
  g.fillRect(7, 10, 2, 8); // Stem.

  if (full) {
    g.fillCircle(8, 7, 5);
    g.fillCircle(4, 10, 3);
    g.fillCircle(12, 10, 3);
  } else {
    g.fillCircle(8, 9, 2);
  }
}

/** A standing arch: reads as a gate at 16px without needing a door sprite. */
function drawPortal(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(12, 28, 18, 5);

  g.fillStyle(0xffffff, 1);
  g.fillRect(2, 8, 4, 20);
  g.fillRect(18, 8, 4, 20);
  g.fillRect(2, 4, 20, 5);
  g.fillStyle(0xffffff, 0.35);
  g.fillRect(6, 9, 12, 19); // The opening, faintly lit.
}

/** A counter with a sign, for the kitchen, tavern and outfitter tiles. */
function drawStation(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(10, 20, 16, 5);

  g.fillStyle(0xffffff, 1);
  g.fillRect(2, 10, 16, 10); // Counter.
  g.fillRect(8, 2, 4, 8); // Post.
  g.fillRect(3, 0, 14, 5); // Sign.
}

/** 16x24 hooded figure; `face` is the skin colour, `robe` the hood and body. */
function drawToken(g: Phaser.GameObjects.Graphics, face: number, robe: number) {
  // Soft contact shadow so the token reads as standing on the tile.
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(8, 21, 12, 5);

  g.fillStyle(robe, 1);
  g.fillTriangle(8, 4, 2, 23, 14, 23); // Robe.
  g.fillStyle(face, 1);
  g.fillCircle(8, 6, 4); // Head / hood opening.
  g.fillStyle(robe, 1);
  g.fillTriangle(8, 0, 3, 7, 13, 7); // Pointed hat.
}

function drawCauldron(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(48, 74, 84, 22); // Ground shadow.
  g.fillStyle(0x4a4a55, 1);
  g.fillEllipse(48, 64, 76, 20); // Stone plinth.
  g.fillStyle(0x23242c, 1);
  g.fillEllipse(48, 44, 64, 46); // Pot body.
  g.fillStyle(0x151519, 1);
  g.fillEllipse(48, 26, 60, 18); // Rim.
  g.fillStyle(0x7ce08a, 1);
  g.fillEllipse(48, 26, 50, 13); // Brew.
  g.fillStyle(0xb9f7c4, 0.7);
  g.fillEllipse(40, 24, 12, 5); // Highlight.
}
