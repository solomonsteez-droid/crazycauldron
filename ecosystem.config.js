/*
 * How the server is started in production.
 *
 * Colyseus Cloud reads this file to learn what to run. It is also what `pm2
 * start ecosystem.config.js` uses on a plain VPS, so the two deployments agree
 * on one thing rather than drifting apart.
 *
 * fork mode, not cluster: Colyseus assigns each process its own port and its
 * own set of rooms, and cluster mode's shared listening socket would hand a
 * websocket to whichever process answered first - which is usually not the one
 * holding the room that reserved the seat.
 */

const os = require("node:os");

module.exports = {
  apps: [
    {
      name: "crazycauldron",
      // The compiled entry. `npm run build` at the repo root produces it.
      script: "server/dist/index.js",
      instances: os.cpus().length,
      exec_mode: "fork",
      /*
       * pm2 waits for the process to say it is ready rather than assuming it
       * is ready the moment it starts. The server says so after the map
       * layouts validate, the database opens and the socket binds, which is
       * the difference between a rolling restart and a minute of refused
       * connections.
       */
      wait_ready: true,
      listen_timeout: 30_000,
      kill_timeout: 10_000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
