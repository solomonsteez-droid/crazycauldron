import Phaser from "phaser";
import { createBodyAnimations, drawPlaceholders, queueArt } from "../art/assets.js";
import { loadArt } from "../art/manifest.js";
import { GameMap } from "../map/gameMap.js";
import { createPlaceholderArt } from "../map/textures.js";
import { SCENE_BOOT, SCENE_LOGIN } from "./keys.js";

/**
 * Loads the processed art, then hands over to login.
 *
 * Two kinds of art exist side by side: what the pipeline produced, and what it
 * could not because the drops have not been drawn yet. Both are resolved here
 * so that by the time any scene runs, every texture key it might ask for is
 * present - either the real sprite or a generated stand-in.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_BOOT);
  }

  create() {
    createPlaceholderArt(this);

    void loadArt().then(({ manifest }) => {
      queueArt(this, manifest);

      const finish = () => {
        drawPlaceholders(this);
        GameMap.useTerrain(manifest.terrain ?? []);
        createBodyAnimations(this, manifest);
        this.scene.start(SCENE_LOGIN);
      };

      // Nothing queued means no processed art yet; go straight to placeholders.
      if (this.load.list.size === 0) {
        finish();
        return;
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, finish);
      this.load.start();
    });
  }
}
