/**
 * One player on screen: body, apron, hat and name, in that order.
 *
 * The three sprites are separate so a wardrobe change is a texture swap rather
 * than a re-render, and so the garments can sit at hand-tuned offsets per
 * direction. The container's origin is the character's feet, which is the point
 * that must not wander between frames.
 */

import Phaser from "phaser";
import { PALETTE, hex } from "@crazycauldron/shared";
import { BODY_FRAME, apronKey, bodyKey, hatKey } from "../art/assets.js";
import {
  defaultOffsets,
  offsetFor,
  type Direction,
  type Manifest,
  type OffsetsFile,
} from "../art/manifest.js";

/** Frames of the walk cycle where the body is at the top of its bob. */
const BOB_FRAMES = new Set([1, 3]);

export interface AvatarLook {
  body: string;
  hatId: string;
  apronId: string;
  displayName: string;
  isSelf: boolean;
}

export class Avatar {
  readonly container: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly apron: Phaser.GameObjects.Image;
  private readonly hat: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;

  private direction: Direction = "down";
  private moving = false;
  private look: AvatarLook;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: Manifest,
    private readonly offsets: OffsetsFile,
    look: AvatarLook,
    x: number,
    y: number,
  ) {
    this.look = look;

    // Feet at the container origin: body is drawn upwards from there.
    this.body = scene.add
      .sprite(0, 0, bodyKey(look.body), `${look.body}_idle_down`)
      .setOrigin(0.5, 1);

    this.apron = scene.add.image(0, 0, "__MISSING").setOrigin(0, 0).setVisible(false);
    this.hat = scene.add.image(0, 0, "__MISSING").setOrigin(0, 0).setVisible(false);

    this.label = scene.add
      .text(0, 0, look.displayName, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: look.isSelf ? hex(PALETTE.accent) : hex(PALETTE.ink),
      })
      .setOrigin(0.5, 1);

    this.container = scene.add.container(x, y, [this.body, this.apron, this.hat, this.label]);
    this.apply();
  }

  /** Swaps garments without rebuilding the container. */
  setLook(look: Partial<AvatarLook>) {
    this.look = { ...this.look, ...look };
    this.apply();
  }

  setDirection(direction: Direction, moving: boolean) {
    if (direction === this.direction && moving === this.moving) return;
    this.direction = direction;
    this.moving = moving;
    this.playBody();
    this.placeOverlays();
  }

  /** Counter-scales the name so it reads the same at any camera zoom. */
  setLabelScale(scale: number, resolution: number) {
    this.label.setScale(scale).setResolution(resolution);
  }

  get labelObject(): Phaser.GameObjects.Text {
    return this.label;
  }

  destroy() {
    this.container.destroy(true);
  }

  // --- internals ----------------------------------------------------------

  private apply() {
    const hatTexture = hatKey(this.look.hatId);
    const apronTexture = apronKey(this.look.apronId);

    this.hat.setVisible(Boolean(this.look.hatId) && this.scene.textures.exists(hatTexture));
    if (this.hat.visible) this.hat.setTexture(hatTexture);

    this.apron.setVisible(Boolean(this.look.apronId) && this.scene.textures.exists(apronTexture));
    if (this.apron.visible) this.apron.setTexture(apronTexture);

    this.label.setText(this.look.displayName);
    this.label.setColor(this.look.isSelf ? hex(PALETTE.accent) : hex(PALETTE.ink));

    this.playBody();
    this.placeOverlays();
  }

  private playBody() {
    const animation = `${this.look.body}_walk_${this.direction}`;
    if (this.moving && this.scene.anims.exists(animation)) {
      if (this.body.anims.currentAnim?.key !== animation) this.body.play(animation);
      return;
    }

    this.body.stop();
    const idle = `${this.look.body}_idle_${this.direction}`;
    const texture = this.scene.textures.get(bodyKey(this.look.body));
    if (texture.has(idle)) this.body.setFrame(idle);
  }

  /**
   * Places the garments for the current direction.
   *
   * Offsets are measured from the body frame's top-left corner, which sits at
   * (-w/2, -h) from the container origin. The bob copies the body's own rise on
   * frames 1 and 3, so a hat does not float free of the head mid-stride.
   */
  private placeOverlays() {
    const left = -BODY_FRAME.width / 2;
    const top = -BODY_FRAME.height;
    const frameIndex = this.body.anims.currentFrame?.index ?? 0;
    const bob = this.moving && BOB_FRAMES.has(frameIndex % 4) ? -1 : 0;

    for (const [kind, sprite, id] of [
      ["aprons", this.apron, this.look.apronId],
      ["hats", this.hat, this.look.hatId],
    ] as const) {
      if (!sprite.visible || !id) continue;

      const entry = this.manifest[kind].find((e) => e.id === id);
      const { offset, flipX } = offsetFor(
        this.offsets,
        kind,
        id,
        this.direction,
        defaultOffsets(entry),
      );

      sprite.setFlipX(flipX);
      // A flipped sprite grows from the opposite edge, so mirror the offset
      // about the body centre to keep it on the figure.
      const x = flipX
        ? -left - offset.x - sprite.width
        : left + offset.x;
      sprite.setPosition(x, top + offset.y + bob);
    }

    // The name sits above whatever is tallest, so a dragonscale hat does not
    // push through it.
    const hatTop = this.hat.visible ? this.hat.y : top;
    this.label.setY(Math.min(top, hatTop) - 4);
  }

  /** Called each frame while walking, to keep the bob in step with the body. */
  tick() {
    if (this.moving) this.placeOverlays();
  }
}
