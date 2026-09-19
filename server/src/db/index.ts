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
