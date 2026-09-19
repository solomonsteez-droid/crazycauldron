import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { HubScene } from "./scenes/HubScene.js";
import { LoginScene } from "./scenes/LoginScene.js";
import { WaitingScene } from "./scenes/WaitingScene.js";

/**
 * Pixel-art defaults matter here: `pixelArt` turns off texture smoothing and
 * `roundPixels` keeps sprites on whole pixels, without which a 32x16 isometric
 * tile shimmers as the camera follows a player.
 */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#14101a",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LoginScene, HubScene, WaitingScene],
});

// The static "warming the cauldron" text is replaced the moment a scene draws
// its own overlay; remove it so it cannot flash behind a panel.
document.getElementById("boot")?.remove();
