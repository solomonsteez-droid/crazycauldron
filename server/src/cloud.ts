/**
 * What changes when this process is running on Colyseus Cloud.
 *
 * Cloud starts one process per CPU core behind a single address. Each process
 * holds its own rooms, so anything that needs to see the whole world - the
 * player count on /health, the decision to queue somebody, a seat reservation
 * made on one process and redeemed on another - has to go through something
 * shared. That is Redis, and Cloud hands the URL over in REDIS_URI.
 *
 * On one core, or anywhere REDIS_URI is absent, none of this applies: a single
 * process already sees everything, and the in-memory driver is both faster and
 * one fewer thing to fail.
 */

import { logger } from "@colyseus/core";
import type { ServerOptions } from "@colyseus/core";
import os from "node:os";

/** True when this process was started by Colyseus Cloud. */
export const onColyseusCloud = process.env.COLYSEUS_CLOUD !== undefined;

/**
 * Driver, presence and public address for a multi-process deployment.
 *
 * Returns an empty object - the single-process defaults - unless there is a
 * reason to do otherwise. The Redis packages ship inside `colyseus` and are
 * imported here rather than at the top of the file so that a local run never
 * loads a Redis client it has no use for.
 */
export async function cloudOptions(): Promise<
  Pick<ServerOptions, "driver" | "presence" | "publicAddress">
> {
  const multiProcess = os.cpus().length > 1 || process.env.REDIS_URI !== undefined;
  if (!onColyseusCloud || !multiProcess) return {};

  try {
    const [{ RedisDriver }, { RedisPresence }] = await Promise.all([
      import("@colyseus/redis-driver"),
      import("@colyseus/redis-presence"),
    ]);

    /*
     * The port here is the one this process will bind, which Cloud derives
     * from NODE_APP_INSTANCE. It is part of the advertised address because
     * every process is reachable at the same host and differs only by port.
     */
    const port = 2567 + Number(process.env.NODE_APP_INSTANCE ?? "0");
    return {
      driver: new RedisDriver(process.env.REDIS_URI),
      presence: new RedisPresence(process.env.REDIS_URI),
      publicAddress: `${process.env.SUBDOMAIN}.${process.env.SERVER_NAME}/${port}`,
    };
  } catch (err) {
    /*
     * Falling back is the wrong answer loudly rather than the wrong answer
     * quietly: without Redis each process is its own island, and players who
     * land on different ones cannot see each other.
     */
    logger.error("Colyseus Cloud: Redis driver unavailable, running single-process.");
    logger.error(String(err));
    return {};
  }
}
