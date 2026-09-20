/**
 * Which database this process is talking to, and the two handles everything
 * else uses to reach it.
 *
 * There are two backends. A developer's machine runs on a SQLite file, which
 * needs no server, no credentials and no setup. A deployment runs on Postgres,
 * because Colyseus Cloud makes no promise that a container's filesystem
 * survives a deploy - and a SQLite database is a file on that filesystem. The
 * failure mode is not a crash; it is every player quietly starting again,
 * discovered after the deploy rather than during it.
 *
 * DATABASE_URL decides, and nothing else does.
 */

import fs from "node:fs";
import type Database from "better-sqlite3";
import type pg from "pg";
import { config } from "../config.js";
import { log } from "../logger.js";
import { SqliteGameRepository } from "./gameRepo.js";
import { openDatabase, SqlitePlayerRepository } from "./sqlite.js";
import type { GameRepository } from "./gameTypes.js";
import type { PlayerRepository } from "./types.js";

export type { PlayerRecord, PlayerRepository } from "./types.js";
export type { GameRepository, GameStateRecord, StackRecord, CodexRecord } from "./gameTypes.js";

export type Backend = "sqlite" | "postgres";

/** Which one is in use. Reported by /health, so an operator never has to guess. */
export const backend: Backend = config.databaseUrl ? "postgres" : "sqlite";

/**
 * Where the data is, for the boot log and nowhere else.
 *
 * Deliberately not exported. A connection string names a host and a user even
 * with its password taken out, and the only place that is reasonable is this
 * process's own stdout - never an HTTP response, never a webhook. /health says
 * which backend and whether it answers, which is what a health check is for.
 */
const databaseLocation: string = config.databaseUrl
  ? redact(config.databaseUrl)
  : config.databasePath;

/** A connection string with its password removed. Safe to log; not to serve. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "postgres";
  }
}

let sqlite: Database.Database | null = null;
let pool: pg.Pool | null = null;

let playerRepo: PlayerRepository;
let gameRepo: GameRepository;

if (backend === "postgres") {
  // Imported here rather than at the top so a SQLite-only run never loads the
  // Postgres driver at all.
  const { openPostgres, PostgresGameRepository, PostgresPlayerRepository } = await import(
    "./postgres.js"
  );
  pool = await openPostgres(config.databaseUrl);
  playerRepo = new PostgresPlayerRepository(pool);
  gameRepo = new PostgresGameRepository(pool);
} else {
  sqlite = openDatabase(config.databasePath);
  playerRepo = new SqlitePlayerRepository(sqlite);
  gameRepo = new SqliteGameRepository(sqlite);
}

log.info("db.open", { backend, location: databaseLocation });

export const players: PlayerRepository = playerRepo;
export const gameStore: GameRepository = gameRepo;

export async function closeDatabase(): Promise<void> {
  sqlite?.close();
  await pool?.end();
}

/**
 * The open SQLite handle, for the one job that genuinely needs it.
 *
 * SQLite's backup API copies from a live connection, so the backup has to
 * reach past the repository interfaces. Null on Postgres, where backups are
 * taken a different way entirely.
 */
export function rawDatabase(): Database.Database | null {
  return sqlite;
}

/** The connection pool, for the Postgres backup. Null on SQLite. */
export function rawPool(): pg.Pool | null {
  return pool;
}

export interface DatabaseHealth {
  ok: boolean;
  backend: Backend;
  players: number;
  /** Zero on Postgres, where the size is the server's business and not ours. */
  sizeBytes: number;
  /**
   * Why it is not answering. For logs only.
   *
   * A driver error frequently quotes the host it failed to reach, so this must
   * not be published - see the note where /health builds its response.
   */
  error?: string;
}

/**
 * Whether the database is answering, not merely whether it is configured.
 *
 * A read, because an open handle to a corrupt file - or a pool pointed at a
 * database that has gone away - looks perfectly healthy until something tries
 * to use it, which on a health check is the whole point.
 */
export async function databaseHealth(): Promise<DatabaseHealth> {
  const base = { backend };
  try {
    if (pool) {
      const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM players");
      return { ...base, ok: true, players: rows[0]?.n ?? 0, sizeBytes: 0 };
    }

    const row = sqlite!.prepare("SELECT count(*) AS n FROM players").get() as { n: number };
    const sizeBytes =
      config.databasePath === ":memory:"
        ? 0
        : (fs.statSync(config.databasePath, { throwIfNoEntry: false })?.size ?? 0);
    return { ...base, ok: true, players: row.n, sizeBytes };
  } catch (err) {
    return { ...base, ok: false, players: 0, sizeBytes: 0, error: (err as Error).message };
  }
}
