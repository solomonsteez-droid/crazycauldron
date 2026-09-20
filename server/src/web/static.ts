/**
 * Serving the game itself.
 *
 * In production there is one deployment, not two: the same Express that
 * answers /auth and /play also hands out index.html, the bundle and the art.
 * That is what makes the client's URLs same-origin - no CORS, no second host
 * to configure, no way for the two halves to drift to different versions.
 *
 * In development none of this runs. Vite serves the client on :5173 with hot
 * reload and talks to this server across origins, which is why the CORS
 * allowlist still exists.
 */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.js";
import { log } from "../logger.js";

/** Where `npm run build -w client` leaves the built game. */
export const CLIENT_DIST = path.join(REPO_ROOT, "client", "dist");

/**
 * A file Vite named after its own contents, and may therefore be cached
 * forever: index-C3AcXhqQ.js changes name whenever it changes bytes.
 *
 * Game art does not match, and must not: maps and sprites keep their names
 * across builds, so a year-long cache would pin a player to whatever art they
 * first loaded.
 */
const FINGERPRINTED = /-[A-Za-z0-9_-]{8,}\.(?:js|css|map)$/;

/** A year, which is the longest max-age the spec asks anyone to honour. */
const ONE_YEAR_SECONDS = 31_536_000;
/** Long enough to help a reload, short enough that a deploy lands same-day. */
const ART_SECONDS = 3_600;

/**
 * Mounts the built client at /, if it has been built.
 *
 * A missing build is not fatal. The server's own routes are what the tests and
 * the health check need, and refusing to start because nobody ran `vite build`
 * would make every backend test depend on the frontend.
 */
export function serveClient(app: express.Application): boolean {
  const index = path.join(CLIENT_DIST, "index.html");
  const play = path.join(CLIENT_DIST, "play.html");
  if (!fs.existsSync(index)) {
    log.warn("client.not_built", { expected: CLIENT_DIST });
    return false;
  }

  app.use(
    express.static(CLIENT_DIST, {
      // index.html is handled below so that its no-cache header is applied to
      // the deep links too, not only to a bare "/".
      index: false,
      setHeaders(res, file) {
        if (FINGERPRINTED.test(path.basename(file))) {
          res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
        } else if (file.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", `public, max-age=${ART_SECONDS}`);
        }
      },
    }),
  );

  /*
   * Which of the two documents a path gets.
   *
   * There are two now: the marketing site and the game, built as separate
   * bundles so that reading the front page does not download a renderer. Only
   * /play is the game; everything else that looks like a page is the site,
   * which draws the front page, the whitepaper, the roadmap and the two legal
   * pages from its own router.
   *
   * A request with a file extension is not a page - it is a missing asset, and
   * answering it with HTML would turn "the sprite 404s" into "the sprite is
   * corrupt", which is a much worse afternoon.
   */
  const GAME_PATHS = new Set(["/play"]);

  app.get("*", (req, res, next) => {
    if (req.method !== "GET" || path.extname(req.path)) return next();

    const tidy = req.path.replace(/\/+$/, "") || "/";
    const wantsGame = GAME_PATHS.has(tidy) && fs.existsSync(play);

    res.setHeader("Cache-Control", "no-cache");
    return res.sendFile(wantsGame ? play : index);
  });

  log.info("client.served", { from: CLIENT_DIST, game: fs.existsSync(play) });
  return true;
}
