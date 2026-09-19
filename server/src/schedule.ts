/**
 * The things the server does to itself on a timer.
 *
 * A nightly backup, and a health probe often enough to notice a database that
 * has gone away before a player does. Both raise an alert when they fail,
 * which is the only reason either is in the server process rather than in a
 * crontab: a backup that silently stopped running three weeks ago is worse
 * than no backup, because it is believed.
 */

import cron from "node-cron";
import { config } from "./config.js";
import { databaseHealth, rawDatabase } from "./db/index.js";
import { takeBackup } from "./db/backup.js";
import { log } from "./logger.js";
import { capacity } from "./matchmaking/index.js";
import { alert } from "./monitoring.js";

/** 4am server time, every day. Overridable for deployments in other places. */
const BACKUP_CRON = process.env.BACKUP_CRON ?? "0 4 * * *";
/** How often to check the server's own health, in ms. */
const HEALTH_INTERVAL_MS = Number(process.env.HEALTH_CHECK_MS ?? 60_000);

export interface Scheduled {
  stop(): void;
}

export async function runBackupNow(reason: string): Promise<boolean> {
  try {
    const result = await takeBackup(rawDatabase());
    log.info("backup.done", {
      reason,
      file: result.file,
      bytes: result.bytes,
      ms: result.ms,
      copiedTo: result.copiedTo,
      pruned: result.pruned.length,
    });
    return true;
  } catch (err) {
    log.error("backup.failed", { reason, message: (err as Error).message });
    await alert({
      kind: "backup_failed",
      message: "The scheduled database backup failed.",
      detail: { reason, error: (err as Error).message },
    });
    return false;
  }
}

/**
 * Starts the nightly backup and the health probe.
 *
 * Returns a handle so a test - or a shutdown - can stop them; timers that
 * outlive the thing they belong to are how a process ends up refusing to exit.
 */
export function startSchedules(): Scheduled {
  const task = cron.schedule(BACKUP_CRON, () => {
    void runBackupNow("nightly");
  });
  log.info("schedule.backup", { cron: BACKUP_CRON });

  let lastHealthy = true;
  const health = setInterval(() => {
    void (async () => {
      const db = databaseHealth();
      if (!db.ok) {
        log.error("health.failed", { database: db.error });
        await alert({
          kind: "health_failed",
          message: "The health check failed: the database is not answering.",
          detail: { error: db.error, file: db.file },
        });
        lastHealthy = false;
        return;
      }

      if (!lastHealthy) {
        log.info("health.recovered", {});
        lastHealthy = true;
      }

      // Counted rather than alerted on: a full server is a good problem, and
      // the number is worth having in the log when someone goes looking.
      const rooms = await capacity();
      if (rooms.full) log.warn("health.at_capacity", { hubPlayers: rooms.hubPlayers });
    })();
  }, HEALTH_INTERVAL_MS);
  health.unref();

  log.info("schedule.health", { everyMs: HEALTH_INTERVAL_MS, env: config.nodeEnv });

  return {
    stop() {
      void task.stop();
      clearInterval(health);
    },
  };
}
