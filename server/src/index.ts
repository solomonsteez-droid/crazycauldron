import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "@colyseus/core";
import cors from "cors";
import express from "express";
import http from "node:http";
import { ROOM_HUB, ROOM_WAITING } from "@crazycauldron/shared";
import { authRouter } from "./auth/routes.js";
import { config } from "./config.js";
import { closeDatabase } from "./db/index.js";
import { log } from "./logger.js";
import { capacity } from "./matchmaking/index.js";
import { matchmakeRouter } from "./matchmaking/routes.js";
import { HubRoom } from "./rooms/HubRoom.js";
import { WaitingRoom } from "./rooms/WaitingRoom.js";

const app = express();

app.use(
  cors({
    // Explicit allowlist. Requests with no Origin (curl, health checks) pass;
    // a browser on an unlisted origin does not.
    origin: (origin, callback) =>
      !origin || config.corsOrigins.includes(origin)
        ? callback(null, true)
        : callback(new Error(`Origin ${origin} is not allowed.`)),
    credentials: false,
  }),
);
app.use(express.json({ limit: "8kb" }));

app.get("/health", async (_req, res) => {
  res.json({ ok: true, ...(await capacity()) });
});

app.use("/auth", authRouter);
app.use("/matchmake", matchmakeRouter);

// Last-resort handler: log the detail, tell the client nothing useful.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("http.unhandled", { message: err.message });
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
});

async function shutdown(signal: string) {
  log.info("server.shutdown", { signal });
  try {
    await gameServer.gracefullyShutdown(false);
  } catch (err) {
    log.error("server.shutdown_failed", { message: (err as Error).message });
  }
  closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
