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
import { LABEL_SCREEN_PX, MAP_WORLD_BOUNDS, SMALL_LABEL_SCREEN_PX, labelScale, type Rect } from "./camera.js";
import { TEX_CAULDRON, TEX_GLOW, TEX_NODE, TEX_NODE_SPENT, TEX_TILE } from "./textures.js";
import { PORTAL_PROP, STATION_PROP, propKey, terrainKey } from "../art/assets.js";
import { type TerrainEntry } from "../art/manifest.js";
import { Effects } from "../world/effects.js";

/**
 * Headroom above and below the logical grid.
 *
 * Pack tiles are 32px tall against a 16px slot, and a tile whose diamond sits
 * low in its cell is drawn well above its slot - so the baked floor needs room
 * on both sides that the grid itself does not use.
 */
const TERRAIN_PAD = 24;


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
  private readonly nodeLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly decorations: Phaser.GameObjects.GameObject[] = [];
  /** Every world-space label, so all of them can cancel the camera zoom. */
  private readonly labels: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly mapId: number,
  ) {
    const width = MAP_SIZE * TILE_WIDTH;
    const height = MAP_SIZE * TILE_HEIGHT + TILE_HEIGHT + TERRAIN_PAD * 2;
    const tiles = mapId === HUB_MAP ? HUB_TILES : sectionTiles(mapId);

    this.floor = scene.add
      .renderTexture(-this.offsetX, -TERRAIN_PAD, width, height)
      .setOrigin(0, 0)
      .setDepth(-1);

    // The pack tiles if the pipeline produced them, the generated diamonds if
    // not. Either way the floor is one baked texture and one draw call.
    const terrain = this.terrainFor(mapId);
    const usePack = terrain !== null && scene.textures.exists(terrainKey(mapId));

    this.floor.beginDraw();
    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const id = tiles[y]?.[x];
        if (id === undefined) continue;
        const world = tileToWorld(x, y);
        const drawX = world.x + this.offsetX - TILE_WIDTH / 2;

        if (usePack && terrain) {
          // Seat the tile by its measured diamond centre, not its top edge,
          // so tall and flat tiles from the same pack sit level.
          const anchor = terrain.anchors[id] ?? TILE_HEIGHT / 2;
          const drawY = world.y + TILE_HEIGHT / 2 - anchor + TERRAIN_PAD;
          this.floor.batchDrawFrame(terrainKey(mapId), id, drawX, drawY);
        } else {
          this.floor.batchDrawFrame(TEX_TILE[id], undefined, drawX, world.y + TERRAIN_PAD);
        }
      }
    }
    this.floor.endDraw();

    // One tint per map: the packs are shared, so the palette is what makes the
    // Meadows warm, the Deep Forest cool and the Caves cold.
    const tint = terrain?.tint ?? findSection(mapId)?.groundColor;
    if (tint) this.floor.setTint(Phaser.Display.Color.HexStringToColor(tint).color);

    if (mapId === HUB_MAP) this.buildHub();
    else this.buildSection(mapId);
  }

  /** Terrain settings for this map, if the manifest has been read. */
  private terrainFor(mapId: number): TerrainEntry | null {
    return GameMap.terrain.find((t) => t.map === mapId) ?? null;
  }

  /** Filled once at boot; the constructor is synchronous and cannot await. */
  private static terrain: TerrainEntry[] = [];

  static useTerrain(entries: TerrainEntry[]) {
    GameMap.terrain = entries;
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
      this.addProp(
        propKey(STATION_PROP[station.id] ?? "kitchen"),
        station.tileX,
        station.tileY,
        station.name,
        "#f3e9d2",
      );
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
      this.addProp(
        propKey(PORTAL_PROP[portal.section] ?? "portal_meadows"),
        portal.tileX,
        portal.tileY,
        section.name,
        section.accentColor,
        section.accentColor,
      );
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

    this.addProp(
      propKey(PORTAL_PROP[mapId] ?? "portal_meadows"),
      section.returnPortal.tileX,
      section.returnPortal.tileY,
      "Back to the hub",
      "#7ce08a",
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
      this.nodeLabels.set(node.id, this.addNodeLabel(node));
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

  /** Regrowth countdown, drawn above a spent node. */
  private addNodeLabel(node: GatherNodeDef): Phaser.GameObjects.Text {
    const at = this.tileCentre(node.tileX, node.tileY);
    const text = this.scene.add
      .text(at.x, at.y - 22, "", {
        fontFamily: "monospace",
        fontSize: `${SMALL_LABEL_SCREEN_PX}px`,
        color: "#9a8f7a",
      })
      .setOrigin(0.5, 1)
      .setDepth(node.tileX + node.tileY + 1);
    this.labels.push(text);
    this.decorations.push(text);
    return text;
  }

  /**
   * A building or gate on its tile, with a name above it.
   *
   * `glow` turns it into a portal: a soft additive pool tinted by the section
   * accent, pulsing slowly. Drawn beneath the sprite so the arch reads as lit
   * rather than washed out, and it is the one thing on the map that moves when
   * nothing else is happening.
   */
  private addProp(
    texture: string,
    tileX: number,
    tileY: number,
    label: string,
    colour: string,
    glow?: string,
  ) {
    const at = this.tileCentre(tileX, tileY);

    if (glow) {
      const tint = Phaser.Display.Color.HexStringToColor(glow).color;
      const halo = this.scene.add
        .image(at.x, at.y - 6, TEX_GLOW)
        .setOrigin(0.5)
        .setDepth(tileX + tileY - 1)
        .setTint(tint)
        .setAlpha(0.35)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.scene.tweens.add({
        targets: halo,
        alpha: 0.6,
        scale: 1.12,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.decorations.push(halo);
    }

    // No tint: processed art carries its own colour, and the fallback chips
    // are already drawn in the right one.
    const image = this.scene.add
      .image(at.x, at.y, texture)
      .setOrigin(0.5, 1)
      .setDepth(tileX + tileY);

    const text = this.scene.add
      .text(at.x, at.y - 22, label, {
        fontFamily: "monospace",
        fontSize: `${LABEL_SCREEN_PX}px`,
        color: colour,
      })
      .setOrigin(0.5, 1)
      .setDepth(tileX + tileY);

    this.labels.push(text);
    this.decorations.push(image, text);
  }

  /**
   * Nodes on cooldown are drawn spent and dimmed. The timers themselves live on
   * the server; this only reflects what it last said.
   */
  setNodeReady(nodeId: string, ready: boolean, available: boolean, cooldownSeconds = 0) {
    const sprite = this.nodeSprites.get(nodeId);
    if (!sprite) return;
    sprite.setTexture(ready ? TEX_NODE : TEX_NODE_SPENT);
    sprite.setAlpha(available ? (ready ? 1 : 0.45) : 0.15);

    const label = this.nodeLabels.get(nodeId);
    if (!label) return;
    if (!available) label.setText("locked");
    else label.setText(cooldownSeconds > 0 ? `${cooldownSeconds}s` : "");
  }

  /** A quick squash on a node that was just clicked, so the click lands. */
  squashNode(nodeId: string) {
    const sprite = this.nodeSprites.get(nodeId);
    if (sprite) Effects.squash(this.scene, sprite);
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

  /**
   * The world rectangle this map occupies, for the camera to clamp against.
   * Tight to the floor, so no ground-coloured margin shows past the edges.
   */
  get worldBounds(): Rect {
    return MAP_WORLD_BOUNDS;
  }

  /**
   * Cancels the camera zoom on every world-space label.
   *
   * Labels are positioned in the world so they track their tile, but their size
   * should be a screen-space decision - a name at 3x would otherwise be twice
   * the height it is at 1.5x. Resolution follows the zoom so the glyphs are
   * rasterised at the size they are actually drawn.
   */
  applyLabelScale(zoom: number) {
    const scale = labelScale(zoom);
    const resolution = Math.max(1, Math.ceil(zoom));
    for (const label of this.labels) label.setScale(scale).setResolution(resolution);
  }

  destroy() {
    for (const decoration of this.decorations) decoration.destroy();
    this.decorations.length = 0;
    this.labels.length = 0;
    this.nodeSprites.clear();
    this.nodeLabels.clear();
    this.features.length = 0;
    this.floor.destroy();
  }
}
