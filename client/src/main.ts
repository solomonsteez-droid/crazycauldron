import Phaser from "phaser";
import { pageFor, renderPage } from "./ui/pages.js";
import { BootScene } from "./scenes/BootScene.js";
import { HubScene } from "./scenes/HubScene.js";
import { LoginScene } from "./scenes/LoginScene.js";
import { WaitingScene } from "./scenes/WaitingScene.js";

/*
 * /official, /rules and /roadmap are the same bundle, not a second site.
 *
 * The server hands index.html to any path that does not look like a file, so
 * this runs for all of them. When the URL asks for a page, the page is drawn
 * and the game is never started - there is no reason to load Phaser, a socket
 * and four scenes to show somebody a contract address.
 */
const page = pageFor(window.location.pathname);
if (page) {
  void renderPage(page);
}

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
const game = page
  ? null
  : new Phaser.Game({
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

if (game) {
  /*
   * The reveal card draws the dish straight out of the texture manager, so it
   * needs a handle on the game. One global beats threading a reference through
   * every panel that might want to show an item.
   */
  (window as unknown as { __ccGame?: Phaser.Game }).__ccGame = game;

  // The static "warming the cauldron" text is replaced the moment a scene
  // draws its own overlay; remove it so it cannot flash behind a panel.
  document.getElementById("boot")?.remove();
}
