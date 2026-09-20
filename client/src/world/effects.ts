/**
 * Particles, shake and sound, on a budget.
 *
 * Everything here is pooled. A cooking session can ask for steam every 120ms
 * while sparks fly off the heat bar, and on a phone that is the difference
 * between a smooth frame and a stuttering one - so sprites are recycled and the
 * pool simply refuses to grow past a hard cap rather than allocating under
 * pressure. A dropped puff is invisible; a dropped frame is not.
 */

import Phaser from "phaser";
import { PALETTE, QUALITY_COLOUR, type Quality } from "@crazycauldron/shared";

/** Hard ceiling on live particles across every effect. */
export const MAX_PARTICLES = 200;

export const TEX_PUFF = "fx-puff";
export const TEX_SPARK = "fx-spark";

/** Builds the two particle textures. Cheap, and drawn once per session. */
export function createEffectTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX_PUFF)) {
    const g = scene.add.graphics();
    // A chunky plus-shape rather than a circle: at 6px a circle is a blob, and
    // this keeps the pixel-art silhouette readable as it scales.
    g.fillStyle(0xffffff, 1);
    g.fillRect(2, 0, 2, 6);
    g.fillRect(0, 2, 6, 2);
    g.generateTexture(TEX_PUFF, 6, 6);
    g.destroy();
  }

  if (!scene.textures.exists(TEX_SPARK)) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(TEX_SPARK, 2, 2);
    g.destroy();
  }
}

interface Particle {
  image: Phaser.GameObjects.Image;
  tween?: Phaser.Tweens.Tween;
}

export class Effects {
  private readonly pool: Particle[] = [];
  private live = 0;
  /**
   * Slots held by long-lived sprites that are not in this pool.
   *
   * The world motion keeps grass tufts, water shimmer and lantern glows alive
   * for as long as a map is loaded. They are not particles and never pass
   * through `take`, but they are sprites on the same screen and the 200 is a
   * budget for the screen rather than for this class. Reserving means the
   * transient effects see a smaller ceiling honestly, instead of both sides
   * spending the same slots and the loser being whoever asked second.
   */
  private held = 0;
  private audio: AudioContext | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    createEffectTextures(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /**
   * Holds slots back for sprites this pool does not own.
   *
   * Returns false, and reserves nothing, if the request would leave too little
   * for the effects that mean something - a hub with no steam over the pan is
   * a worse trade than a hub with less grass.
   */
  reserve(count: number): boolean {
    if (this.held + count > MAX_PARTICLES / 2) return false;
    this.held += count;
    return true;
  }

  releaseReserved(count: number): void {
    this.held = Math.max(0, this.held - count);
  }

  /** Takes a sprite from the pool, or null when the budget is spent. */
  private take(texture: string): Particle | null {
    if (this.live + this.held >= MAX_PARTICLES) return null;

    let particle = this.pool.pop();
    if (!particle) {
      particle = { image: this.scene.add.image(0, 0, texture) };
    }
    particle.image.setTexture(texture).setVisible(true).setActive(true);
    this.live += 1;
    return particle;
  }

  private release(particle: Particle) {
    particle.tween?.stop();
    particle.tween = undefined as unknown as Phaser.Tweens.Tween;
    particle.image.setVisible(false).setActive(false).setScale(1).setAlpha(1).setAngle(0);
    this.live -= 1;
    this.pool.push(particle);
  }

  get liveCount(): number {
    return this.live;
  }

  /** Live particles plus reserved slots, against MAX_PARTICLES. */
  get usedCount(): number {
    return this.live + this.held;
  }

  /**
   * One puff of steam, rising and drifting.
   *
   * Quality picks the colour: cream for Common, saffron for Fine, berry for
   * Superb - the same three the reveal card and the dish label use, so a glance
   * at a pot tells you how the last dish went.
   */
  steam(x: number, y: number, quality: Quality = "common", depth = 10000): void {
    const particle = this.take(TEX_PUFF);
    if (!particle) return;

    const drift = Phaser.Math.Between(-14, 14);
    particle.image
      .setPosition(x + Phaser.Math.Between(-4, 4), y)
      .setTint(QUALITY_COLOUR[quality])
      .setAlpha(0.75)
      .setScale(Phaser.Math.FloatBetween(0.6, 1))
      .setDepth(depth);

    particle.tween = this.scene.tweens.add({
      targets: particle.image,
      x: particle.image.x + drift,
      y: y - Phaser.Math.Between(18, 30),
      alpha: 0,
      scale: Phaser.Math.FloatBetween(1.3, 2),
      duration: Phaser.Math.Between(900, 1500),
      ease: "Sine.easeOut",
      onComplete: () => this.release(particle),
    });
  }

  /**
   * A general drifting particle, for ambience rather than feedback.
   *
   * Cooking effects have opinions about colour and speed because they mean
   * something; a firefly or a falling leaf only has to move plausibly, so the
   * caller supplies the motion and this supplies the pooling. Returns false
   * when the budget is spent, which is how the ambience knows to stop asking:
   * a dropped leaf is invisible, a dropped frame is not.
   */
  float(options: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    colour: number;
    durationMs: number;
    scale?: number;
    alpha?: number;
    spin?: number;
    fadeIn?: boolean;
    texture?: string;
    depth?: number;
  }): boolean {
    const particle = this.take(options.texture ?? TEX_SPARK);
    if (!particle) return false;

    const alpha = options.alpha ?? 0.8;
    particle.image
      .setPosition(options.x, options.y)
      .setTint(options.colour)
      .setAlpha(options.fadeIn ? 0 : alpha)
      .setScale(options.scale ?? 1)
      .setAngle(0)
      .setDepth(options.depth ?? 10000);

    particle.tween = this.scene.tweens.add({
      targets: particle.image,
      x: options.x + options.dx,
      y: options.y + options.dy,
      angle: options.spin ?? 0,
      alpha: options.fadeIn ? { from: 0, to: alpha } : 0,
      duration: options.durationMs,
      ease: "Sine.easeInOut",
      yoyo: options.fadeIn === true,
      onComplete: () => this.release(particle),
    });
    return true;
  }

  /** A spark thrown off the pan; short, fast and warm. */
  spark(x: number, y: number, depth = 10000): void {
    const particle = this.take(TEX_SPARK);
    if (!particle) return;

    const angle = Phaser.Math.FloatBetween(-Math.PI, 0);
    const distance = Phaser.Math.Between(10, 26);

    particle.image
      .setPosition(x, y)
      .setTint(Phaser.Math.Between(0, 1) ? PALETTE.saffron : PALETTE.gold)
      .setAlpha(1)
      .setScale(Phaser.Math.FloatBetween(0.8, 1.6))
      .setDepth(depth);

    particle.tween = this.scene.tweens.add({
      targets: particle.image,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      duration: Phaser.Math.Between(260, 460),
      ease: "Quad.easeOut",
      onComplete: () => this.release(particle),
    });
  }

  /** A ring of sparks, for a level-up. Capped so it cannot eat the budget. */
  burst(x: number, y: number, colour = PALETTE.accent, count = 16, depth = 10000): void {
    const n = Math.min(count, MAX_PARTICLES - this.live - this.held);
    for (let i = 0; i < n; i += 1) {
      const particle = this.take(TEX_SPARK);
      if (!particle) return;

      const angle = (Math.PI * 2 * i) / n;
      const distance = Phaser.Math.Between(18, 34);

      particle.image
        .setPosition(x, y)
        .setTint(colour)
        .setAlpha(1)
        .setScale(2)
        .setDepth(depth);

      particle.tween = this.scene.tweens.add({
        targets: particle.image,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.5,
        duration: 600,
        ease: "Quad.easeOut",
        onComplete: () => this.release(particle),
      });
    }
  }

  /** A brief knock, for a Superb hit. 100ms, as specified - any longer reads as a bug. */
  shake(duration = 100, intensity = 0.006): void {
    this.scene.cameras.main.shake(duration, intensity);
  }

  /**
   * A placeholder chime, synthesised rather than loaded.
   *
   * There is no audio in the repo yet and a missing file is worse than a sine
   * wave. Two quick notes through WebAudio, created lazily because browsers
   * refuse an AudioContext until the user has interacted with the page.
   */
  chime(): void {
    try {
      if (!this.audio) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.audio = new Ctor();
      }
      if (this.audio.state === "suspended") void this.audio.resume();

      const now = this.audio.currentTime;
      for (const [index, frequency] of [880, 1320].entries()) {
        const osc = this.audio.createOscillator();
        const gain = this.audio.createGain();
        osc.type = "triangle";
        osc.frequency.value = frequency;

        const at = now + index * 0.08;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);

        osc.connect(gain).connect(this.audio.destination);
        osc.start(at);
        osc.stop(at + 0.25);
      }
    } catch {
      // Audio is a nicety; never let it break a cook.
    }
  }

  /** A quick squash and stretch, for something that was just clicked. */
  static squash(scene: Phaser.Scene, target: Phaser.GameObjects.Image): void {
    scene.tweens.chain({
      targets: target,
      tweens: [
        { scaleX: 1.25, scaleY: 0.75, duration: 90, ease: "Quad.easeOut" },
        { scaleX: 0.9, scaleY: 1.15, duration: 110, ease: "Quad.easeOut" },
        { scaleX: 1, scaleY: 1, duration: 120, ease: "Back.easeOut" },
      ],
    });
  }

  destroy() {
    for (const particle of this.pool) {
      particle.tween?.stop();
      particle.image.destroy();
    }
    this.pool.length = 0;
    this.live = 0;
    void this.audio?.close();
    this.audio = null;
  }
}
