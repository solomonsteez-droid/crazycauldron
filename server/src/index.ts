import { WebSocketTransport } from "@colyseus/ws-transport";
import { defineRoom, defineServer, listen } from "colyseus";
import cors from "cors";
import express from "express";
import { ROOM_HUB, ROOM_WAITING, validateAllLayouts } from "@crazycauldron/shared";
import { authRouter } from "./auth/routes.js";
import { cloudOptions, onColyseusCloud } from "./cloud.js";
import { config } from "./config.js";
import { closeDatabase, databaseHealth } from "./db/index.js";
import { log } from "./logger.js";
import { snapshot } from "./metrics.js";
import { alert, closeLog, logFile } from "./monitoring.js";
import { startSchedules } from "./schedule.js";
import { capacity } from "./matchmaking/index.js";
import { matchmakeRouter } from "./matchmaking/routes.js";
import { shopRouter } from "./shop/routes.js";
import { adminRouter } from "./web/admin.js";
import { publicRouter } from "./web/publicConfig.js";
import { statsRouter } from "./web/stats.js";
import { serveClient } from "./web/static.js";
import { HubRoom } from "./rooms/HubRoom.js";
import { WaitingRoom } from "./rooms/WaitingRoom.js";

/*
 * The world is checked before anything is served.
 *
 * Every building, gate, prop and gather node is authored by hand in JSON, and
 * the ways that goes wrong are quiet: a shrub on a doorstep, two nodes on one
 * tile, a well in the middle of a path. None of them throw. Refusing to start
 * turns "somebody will notice eventually" into "nobody can deploy it".
 */
const layoutProblems = validateAllLayouts();
if (layoutProblems.length > 0) {
  for (const problem of layoutProblems) {
    log.error("layout.invalid", { map: problem.map, problem: problem.message });
  }
  throw new Error(
    `Refusing to start: ${layoutProblems.length} map layout problem(s). ` +
      "Fix the placements in shared/src/content/ and try again.",
  );
}
log.info("layout.ok", { maps: 4 });

/**
 * Whether an origin is on the allowlist, compared exactly but forgivingly.
 *
 * "Exactly" in the sense that matters - scheme, host and port all have to
 * agree, and nothing is matched by prefix. Forgiving only about the two ways
 * the same origin gets written down: a trailing slash, which browsers never
 * send but people always put in a config, and letter case in the host.
 */
function allowedOrigin(origin: string): boolean {
  const tidy = (value: string) => value.trim().replace(/\/+$/, "").toLowerCase();
  const wanted = tidy(origin);
  return config.corsOrigins.some((allowed) => tidy(allowed) === wanted);
}

/**
 * The host this request believes it reached, as the browser wrote it.
 *
 * Behind Colyseus Cloud's edge proxy `Host` is whatever the proxy used to
 * reach this process internally, not the name in the address bar, so the
 * forwarded header is preferred where there is one. It is a list when several
 * proxies are chained; the first entry is the original.
 */
function requestHost(req: express.Request): string {
  const forwarded = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  return forwarded || req.headers.host || "";
}

/**
 * Whether this request may be answered: no Origin at all, the page this
 * server itself served, or an origin on the allowlist.
 *
 * The same-origin exemption matters because the client is hosted here. Without
 * it a deployment refuses its own front end whenever nobody remembered to put
 * its domain in CORS_ORIGIN - which is every new deployment, and the symptom
 * is a login screen that loads and then cannot sign anybody in.
 */
function originPermitted(req: express.Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;

  const host = requestHost(req);
  if (host !== "" && origin.toLowerCase().endsWith(`//${host.toLowerCase()}`)) return true;

  return allowedOrigin(origin);
}

/**
 * Everything this server answers over plain HTTP.
 *
 * Colyseus owns the app now - `defineServer` builds it, attaches the
 * matchmaking routes and hands it here to be furnished. That inversion is what
 * Colyseus Cloud expects to find, and it is why there is no `http.createServer`
 * anywhere in this file any more.
 */
function routes(app: express.Application): void {
  /*
   * Explicit allowlist. Requests with no Origin (curl, health checks, the load
   * test) pass; a browser on an unlisted origin does not.
   *
   * The refusal is a plain 403 rather than a thrown error. Throwing worked -
   * the request was refused - but it travelled to the last-resort handler,
   * which answered 500 and raised an unhandled-error alert. A browser on the
   * wrong origin is a configuration mistake, not an incident.
   */
  app.use((req, res, next) => {
    if (!originPermitted(req)) {
      log.warn("cors.refused", { origin: req.headers.origin, path: req.path });
      /*
       * And take the permission back off. Colyseus installs its own permissive
       * CORS ahead of this hook, which reflects the caller's origin, so
       * without this line a refused page could still read the refusal.
       */
      res.removeHeader("Access-Control-Allow-Origin");
      return res.status(403).json({
        error: "origin_not_allowed",
        message: "This server does not serve that origin.",
      });
    }
    return next();
  });

  /*
   * The headers, decided by the same rule that decided the 403 above. Giving
   * the `cors` package the raw list instead would have it disagree with the
   * middleware about a trailing slash or a capital letter - the request passes
   * and then the browser discards the answer for want of a header, which looks
   * like the server being down rather than a config being mistyped.
   */
  app.use(
    cors((req, done) => {
      const origin = originPermitted(req) ? req.headers.origin ?? false : false;
      done(null, { origin, credentials: false });
    }),
  );
  app.use(express.json({ limit: "8kb" }));

  /**
   * One endpoint that answers "is this thing alive and how hard is it working".
   *
   * Room and player counts, whether the database still answers a read, uptime,
   * and the process's own CPU, memory and simulation-tick timings. The load test
   * polls it; so does anything watching the deployment.
   */
  app.get("/health", async (_req, res) => {
    const [rooms, db] = await Promise.all([capacity(), databaseHealth()]);
    const metrics = snapshot();
    res.status(db.ok ? 200 : 503).json({
      ok: db.ok,
      uptimeSeconds: metrics.uptimeSeconds,
      rooms,
      /*
       * Named fields rather than the whole object.
       *
       * This used to be `database: db`, which published the connection string
       * - host and user included - to anybody who could reach /health. Listing
       * what goes out means a field added to DatabaseHealth later cannot leak
       * by being spread into a public response, which is exactly how the first
       * one got out.
       */
      database: {
        backend: db.backend,
        ok: db.ok,
        players: db.players,
        sizeBytes: db.sizeBytes,
      },
      process: {
        cpuPercentOfCore: metrics.cpuPercentOfCore,
        peakCpuPercentOfCore: metrics.peakCpuPercentOfCore,
        cores: metrics.cores,
        rssMb: metrics.rssMb,
        peakRssMb: metrics.peakRssMb,
        heapUsedMb: metrics.heapUsedMb,
      },
      tick: metrics.tick,
      messages: metrics.messages,
    });
  });

  app.use("/auth", authRouter);
  // NOT "/matchmake": Colyseus hooks the raw http server's "request" event and
  // swallows every URL *containing* that substring (Server.attachMatchMakingRoutes),
  // so an Express router mounted there is never reached - /capacity would answer
  // with Colyseus's room list and /enter with a JSON parse error.
  app.use("/play", matchmakeRouter);
  // Dormant unless SHOP_ENABLED is true; every route inside checks for itself.
  app.use("/shop", shopRouter);
  // Facts the public pages need, including the contract address players copy.
  app.use("/public", publicRouter);
  app.use("/stats", statsRouter);
  // The rollback switch. Absent entirely unless ADMIN_TOKEN is set.
  app.use("/admin", adminRouter);

  /*
   * The built client, mounted after the API.
   *
   * Order matters here and nowhere else: the static handler ends in a
   * catch-all that answers index.html, so anything mounted after it would
   * never be reached.
   */
  serveClient(app);

  // Last-resort handler: log the detail, tell the client nothing useful.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error("http.unhandled", { message: err.message, stack: err.stack });
    void alert({
      kind: "unhandled_error",
      message: "An unhandled error reached the HTTP layer.",
      detail: { error: err.message },
    });
    res.status(500).json({ error: "internal_error", message: "Something went wrong." });
  });
}

/*
 * The server, declared rather than assembled.
 *
 * Rooms, transport and HTTP routes in one object. Colyseus Cloud reads this
 * shape directly - it is the entry point its template expects - and the same
 * file runs unchanged under `npm run dev` locally.
 */
const gameServer = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [ROOM_HUB]: defineRoom(HubRoom),
    [ROOM_WAITING]: defineRoom(WaitingRoom),
  },
  express: routes,
  // Nothing behind the greeting banner is useful in a log aggregator.
  greet: config.nodeEnv !== "production",
  ...(await cloudOptions()),
});

/*
 * listen() rather than gameServer.listen().
 *
 * On Colyseus Cloud a process does not bind a TCP port at all - it binds a
 * unix socket that the edge proxy in front of it knows about - and it has to
 * tell pm2 it is ready before pm2 will send it traffic. Both of those live in
 * this helper. Off Cloud it is `server.listen(port)` with extra steps.
 */
await listen(gameServer, config.port);
log.info("server.listening", {
  port: config.port,
  cloud: onColyseusCloud,
  env: config.nodeEnv,
  hubMax: config.hubMaxPlayers,
  globalMax: config.globalMaxPlayers,
  bypassHold: config.testBypassHold,
  logFile: logFile(),
});

const schedules = startSchedules();

/*
 * Nothing is allowed to die quietly.
 *
 * An unhandled rejection in a hot path is exactly the failure that gets
 * noticed a week later in a support ticket, so both of these are logged with
 * their stack and raise an alert. Neither exits: a single bad promise is not a
 * reason to drop three hundred connected players.
 */
process.on("uncaughtException", (err: Error) => {
  log.error("process.uncaught_exception", { message: err.message, stack: err.stack });
  void alert({
    kind: "unhandled_error",
    message: "An uncaught exception reached the top of the process.",
    detail: { error: err.message },
  });
});

process.on("unhandledRejection", (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  log.error("process.unhandled_rejection", { message: error.message, stack: error.stack });
  void alert({
    kind: "unhandled_rejection",
    message: "A promise rejected with nothing to catch it.",
    detail: { error: error.message },
  });
});

async function shutdown(signal: string) {
  log.info("server.shutdown", { signal });
  schedules.stop();
  try {
    await gameServer.gracefullyShutdown(false);
  } catch (err) {
    log.error("server.shutdown_failed", { message: (err as Error).message });
  }
  closeDatabase();
  closeLog();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
