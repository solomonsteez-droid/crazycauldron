import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { HubScene } from "./scenes/HubScene.js";
import { LoginScene } from "./scenes/LoginScene.js";
import { WaitingScene } from "./scenes/WaitingScene.js";

/**
 * Pixel-art defaults matter here: `pixelArt` turns off texture smoothing and
 * `roundPixels` keeps sprites on whole pixels, without which a 32x16 isometric
 * tile shimmers as the camera follows a player.
 *
 * Scale.RESIZE makes the canvas track the window rather than sitting at a fixed
 * 1024x768 in the corner. The initial width/height still matter: they are what
 * the first frame is laid out with, before the scale manager has measured the
 * parent, so seeding them from the window avoids a visible jump on load.
 * Cameras are not resized by the scale manager, so each scene listens for
 * RESIZE and re-lays-out itself.
 */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#14101a",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
    // RESIZE fills the parent, so there is no letterboxing to centre.
    autoCenter: Phaser.Scale.NO_CENTER,
    expandParent: false,
  },
  scene: [BootScene, LoginScene, HubScene, WaitingScene],
});

// The static "warming the cauldron" text is replaced the moment a scene draws
// its own overlay; remove it so it cannot flash behind a panel.
document.getElementById("boot")?.remove();
