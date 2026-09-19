import Phaser from "phaser";
import {
  CELL,
  PALETTE,
  areaFor,
  cellToWorld,
  dayTint,
  interactiveZones,
  isWalkableOn,
  mixTint,
  worldToCell,
  zoneCentre,
  type AreaZone,
  type TilePos,
} from "@crazycauldron/shared";
import {
  LABEL_SCREEN_PX,
  SMALL_LABEL_SCREEN_PX,
  boundsOf,
  labelScale,
  type Rect,
} from "./camera.js";
import { TEX_GLOW, TEX_NODE, TEX_NODE_SPENT } from "./textures.js";
import { GATE_PROP, hasProcessedNode, mapKey, nodeArchetype, nodeKey, propKey } from "../art/assets.js";
import { Effects } from "../world/effects.js";

/**
 * How close the pointer has to be to a thing to mean it.
 *
 * A node is a single 24px cell and a fingertip is wider than that, so picking
 * works in cell space with a radius rather than on exact cells. Zones are
 * rectangles, hit-tested against their own footprint expanded by the same
 * amount, so a tap near the tavern door counts as the tavern.
 */
const PICK_CELLS = 1.5;
const HIGHLIGHT_TINT = 0xfff3c4;

/** Something on the map a click can mean. */
export interface MapFeature {
  kind: "zone" | "node";
  id: string;
  name: string;
  tile: TilePos;
  /** Gates only: which map this leads to. */
  section?: number;
  /** Zones only: the row the painted structure stands on. */
  baseline?: number;
}

/**
 * Renders whichever painted area the player is standing on.
 *
 * There is nothing to assemble any more. The ground is one image drawn at a
 * fixed world size with nearest-neighbour filtering, and the buildings, the
 * cauldron, the well and the cart are painted into it. What this adds on top
 * is only what the paint cannot know: where the gates are, where the gather
 * nodes stand, and which painted structures a player should be drawn behind.
 */
export class GameMap {
  readonly features: MapFeature[] = [];
  private readonly ground: Phaser.GameObjects.Image;
  private readonly decorations: Phaser.GameObjects.GameObject[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly nodeSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly nodeLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly nodeRings = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly zoneMarkers = new Map<string, Phaser.GameObjects.GameObject[]>();
  private highlighted: MapFeature | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly mapId: number,
  ) {
    const area = areaFor(mapId);
    const bounds = boundsOf(mapId);

    /*
     * The painting is 2688x1520 and the world is 1008x576, so it is drawn at
     * 0.375 across and 0.379 down. setDisplaySize rather than setScale because
     * those two differ by 1%, which is what buys a grid of square cells over a
     * 16:9 image - and 1% of vertical stretch on a painting is invisible.
     */
    this.ground = scene.add
      .image(bounds.x, bounds.y, mapKey(area.id))
      .setOrigin(0, 0)
      .setDepth(-10000);
    this.ground.setDisplaySize(bounds.width, bounds.height);
    // Nearest-neighbour: this is pixel art the camera then enlarges, and any
    // smoothing turns it to mush at 3x.
    this.ground.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.buildZones();
    this.buildNodes();
  }

  // --- zones ----------------------------------------------------------------

  /**
   * Gates and shop fronts are invisible.
   *
   * They are already painted, and drawing a building on top of a building is
   * what made the last version look like two games at once. A gate gets a soft
   * pulsing pool of light and a name, because a path leading off the edge of a
   * painting does not otherwise say "you may go this way". A counter gets a
   * name that appears when the pointer is near it, and nothing else.
   */
  private buildZones() {
    for (const zone of interactiveZones(this.mapId)) {
      const centre = zoneCentre(zone);
      const at = cellToWorld(centre.tileX, centre.tileY);
      const marks: Phaser.GameObjects.GameObject[] = [];

      if (zone.kind === "portal") {
        if (zone.glow) {
          const tint = Phaser.Display.Color.HexStringToColor(zone.glow).color;
          const halo = this.scene.add
            .image(at.x, at.y, TEX_GLOW)
            .setOrigin(0.5)
            .setDepth(this.depthFor(zone.baseline) - 1)
            .setTint(tint)
            .setAlpha(0.3)
            .setBlendMode(Phaser.BlendModes.ADD);
          halo.setDisplaySize(zone.w * CELL, zone.h * CELL);

          this.scene.tweens.add({
            targets: halo,
            alpha: 0.55,
            duration: 1700,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
          halo.setData("glow", true);
          this.decorations.push(halo);
          marks.push(halo);
        }

        /*
         * An arch over the path mouth.
         *
         * Stood on the zone's baseline like anything else on the map, so a
         * player walking up to a gate passes in front of it and one standing
         * beyond it is framed by it. Width is the zone's own, height follows
         * the art; the arch is the only prop still drawn over a painting,
         * because a path leaving the picture is the one thing the picture
         * does not say is a door.
         */
        const arch = this.gateSprite(zone);
        if (arch) {
          this.decorations.push(arch);
          marks.push(arch);
        }
      }

      if (zone.name) {
        const text = this.scene.add
          .text(at.x, at.y - (zone.h * CELL) / 2 - 4, zone.name, {
            fontFamily: "monospace",
            fontSize: `${LABEL_SCREEN_PX}px`,
            color: zone.glow ?? "#f3e9d2",
            stroke: "#14101a",
            strokeThickness: 3,
          })
          .setOrigin(0.5, 1)
          .setDepth(9000);
        // A gate's name is always on - it is the only thing saying the map
        // continues. A counter's appears under the pointer.
        text.setAlpha(zone.kind === "portal" ? 0.9 : 0);
        this.labels.push(text);
        this.decorations.push(text);
        marks.push(text);
      }

      this.zoneMarkers.set(zone.id, marks);
      this.features.push({
        kind: "zone",
        id: zone.id,
        name: zone.name,
        tile: centre,
        baseline: zone.baseline,
        ...(zone.section !== undefined ? { section: zone.section } : {}),
      });
    }
  }

  // --- nodes ----------------------------------------------------------------

  /** The processed archway for a gate, or null when its art is missing. */
  private gateSprite(zone: AreaZone): Phaser.GameObjects.Image | null {
    const id = zone.section !== undefined ? GATE_PROP[zone.section] : undefined;
    // The way home out of a section reuses whichever arch that section has.
    const key = propKey(id ?? GATE_PROP[this.mapId] ?? "portal_meadows");
    if (!this.scene.textures.exists(key)) return null;

    const centre = zoneCentre(zone);
    const at = cellToWorld(centre.tileX, centre.tileY);
    const sprite = this.scene.add
      .image(at.x, (zone.baseline + 1) * CELL, key)
      .setOrigin(0.5, 1)
      .setDepth(this.depthFor(zone.baseline));

    const width = zone.w * CELL;
    sprite.setDisplaySize(width, (sprite.height / sprite.width) * width);
    sprite.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return sprite;
  }

  private buildNodes() {
    for (const node of areaFor(this.mapId).nodes) {
      const sprite = this.addNode(node.id, node.c, node.r);
      this.nodeSprites.set(node.id, sprite);
      this.nodeLabels.set(node.id, this.addNodeLabel(node.c, node.r));
      this.nodeRings.set(node.id, this.addNodeRing(node.c, node.r));
      this.features.push({
        kind: "node",
        id: node.id,
        name: node.id,
        tile: { tileX: node.c, tileY: node.r },
      });
    }
  }

  private addNode(id: string, col: number, row: number): Phaser.GameObjects.Image {
    const at = cellToWorld(col, row);
    const archetype = nodeArchetype(GameMap.ingredients.get(id) ?? "");
    const key = nodeKey(archetype);
    const processed = hasProcessedNode(archetype);

    const sprite = this.scene.add
      .image(at.x, at.y + CELL / 2, this.scene.textures.exists(key) ? key : TEX_NODE)
      .setOrigin(0.5, 1)
      .setDepth(this.depthFor(row));

    sprite.setData("archetype", archetype);
    sprite.setData("processed", processed);
    this.decorations.push(sprite);
    return sprite;
  }

  /**
   * What grows on each node, by id.
   *
   * Filled once at boot from the section content. The map file says where a
   * node is; sections.json says what it is, and the sprite needs both.
   */
  private static ingredients = new Map<string, string>();

  static useIngredients(pairs: [string, string][]) {
    GameMap.ingredients = new Map(pairs);
  }

  private addNodeRing(col: number, row: number): Phaser.GameObjects.Graphics {
    const at = cellToWorld(col, row);
    const ring = this.scene.add
      .graphics({ x: at.x, y: at.y - 22 })
      .setDepth(this.depthFor(row) + 2);
    this.decorations.push(ring);
    return ring;
  }

  private addNodeLabel(col: number, row: number): Phaser.GameObjects.Text {
    const at = cellToWorld(col, row);
    const text = this.scene.add
      .text(at.x, at.y - 14, "", {
        fontFamily: "monospace",
        fontSize: `${SMALL_LABEL_SCREEN_PX}px`,
        color: "#d8cfb8",
        stroke: "#14101a",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(this.depthFor(row) + 1);
    this.labels.push(text);
    this.decorations.push(text);
    return text;
  }

  /**
   * Nodes on cooldown are drawn spent, with an arc and an mm:ss countdown.
   * The timers live on the server; this only reflects what it last said.
   */
  setNodeReady(
    nodeId: string,
    ready: boolean,
    available: boolean,
    cooldownSeconds = 0,
    totalSeconds = 0,
  ) {
    const sprite = this.nodeSprites.get(nodeId);
    if (!sprite) return;

    const archetype = sprite.getData("archetype") as string | undefined;
    const processed = sprite.getData("processed") === true;
    if (archetype) {
      const key = nodeKey(archetype, !ready);
      if (this.scene.textures.exists(key)) sprite.setTexture(key);
    } else {
      sprite.setTexture(ready ? TEX_NODE : TEX_NODE_SPENT);
    }
    sprite.setAlpha(available ? (processed ? 1 : ready ? 1 : 0.65) : 0.2);

    const label = this.nodeLabels.get(nodeId);
    const ring = this.nodeRings.get(nodeId);

    if (label) {
      if (!available) label.setText("locked");
      else if (cooldownSeconds > 0) {
        // mm:ss, because a rare node is a fifteen minute wait and "900s" is
        // not a number anyone reads as a quarter of an hour.
        const minutes = Math.floor(cooldownSeconds / 60);
        const seconds = cooldownSeconds % 60;
        label.setText(`${minutes}:${String(seconds).padStart(2, "0")}`);
      } else label.setText("");
    }

    if (ring) {
      ring.clear();
      if (available && cooldownSeconds > 0 && totalSeconds > 0) {
        const remaining = Math.min(1, cooldownSeconds / totalSeconds);
        ring.lineStyle(2, PALETTE.night, 0.55);
        ring.strokeCircle(0, 0, 7);
        ring.lineStyle(2, PALETTE.saffron, 0.95);
        ring.beginPath();
        // Starts at the top and unwinds clockwise as the node regrows.
        ring.arc(0, 0, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining, false);
        ring.strokePath();
      }
    }
  }

  squashNode(nodeId: string) {
    const sprite = this.nodeSprites.get(nodeId);
    if (sprite) Effects.squash(this.scene, sprite);
  }

  // --- depth ----------------------------------------------------------------

  /**
   * Draw order, from the grid row a thing stands on.
   *
   * This is the whole depth system, and it is deliberately the cheap one. The
   * paintings are 3/4 oblique, so a structure's front edge sits on one row -
   * its baseline, recorded in the area file. A player on a lower row is in
   * front of it and draws over it; a player on a higher row is behind it, and
   * because the building is painted into the ground layer the player simply
   * disappears behind it. No cutouts, no masks, no second copy of the
   * building: the paint is already in the right place.
   *
   * What it cannot do is let a player stand *inside* a doorway and be half
   * occluded, because the ground is one image. Every building's footprint is
   * blocked, so nobody can be inside one to find out.
   */
  depthFor(row: number): number {
    return row * 10;
  }

  /**
   * Depth for a character standing on a cell.
   *
   * Five above the map's own things on the same row, so a player and a node on
   * one row never flicker, and a player on a building's baseline is in front
   * of it rather than tying with it.
   */
  depthForActor(row: number): number {
    return row * 10 + 5;
  }

  // --- picking --------------------------------------------------------------

  /** The feature nearest a pointer, within a forgiving radius. */
  pickFeature(worldX: number, worldY: number): MapFeature | null {
    const { tileX, tileY } = worldToCell(worldX, worldY);

    let best: MapFeature | null = null;
    let bestDistance = PICK_CELLS;

    for (const feature of this.features) {
      const distance =
        feature.kind === "zone"
          ? this.distanceToZone(feature.id, tileX, tileY)
          : Math.hypot(feature.tile.tileX - tileX, feature.tile.tileY - tileY);
      if (distance === null) continue;
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = feature;
      }
    }
    return best;
  }

  private distanceToZone(id: string, tileX: number, tileY: number): number | null {
    const zone = interactiveZones(this.mapId).find((z) => z.id === id);
    if (!zone) return null;
    const dx = Math.max(zone.c - tileX, 0, tileX - (zone.c + zone.w - 1));
    const dy = Math.max(zone.r - tileY, 0, tileY - (zone.r + zone.h - 1));
    return Math.max(dx, dy);
  }

  /** Lifts and brightens whatever the pointer is over. */
  setHighlight(feature: MapFeature | null) {
    if (feature?.id === this.highlighted?.id) return;
    if (this.highlighted) this.dim(this.highlighted);
    this.highlighted = feature;
    if (feature) this.lift(feature);
  }

  private lift(feature: MapFeature) {
    if (feature.kind === "node") {
      const sprite = this.nodeSprites.get(feature.id);
      sprite?.setTint(HIGHLIGHT_TINT);
      sprite?.setScale(1.1);
      return;
    }
    for (const mark of this.zoneMarkers.get(feature.id) ?? []) {
      if (mark instanceof Phaser.GameObjects.Text) mark.setAlpha(1);
      else if (!(mark instanceof Phaser.GameObjects.Image)) continue;
      else if (mark.getData("glow") === true) mark.setAlpha(0.7);
      else mark.setTint(HIGHLIGHT_TINT);
    }
  }

  private dim(feature: MapFeature) {
    if (feature.kind === "node") {
      const sprite = this.nodeSprites.get(feature.id);
      sprite?.clearTint();
      sprite?.setScale(1);
      return;
    }
    const zone = interactiveZones(this.mapId).find((z) => z.id === feature.id);
    for (const mark of this.zoneMarkers.get(feature.id) ?? []) {
      if (mark instanceof Phaser.GameObjects.Text) {
        mark.setAlpha(zone?.kind === "portal" ? 0.9 : 0);
      } else if (!(mark instanceof Phaser.GameObjects.Image)) {
        continue;
      } else if (mark.getData("glow") === true) {
        mark.setAlpha(0.3);
      } else {
        mark.clearTint();
      }
    }
  }

  // --- geometry -------------------------------------------------------------

  /** A cell's centre in world pixels. The callers still say tile. */
  tileCentre(tileX: number, tileY: number): { x: number; y: number } {
    return cellToWorld(tileX, tileY);
  }

  /** The cell under a pointer, or null when it is not somewhere you can stand. */
  tileAt(worldX: number, worldY: number): TilePos | null {
    const tile = worldToCell(worldX, worldY);
    return isWalkableOn(this.mapId, tile.tileX, tile.tileY) ? tile : null;
  }

  get centreOfMap(): { x: number; y: number } {
    const bounds = boundsOf(this.mapId);
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  get worldBounds(): Rect {
    return boundsOf(this.mapId);
  }

  /**
   * Multiplies the painting by the time of day.
   *
   * The painting only. Characters, labels, nodes and the HUD keep their own
   * colours, which is what stops midnight making the game unreadable.
   */
  setDayTint(colour: number) {
    this.ground.setTint(mixTint(0xffffff, colour));
  }

  applyDaylight(now = Date.now()) {
    this.setDayTint(dayTint(now));
  }

  /** Cancels the camera zoom on every world-space label. */
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
    this.nodeRings.clear();
    this.zoneMarkers.clear();
    this.highlighted = null;
    this.features.length = 0;
    this.ground.destroy();
  }
}

export type { AreaZone };
