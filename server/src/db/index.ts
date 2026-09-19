import { config } from "../config.js";
import { openDatabase, SqlitePlayerRepository } from "./sqlite.js";
import type { PlayerRepository } from "./types.js";

export type { PlayerRecord, PlayerRepository } from "./types.js";

const db = openDatabase(config.databasePath);

/** Single process-wide instance; swap the implementation here for Postgres. */
export const players: PlayerRepository = new SqlitePlayerRepository(db);

export function closeDatabase() {
  db.close();
}
