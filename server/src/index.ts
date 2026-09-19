import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "@colyseus/core";
import cors from "cors";
import express from "express";
import http from "node:http";
import { ROOM_HUB, ROOM_WAITING, validateAllLayouts } from "@crazycauldron/shared";
import { authRouter } from "./auth/routes.js";
import { config } from "./config.js";
import { closeDatabase, databaseHealth } from "./db/index.js";
import { log } from "./logger.js";
import { snapshot } from "./metrics.js";
import { alert, closeLog, logFile } from "./monitoring.js";
import { startSchedules } from "./schedule.js";
import { capacity } from "./matchmaking/index.js";
import { matchmakeRouter } from "./matchmaking/routes.js";
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

const app = express();

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
  const origin = req.headers.origin;
  if (origin && !config.corsOrigins.includes(origin)) {
    log.warn("cors.refused", { origin, path: req.path });
    return res.status(403).json({
      error: "origin_not_allowed",
      message: "This server does not serve that origin.",
    });
  }
  return next();
});

app.use(cors({ origin: config.corsOrigins, credentials: false }));
app.use(express.json({ limit: "8kb" }));

/**
 * One endpoint that answers "is this thing alive and how hard is it working".
 *
 * Room and player counts, whether the database still answers a read, uptime,
 * and the process's own CPU, memory and simulation-tick timings. The load test
 * polls it; so does anything watching the deployment.
 */
app.get("/health", async (_req, res) => {
  const [rooms, db] = [await capacity(), databaseHealth()];
  const metrics = snapshot();
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    uptimeSeconds: metrics.uptimeSeconds,
    rooms,
    database: db,
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

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

gameServer.define(ROOM_HUB, HubRoom);
gameServer.define(ROOM_WAITING, WaitingRoom);

await gameServer.listen(config.port);
log.info("server.listening", {
  port: config.port,
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
