import Phaser from "phaser";
import {
  HUB_PORTALS,
  HUB_STATIONS,
  HUB_MAP,
  HUB_TILES,
  MAP_SIZE,
  TILE_HEIGHT,
  TILE_WIDTH,
  findSection,
  isWalkableOn,
  sectionTiles,
  tileToWorld,
  worldToTile,
  type GatherNodeDef,
  type TilePos,
} from "@crazycauldron/shared";
import {
  TEX_CAULDRON,
  TEX_NODE,
  TEX_NODE_SPENT,
  TEX_PORTAL,
  TEX_STATION,
  TEX_TILE,
} from "./textures.js";

/**
 * Renders whichever map the player is standing on.
 *
 * The floor is baked into one RenderTexture exactly as the hub always did - the
 * ground never changes, so ~576 tile sprites would be 576 draw calls for a
 * picture that could be one. What differs per map is only what sits on top:
 * the cauldron and stations in the hub, gather nodes in a section.
 */
export interface MapFeature {
  kind: "station" | "portal" | "node";
  id: string;
  name: string;
  tile: TilePos;
  /** Sections only: which section a portal leads to. */
  section?: number;
}

export class GameMap {
  private readonly offsetX = (MAP_SIZE * TILE_WIDTH) / 2;
  readonly floor: Phaser.GameObjects.RenderTexture;
  readonly features: MapFeature[] = [];
  private readonly nodeSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly decorations: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly mapId: number,
  ) {
    const width = MAP_SIZE * TILE_WIDTH;
    const height = MAP_SIZE * TILE_HEIGHT + TILE_HEIGHT;
    const tiles = mapId === HUB_MAP ? HUB_TILES : sectionTiles(mapId);

    this.floor = scene.add
      .renderTexture(-this.offsetX, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(-1);

    this.floor.beginDraw();
    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const id = tiles[y]?.[x];
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

    // One tint per section rather than a tile set per section: the palette
    // accent is the whole visual difference between the three maps today.
    const section = findSection(mapId);
    if (section) this.floor.setTint(Phaser.Display.Color.HexStringToColor(section.groundColor).color);

    if (mapId === HUB_MAP) this.buildHub();
    else this.buildSection(mapId);
  }

  private buildHub() {
    const centre = this.tileCentre(MAP_SIZE / 2 - 1, MAP_SIZE / 2 - 1);
    this.decorations.push(
      this.scene.add
        .image(centre.x, centre.y + TILE_HEIGHT, TEX_CAULDRON)
        .setOrigin(0.5, 1)
        .setDepth(MAP_SIZE - 1),
    );

    for (const station of HUB_STATIONS) {
      this.addMarker(TEX_STATION, station.tileX, station.tileY, station.name, "#f3e9d2");
      this.features.push({
        kind: "station",
        id: station.id,
        name: station.name,
        tile: { tileX: station.tileX, tileY: station.tileY },
      });
    }

    for (const portal of HUB_PORTALS) {
      const section = findSection(portal.section);
      if (!section) continue;
      this.addMarker(TEX_PORTAL, portal.tileX, portal.tileY, section.name, section.accentColor);
      this.features.push({
        kind: "portal",
        id: `portal_${portal.section}`,
        name: section.name,
        tile: { tileX: portal.tileX, tileY: portal.tileY },
        section: portal.section,
      });
    }
  }

  private buildSection(mapId: number) {
    const section = findSection(mapId);
    if (!section) return;

    this.addMarker(
      TEX_PORTAL,
      section.returnPortal.tileX,
      section.returnPortal.tileY,
      "Back to the hub",
      "#7ce08a",
    );
    this.features.push({
      kind: "portal",
      id: "portal_hub",
      name: "Back to the hub",
      tile: { ...section.returnPortal },
      section: HUB_MAP,
    });

    for (const node of section.nodes) {
      const sprite = this.addNode(node, section.accentColor);
      this.nodeSprites.set(node.id, sprite);
      this.features.push({
        kind: "node",
        id: node.id,
        name: node.ingredient,
        tile: { tileX: node.tileX, tileY: node.tileY },
      });
    }
  }

  private addNode(node: GatherNodeDef, accent: string): Phaser.GameObjects.Image {
    const at = this.tileCentre(node.tileX, node.tileY);
    const sprite = this.scene.add
      .image(at.x, at.y, TEX_NODE)
      .setOrigin(0.5, 1)
      .setDepth(node.tileX + node.tileY)
      .setTint(Phaser.Display.Color.HexStringToColor(accent).color);
    this.decorations.push(sprite);
    return sprite;
  }

  private addMarker(texture: string, tileX: number, tileY: number, label: string, colour: string) {
    const at = this.tileCentre(tileX, tileY);
    const image = this.scene.add
      .image(at.x, at.y, texture)
      .setOrigin(0.5, 1)
      .setDepth(tileX + tileY)
      .setTint(Phaser.Display.Color.HexStringToColor(colour).color);

    const text = this.scene.add
      .text(at.x, at.y - 22, label, { fontFamily: "monospace", fontSize: "7px", color: colour })
      .setOrigin(0.5, 1)
      .setResolution(3)
      .setDepth(tileX + tileY);

    this.decorations.push(image, text);
  }

  /**
   * Nodes on cooldown are drawn spent and dimmed. The timers themselves live on
   * the server; this only reflects what it last said.
   */
  setNodeReady(nodeId: string, ready: boolean, available: boolean) {
    const sprite = this.nodeSprites.get(nodeId);
    if (!sprite) return;
    sprite.setTexture(ready ? TEX_NODE : TEX_NODE_SPENT);
    sprite.setAlpha(available ? (ready ? 1 : 0.45) : 0.15);
  }

  /** The feature on a tile, so a click can mean "gather" or "enter" not "walk". */
  featureAt(tile: TilePos): MapFeature | null {
    return (
      this.features.find((f) => f.tile.tileX === tile.tileX && f.tile.tileY === tile.tileY) ?? null
    );
  }

  tileCentre(tileX: number, tileY: number): { x: number; y: number } {
    const world = tileToWorld(tileX, tileY);
    return { x: world.x, y: world.y + TILE_HEIGHT / 2 };
  }

  /** Tile under a pointer. Nodes are not walkable, so they resolve separately. */
  tileAt(worldX: number, worldY: number): TilePos | null {
    const { tileX, tileY } = worldToTile(worldX, worldY);
    const tile = { tileX: Math.floor(tileX), tileY: Math.floor(tileY) };
    if (this.featureAt(tile)) return tile;
    return isWalkableOn(this.mapId, tile.tileX, tile.tileY) ? tile : null;
  }

  get centreOfMap(): { x: number; y: number } {
    return this.tileCentre(MAP_SIZE / 2, MAP_SIZE / 2);
  }

  applyCameraBounds() {
    this.scene.cameras.main.setBounds(
      -this.offsetX - TILE_WIDTH,
      -TILE_HEIGHT,
      MAP_SIZE * TILE_WIDTH + TILE_WIDTH * 2,
      MAP_SIZE * TILE_HEIGHT + TILE_HEIGHT * 3,
    );
  }

  destroy() {
    for (const decoration of this.decorations) decoration.destroy();
    this.decorations.length = 0;
    this.nodeSprites.clear();
    this.features.length = 0;
    this.floor.destroy();
  }
}
