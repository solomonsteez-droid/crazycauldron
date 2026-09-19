import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrateGameTables } from "./gameRepo.js";
import type { PlayerRecord, PlayerRepository } from "./types.js";

export function openDatabase(file: string): Database.Database {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      wallet       TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players (last_seen_at);
  `);
  migrateGameTables(db);
}

interface Row {
  wallet: string;
  display_name: string;
  created_at: string;
  last_seen_at: string;
}

const toRecord = (row: Row): PlayerRecord => ({
  wallet: row.wallet,
  displayName: row.display_name,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
});

export class SqlitePlayerRepository implements PlayerRepository {
  private readonly selectStmt;
  private readonly insertStmt;
  private readonly touchStmt;

  constructor(private readonly db: Database.Database) {
    this.selectStmt = db.prepare<[string], Row>("SELECT * FROM players WHERE wallet = ?");
    this.insertStmt = db.prepare(
      `INSERT INTO players (wallet, display_name, created_at, last_seen_at)
       VALUES (@wallet, @displayName, @now, @now)
       ON CONFLICT(wallet) DO UPDATE SET last_seen_at = @now`,
    );
    this.touchStmt = db.prepare("UPDATE players SET last_seen_at = ? WHERE wallet = ?");
  }

  /*
   * These are synchronous underneath - better-sqlite3 has no other mode - and
   * declared async only so that both backends answer the same way. Nothing is
   * actually deferred; the promise resolves before the caller can look at it.
   */
  async findByWallet(wallet: string): Promise<PlayerRecord | null> {
    const row = this.selectStmt.get(wallet);
    return row ? toRecord(row) : null;
  }

  async upsertOnLogin(wallet: string, defaultDisplayName: string): Promise<PlayerRecord> {
    const now = new Date().toISOString();
    this.insertStmt.run({ wallet, displayName: defaultDisplayName, now });
    const row = this.selectStmt.get(wallet);
    if (!row) throw new Error(`Player row missing immediately after upsert: ${wallet}`);
    return toRecord(row);
  }

  async touchLastSeen(wallet: string): Promise<void> {
    this.touchStmt.run(new Date().toISOString(), wallet);
  }
}
