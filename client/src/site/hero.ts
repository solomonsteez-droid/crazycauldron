/**
 * The hero: the hub painting, the weather over it, and four chefs walking.
 *
 * This is the game's own ambience, on a plain 2D canvas rather than in Phaser.
 * The arithmetic is imported from world/motionMath.ts - the same travelling
 * wind that drives the grass and the chimney smoke in the hub - so the wave
 * crossing the picture here is the wave a player sees when they arrive. What
 * is not imported is the renderer: pulling Phaser into the marketing bundle to
 * draw forty tufts of grass would cost 1.2 MB against a 3 MB budget, and it
 * would be the single largest thing on the page.
 *
 * Everything degrades. A canvas that cannot get a context, an image that
 * fails, a browser asking for reduced motion: each of those leaves the hero as
 * a painting with words on it, which was always the point.
 */

import { tuftPose, windAt } from "../world/motionMath.js";
import { SPRITES, characterFrames, type CharacterFrames } from "./sprites.js";

/** The wind takes this long to cross the picture; the hub's own period. */
const WIND_PERIOD_MS = 8000;

/** Pixel art is drawn at whole multiples only, or it shimmers. */
const SPRITE_SCALE = 3;

interface Tuft {
  x: number;
  y: number;
  height: number;
  phase: number;
  shade: string;
}

interface Puff {
  x: number;
  y: number;
  age: number;
  life: number;
  drift: number;
  size: number;
}

interface Bird {
  x: number;
  y: number;
  speed: number;
  phase: number;
}

/** One of the chefs crossing the foreground. */
interface Walker {
  x: number;
  y: number;
  speed: number;
  body: CharacterFrames;
  hat: HTMLImageElement | null;
  hatOffset: { x: number; y: number };
  companion: HTMLImageElement | null;
  step: number;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Starts the hero animation, and hands back a way to stop it.
 *
 * Nothing on the page calls the stopper today - the hero lives as long as the
 * document does - but the loop holds a rAF handle and a resize listener, and a
 * loop with no way to end is the kind of thing that is fine until the day
 * something navigates without a reload.
 */
export function startHero(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => {};

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let painting: HTMLImageElement | null = null;
  let tufts: Tuft[] = [];
  const puffs: Puff[] = [];
  let bird: Bird | null = null;
  let nextBirdAt = performance.now() + 4000;
  const walkers: Walker[] = [];
  let frame = 0;
  let stopped = false;

  function resize(): void {
    const box = canvas.getBoundingClientRect();
    // Cap the device ratio: a 3x phone would quadruple the fill cost of a
    // full-screen canvas for a picture that is deliberately blurred anyway.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    context!.imageSmoothingEnabled = false;
    seedTufts();
    placeWalkers();
  }

  /**
   * Grass along the bottom edge, thinning towards the middle of the picture.
   *
   * Placed rather than sampled from the painting. The game samples, because it
   * has the map's own pixels and a cell grid to hang them on; here the picture
   * is cropped to an unknown rectangle by object-fit, so where the grass is on
   * screen is not knowable without reading the canvas back every resize.
   */
  function seedTufts(): void {
    const count = reduced ? 0 : Math.min(46, Math.round(width / 26));
    tufts = Array.from({ length: count }, (_, i) => {
      const x = ((i + 0.5) / count) * width + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 14;
      const depth = (Math.sin(i * 78.233) * 0.5 + 0.5);
      return {
        x,
        y: height - 6 - depth * Math.min(70, height * 0.1),
        height: 7 + depth * 9,
        phase: i * 0.7,
        shade: depth > 0.5 ? "rgba(92, 138, 74, 0.55)" : "rgba(63, 107, 70, 0.5)",
      };
    });
  }

  function placeWalkers(): void {
    const groundY = height - Math.min(48, height * 0.07);
    for (let i = 0; i < walkers.length; i += 1) {
      walkers[i]!.y = groundY - i * 6;
    }
  }

  function drawPainting(now: number): void {
    if (!painting) {
      context!.fillStyle = "#14101a";
      context!.fillRect(0, 0, width, height);
      return;
    }

    /*
     * Cover-fit, then drifted a few pixels by the same wind that moves the
     * grass. It is the slowest thing on screen by a long way, which is what
     * makes it read as depth rather than as the background sliding about.
     */
    const scale = Math.max(width / painting.width, height / painting.height);
    const drawWidth = painting.width * scale;
    const drawHeight = painting.height * scale;
    const drift = reduced ? 0 : windAt(now, 0, WIND_PERIOD_MS * 3, width) * 9;

    context!.drawImage(
      painting,
      (width - drawWidth) / 2 + drift,
      (height - drawHeight) * 0.62,
      drawWidth,
      drawHeight,
    );
  }

  function drawTufts(now: number): void {
    for (const tuft of tufts) {
      const pose = tuftPose(now, tuft.x, tuft.phase, WIND_PERIOD_MS, width);
      context!.save();
      context!.translate(tuft.x, tuft.y);
      context!.rotate((pose.angle * Math.PI) / 180);
      context!.fillStyle = tuft.shade;
      context!.fillRect(-1, -tuft.height, 2, tuft.height);
      context!.fillRect(-3, -tuft.height * 0.6, 2, tuft.height * 0.6);
      context!.fillRect(1, -tuft.height * 0.75, 2, tuft.height * 0.75);
      context!.restore();
    }
  }

  function drawSmoke(now: number, deltaMs: number): void {
    if (reduced) return;

    // Two chimneys, placed in the thirds rather than on map anchors: the
    // painting is cropped by cover-fit, so an anchor cell has no fixed place.
    if (frame % 22 === 0) {
      for (const at of [0.26, 0.68]) {
        puffs.push({
          x: width * at,
          y: height * 0.34,
          age: 0,
          life: 5200,
          drift: 0,
          size: 5,
        });
      }
    }

    for (let i = puffs.length - 1; i >= 0; i -= 1) {
      const puff = puffs[i]!;
      puff.age += deltaMs;
      if (puff.age > puff.life) {
        puffs.splice(i, 1);
        continue;
      }

      const t = puff.age / puff.life;
      // The same wind as the grass, so smoke leans when the grass leans.
      puff.drift += windAt(now, puff.x, WIND_PERIOD_MS, width) * 0.35;
      context!.globalAlpha = (1 - t) * 0.22;
      context!.fillStyle = "#cfc6bb";
      context!.beginPath();
      context!.arc(
        puff.x + puff.drift,
        puff.y - t * height * 0.22,
        puff.size + t * 16,
        0,
        Math.PI * 2,
      );
      context!.fill();
      context!.globalAlpha = 1;
    }
  }

  function drawBird(now: number, deltaMs: number): void {
    if (reduced) return;

    if (!bird && now > nextBirdAt) {
      bird = {
        x: -30,
        y: height * (0.18 + Math.random() * 0.14),
        speed: 0.045 + Math.random() * 0.02,
        phase: Math.random() * Math.PI * 2,
      };
    }
    if (!bird) return;

    bird.x += bird.speed * deltaMs;
    if (bird.x > width + 30) {
      bird = null;
      nextBirdAt = now + 9000 + Math.random() * 9000;
      return;
    }

    const flap = Math.sin(now / 90 + bird.phase) * 4;
    context!.strokeStyle = "rgba(24, 20, 30, 0.55)";
    context!.lineWidth = 2;
    context!.beginPath();
    context!.moveTo(bird.x - 6, bird.y + flap);
    context!.lineTo(bird.x, bird.y);
    context!.lineTo(bird.x + 6, bird.y + flap);
    context!.stroke();
  }

  function drawWalkers(deltaMs: number): void {
    for (const walker of walkers) {
      walker.x += walker.speed * deltaMs;
      if (walker.x > width + 60) walker.x = -60 - Math.random() * 120;
      walker.step += deltaMs;

      const frames = walker.body.walkRight;
      const rect = frames[Math.floor(walker.step / 100) % frames.length]!;
      const w = rect.w * SPRITE_SCALE;
      const h = rect.h * SPRITE_SCALE;
      const x = Math.round(walker.x);
      const y = Math.round(walker.y - h);

      // A one-pixel bob, at the sprite's own scale, so it stays on the grid.
      const bob = Math.floor(walker.step / 200) % 2 === 0 ? 0 : SPRITE_SCALE;

      context!.drawImage(walker.body.sheet, rect.x, rect.y, rect.w, rect.h, x, y + bob, w, h);

      if (walker.hat) {
        context!.drawImage(
          walker.hat,
          x + walker.hatOffset.x * SPRITE_SCALE,
          y + bob + walker.hatOffset.y * SPRITE_SCALE,
          walker.hat.width * SPRITE_SCALE,
          walker.hat.height * SPRITE_SCALE,
        );
      }

      if (walker.companion) {
        const cw = walker.companion.width * SPRITE_SCALE;
        const ch = walker.companion.height * SPRITE_SCALE;
        context!.drawImage(
          walker.companion,
          Math.round(walker.x - cw - 8),
          Math.round(walker.y - ch + bob),
          cw,
          ch,
        );
      }
    }
  }

  let last = performance.now();
  function tick(now: number): void {
    if (stopped) return;
    const deltaMs = Math.min(64, now - last);
    last = now;
    frame += 1;

    context!.clearRect(0, 0, width, height);
    drawPainting(now);
    drawSmoke(now, deltaMs);
    drawBird(now, deltaMs);
    drawTufts(now);
    drawWalkers(deltaMs);

    requestAnimationFrame(tick);
  }

  const onResize = () => resize();
  window.addEventListener("resize", onResize, { passive: true });
  resize();
  requestAnimationFrame(tick);

  // The art arrives after the first frames; each piece joins as it lands.
  void (async () => {
    const narrow = window.innerWidth < 900;
    painting = await loadImage(SPRITES.painting("map_hub", narrow));

    const bodies = await Promise.all([characterFrames("male"), characterFrames("female")]);
    const hatIds = ["hat_01_chef", "hat_05_circlet", "hat_03_mushroom", "hat_07_moonpetal"];
    const companionIds = [
      "companion_01_hen",
      "companion_07_emberfox",
      "companion_02_piglet",
      null,
    ];

    const [hats, companions, offsets] = await Promise.all([
      Promise.all(hatIds.map((id) => loadImage(SPRITES.hat(id)))),
      Promise.all(
        companionIds.map((id) => (id ? loadImage(SPRITES.companion(id)) : Promise.resolve(null))),
      ),
      SPRITES.hatOffsets(),
    ]);

    for (let i = 0; i < hatIds.length; i += 1) {
      const body = bodies[i % 2];
      if (!body) continue;
      walkers.push({
        x: -80 - i * 150,
        y: height,
        speed: 0.022 + i * 0.004,
        body,
        hat: hats[i] ?? null,
        hatOffset: offsets[hatIds[i] ?? ""] ?? { x: 6, y: -12 },
        companion: companions[i] ?? null,
        step: i * 340,
      });
    }
    placeWalkers();
  })();

  return () => {
    stopped = true;
    window.removeEventListener("resize", onResize);
  };
}
