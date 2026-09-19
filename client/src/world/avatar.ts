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

/**
 * Procedural idle motion, in milliseconds.
 *
 * No new art: the body sheet has one frame per idle direction, so standing
 * still would otherwise be perfectly static. These are whole-pixel offsets
 * applied to the sprites rather than a scale or a rotation, because a
 * sub-pixel wobble on a 32x48 pixel-art figure reads as blur.
 */
const BREATH_MS = 1200;
const FIDGET_MIN_MS = 6000;
const FIDGET_MAX_MS = 10000;
const FIDGET_MS = 300;
const DANCE_MS = 1500;

type Fidget = "squash" | "leanLeft" | "leanRight";

/** Where the whole figure sits this frame, relative to its resting place. */
interface Pose {
  /** Whole pixels, applied to body and garments alike. */
  dx: number;
  dy: number;
  /** Extra squash, as a scale on the body only. */
  squash: number;
}

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

  /** Set while the server says this player is cooking, which drives the dance. */
  private dancing = false;
  /** Random per-avatar so a crowd does not breathe in unison. */
  private readonly phase = Math.random() * BREATH_MS;
  private bubble: Phaser.GameObjects.Text | null = null;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private labelScaleValue = 1;
  private labelResolution = 1;
  private fidgetUntil = 0;
  private fidgetKind: Fidget = "squash";
  private nextFidgetAt = 0;
  private pose: Pose = { dx: 0, dy: 0, squash: 1 };

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
    const turned = direction !== this.direction;
    this.direction = direction;
    this.moving = moving;
    this.playBody();
    // Turning to or from "up" can change which art a garment uses, so the
    // texture is re-picked rather than only re-placed.
    if (turned) this.apply();
    else this.placeOverlays();
  }

  /** Cooking replaces the idle motion with a little two-step. */
  setActivity(activity: string) {
    this.dancing = activity === "cooking";
  }

  /**
   * A speech bubble above the head, for a few seconds.
   *
   * Parented to the container so it travels with whoever said it, but placed
   * from the label rather than the pose - a bubble that breathes with the
   * character is distracting to read.
   */
  say(text: string, ms = 3500) {
    this.bubbleTimer?.remove();

    if (!this.bubble) {
      this.bubble = this.scene.add
        .text(0, 0, "", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: hex(PALETTE.night),
          backgroundColor: hex(PALETTE.parchment),
          padding: { x: 4, y: 3 },
          align: "center",
          wordWrap: { width: 130 },
        })
        .setOrigin(0.5, 1);
      this.container.add(this.bubble);
      this.bubble.setScale(this.labelScaleValue).setResolution(this.labelResolution);
    }

    this.bubble.setText(text).setVisible(true);
    this.bubble.setY(this.label.y - this.label.displayHeight - 3);
    this.bubbleTimer = this.scene.time.delayedCall(ms, () => this.bubble?.setVisible(false));
  }

  /** Counter-scales the name so it reads the same at any camera zoom. */
  setLabelScale(scale: number, resolution: number) {
    this.labelScaleValue = scale;
    this.labelResolution = resolution;
    this.label.setScale(scale).setResolution(resolution);
    this.bubble?.setScale(scale).setResolution(resolution);
  }

  get labelObject(): Phaser.GameObjects.Text {
    return this.label;
  }

  destroy() {
    this.bubbleTimer?.remove();
    this.container.destroy(true);
  }

  // --- internals ----------------------------------------------------------

  private apply() {
    /*
     * Facing away uses the back art when the artist drew one. Without it the
     * front is mirrored, which is fine for a toque and wrong for anything with
     * a brooch on it - so which items have a back view is recorded by the
     * pipeline rather than assumed here.
     */
    const facingAway = this.direction === "up";
    const hatEntry = this.manifest.hats.find((e) => e.id === this.look.hatId);
    const apronEntry = this.manifest.aprons.find((e) => e.id === this.look.apronId);

    const hatTexture = hatKey(this.look.hatId, facingAway && hatEntry?.back === true);
    const apronTexture = apronKey(this.look.apronId, facingAway && apronEntry?.back === true);

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
    // Garments hang off the body, so they inherit whatever the pose did to it.
    const left = -BODY_FRAME.width / 2 + this.pose.dx;
    const top = -BODY_FRAME.height + this.pose.dy;
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

      /*
       * A flipped sprite grows from the opposite edge, so its position is
       * mirrored about the body's centre line - and that centre line is itself
       * displaced by the pose. Folding pose.dx into `left` and negating the
       * lot would send a flipped garment the opposite way to the body it is
       * sitting on, which shows up the moment the dance tilts a side view.
       */
      const centre = this.pose.dx;
      const unflipped = left + offset.x;
      const x = flipX ? 2 * centre - unflipped - sprite.width : unflipped;
      sprite.setPosition(x, top + offset.y + bob);
    }

    // The name sits above whatever is tallest, so a dragonscale hat does not
    // push through it.
    const hatTop = this.hat.visible ? this.hat.y : top;
    // The name stays put while the body breathes; a bobbing label reads as a
    // rendering fault rather than as life.
    this.label.setY(Math.min(-BODY_FRAME.height, hatTop) - 4);
  }

  /**
   * Advances the procedural motion and re-seats everything.
   *
   * Three states, in priority order: walking uses the sheet's own frames and
   * only needs the garments re-seated; cooking runs a looping two-step; and
   * standing still breathes, with an occasional fidget. Every one of them
   * resolves to a whole-pixel offset applied to the body *and* the garments,
   * so a hat never drifts off a head that has moved.
   */
  tick(now: number) {
    this.pose = this.moving
      ? { dx: 0, dy: 0, squash: 1 }
      : this.dancing
        ? this.dancePose(now)
        : this.idlePose(now);

    this.body.setPosition(this.pose.dx, this.pose.dy);
    this.body.setScale(1, this.pose.squash);
    this.placeOverlays();
  }

  /**
   * A two-step: bounce, bounce, tilt left, tilt right.
   *
   * Quarters of the cycle rather than a sine, so the beats land crisply -
   * a smooth curve at this size just looks like the sprite is sliding.
   */
  private dancePose(now: number): Pose {
    const t = ((now + this.phase) % DANCE_MS) / DANCE_MS;

    if (t < 0.25) return { dx: 0, dy: t < 0.125 ? -2 : 0, squash: 1 };
    if (t < 0.5) return { dx: 0, dy: t < 0.375 ? -2 : 0, squash: 1 };
    if (t < 0.75) return { dx: -1, dy: -1, squash: 1 };
    return { dx: 1, dy: -1, squash: 1 };
  }

  /** A 1px breath, plus a fidget every six to ten seconds. */
  private idlePose(now: number): Pose {
    if (now >= this.nextFidgetAt) {
      this.startFidget(now);
    }

    if (now < this.fidgetUntil) {
      if (this.fidgetKind === "squash") return { dx: 0, dy: 1, squash: 0.96 };
      return { dx: this.fidgetKind === "leanLeft" ? -1 : 1, dy: 0, squash: 1 };
    }

    // Eased so the figure hangs at the top and bottom of the breath rather
    // than ticking between two positions.
    const t = ((now + this.phase) % BREATH_MS) / BREATH_MS;
    const eased = (1 - Math.cos(t * Math.PI * 2)) / 2;
    return { dx: 0, dy: eased > 0.5 ? -1 : 0, squash: 1 };
  }

  private startFidget(now: number) {
    // The first call seeds the timer rather than firing immediately, so an
    // avatar does not twitch the instant it appears.
    if (this.nextFidgetAt !== 0) {
      const kinds: Fidget[] = ["squash", "leanLeft", "leanRight"];
      this.fidgetKind = kinds[Math.floor(Math.random() * kinds.length)] ?? "squash";
      this.fidgetUntil = now + FIDGET_MS;
    }
    this.nextFidgetAt =
      now + FIDGET_MIN_MS + Math.random() * (FIDGET_MAX_MS - FIDGET_MIN_MS);
  }
}
