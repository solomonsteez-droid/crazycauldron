import fs from "node:fs";
import { config } from "../config.js";
import { SqliteGameRepository } from "./gameRepo.js";
import { openDatabase, SqlitePlayerRepository } from "./sqlite.js";
import type { GameRepository } from "./gameTypes.js";
import type { PlayerRepository } from "./types.js";

export type { PlayerRecord, PlayerRepository } from "./types.js";
export type { GameRepository, GameStateRecord, StackRecord, CodexRecord } from "./gameTypes.js";

const db = openDatabase(config.databasePath);

/** Single process-wide instances; swap the implementations here for Postgres. */
export const players: PlayerRepository = new SqlitePlayerRepository(db);
export const gameStore: GameRepository = new SqliteGameRepository(db);

export function closeDatabase() {
  db.close();
}

/**
 * The open handle, for the one job that genuinely needs it.
 *
 * SQLite's backup API copies from a live connection, so the backup has to
 * reach past the repository interfaces. Nothing else should: the two
 * repositories are the only way game code touches the database.
 */
export function rawDatabase() {
  return db;
}

export interface DatabaseHealth {
  ok: boolean;
  file: string;
  players: number;
  sizeBytes: number;
  error?: string;
}

/**
 * Whether the database is answering, not merely whether the file is there.
 *
 * A read, because an open handle to a corrupt or locked file looks perfectly
 * healthy until something tries to use it - which on a health check is the
 * whole point.
 */
export function databaseHealth(): DatabaseHealth {
  const file = config.databasePath;
  try {
    const row = db.prepare("SELECT count(*) AS n FROM players").get() as { n: number };
    const sizeBytes = file === ":memory:" ? 0 : (fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0);
    return { ok: true, file, players: row.n, sizeBytes };
  } catch (err) {
    return { ok: false, file, players: 0, sizeBytes: 0, error: (err as Error).message };
  }
}
