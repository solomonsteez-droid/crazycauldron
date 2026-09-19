import Phaser from "phaser";
import { createPlaceholderArt } from "../map/textures.js";
import { SCENE_BOOT, SCENE_LOGIN } from "./keys.js";

/**
 * Generates the placeholder art and hands straight over to login. There is
 * nothing to preload - every texture is drawn at runtime - so this scene exists
 * only to guarantee the textures exist before any other scene runs.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_BOOT);
  }

  create() {
    createPlaceholderArt(this);
    this.scene.start(SCENE_LOGIN);
  }
}
