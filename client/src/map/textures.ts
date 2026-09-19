import Phaser from "phaser";
import { CELL } from "@crazycauldron/shared";

/**
 * The few things still drawn at runtime.
 *
 * The ground used to be built here out of generated diamonds. It is a painting
 * now, so what is left is the handful of marks the paint cannot carry: the
 * click marker, the pool of light under a gate, and a stand-in tuft for any
 * gather node whose art has not been processed yet.
 */

export const TEX_MARKER = "move-marker";
export const TEX_NODE = "gather-node";
export const TEX_NODE_SPENT = "gather-node-spent";
export const TEX_GLOW = "soft-glow";

export function createPlaceholderArt(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX_MARKER)) return; // Already built this session.

  const g = scene.add.graphics();

  // Move marker: a hollow square on the destination cell. A square now, not a
  // diamond - the grid underneath it is square, and a diamond over a painting
  // was pointing at a lattice that no longer exists.
  g.lineStyle(1, 0x7ce08a, 0.9);
  g.strokeRect(1, 1, CELL - 2, CELL - 2);
  g.generateTexture(TEX_MARKER, CELL, CELL);
  g.clear();

  // Nodes are tinted at use, so each is drawn white and coloured by the
  // section palette rather than baked once per section.
  drawNode(g, true);
  g.generateTexture(TEX_NODE, 16, 20);
  g.clear();

  drawNode(g, false);
  g.generateTexture(TEX_NODE_SPENT, 16, 20);
  g.clear();

  drawGlow(g);
  g.generateTexture(TEX_GLOW, 64, 64);
  g.destroy();
}

/**
 * A soft pool of light, built from concentric circles.
 *
 * Phaser has no radial gradient on Graphics, and a handful of stacked circles
 * at low alpha is indistinguishable from one at this size - and costs a single
 * texture rather than a shader.
 */
function drawGlow(g: Phaser.GameObjects.Graphics) {
  const steps = 10;
  for (let i = steps; i > 0; i -= 1) {
    g.fillStyle(0xffffff, 0.05);
    g.fillCircle(32, 32, (32 * i) / steps);
  }
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

