/**
 * A database that already exists gets the new columns.
 *
 *   npx tsx scripts/test-migration.ts
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there,
 * so a column added after the first deploy reaches a fresh database and never
 * reaches anybody's. That failure is quiet: the server starts, the queries
 * name a column that is not there, and the first player to log in is the one
 * who finds out.
 *
 * So this builds a database in the old shape, with a player in it, opens it
 * through the real migration, and checks that the column arrived and the
 * player did not go anywhere.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/src/db/sqlite.js";
import { SqliteGameRepository } from "../server/src/db/gameRepo.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const FILE = path.join(ROOT, "data", "migration-test.db");

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** The schema as it stood before companions, written out by hand. */
function buildOldDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${FILE}${suffix}`, { force: true });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });

  const db = new Database(FILE);
  db.exec(`
    CREATE TABLE players (
      wallet       TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE player_game (
      wallet          TEXT PRIMARY KEY REFERENCES players(wallet) ON DELETE CASCADE,
      coins           INTEGER NOT NULL DEFAULT 0,
      chef_xp         INTEGER NOT NULL DEFAULT 0,
      pan_tier        INTEGER NOT NULL DEFAULT 0,
      bag_tier        INTEGER NOT NULL DEFAULT 0,
      buff_expires_at INTEGER NOT NULL DEFAULT 0,
      hat_id          TEXT NOT NULL DEFAULT '',
      apron_id        TEXT NOT NULL DEFAULT 'cloak_01_wool',
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE player_wardrobe (
      wallet      TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      item_id     TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (wallet, item_id)
    );
  `);

  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO players (wallet, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
  ).run("OldChef", "Old Chef", now, now);
  db.prepare(
    `INSERT INTO player_game (wallet, coins, chef_xp, hat_id, apron_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("OldChef", 4321, 9876, "hat_01_chef", "cloak_03_berry", now);
  db.prepare(
    "INSERT INTO player_wardrobe (wallet, item_id, unlocked_at) VALUES (?, ?, ?)",
  ).run("OldChef", "hat_01_chef", now);
  db.close();
}

async function main(): Promise<void> {
  console.log("test-migration\n");
  console.log("-- a database from before companions existed --");
  buildOldDatabase();

  const before = new Database(FILE, { readonly: true });
  const oldColumns = (before.prepare("PRAGMA table_info(player_game)").all() as { name: string }[])
    .map((c) => c.name);
  before.close();
  check("it has no companion column", !oldColumns.includes("companion_id"));
  check("and it has a player in it", oldColumns.includes("hat_id"));

  console.log("\n-- opened by the current server --");
  const db = openDatabase(FILE);
  try {
    const columns = (db.prepare("PRAGMA table_info(player_game)").all() as { name: string }[])
      .map((c) => c.name);
    check("the companion column was added", columns.includes("companion_id"), columns.join(", "));

    const repo = new SqliteGameRepository(db);
    const state = await repo.load("OldChef");

    check("the coins survived", state.coins === 4321, String(state.coins));
    check("the XP survived", state.chefXp === 9876, String(state.chefXp));
    check("the hat survived", state.hatId === "hat_01_chef", state.hatId);
    check("the earned wardrobe survived", state.unlockedItems.includes("hat_01_chef"));
    check("the dormant cloak was kept, not dropped", state.cloakId === "cloak_03_berry", state.cloakId);
    check("and the new slot reads as empty", state.companionId === "", `"${state.companionId}"`);

    console.log("\n-- and it round-trips --");
    await repo.save({ ...state, companionId: "companion_01_hen" });
    const again = await repo.load("OldChef");
    check("a companion can now be saved", again.companionId === "companion_01_hen");
    check("without disturbing anything else", again.coins === 4321 && again.hatId === "hat_01_chef");

    /*
     * Opening it a second time must not try to add the column again. SQLite
     * would refuse a duplicate, and a migration that throws on the second boot
     * is a server that starts exactly once.
     */
    console.log("\n-- and opening it again is safe --");
    db.close();
    const reopened = openDatabase(FILE);
    const reloaded = await new SqliteGameRepository(reopened).load("OldChef");
    check("a second open does not throw", true);
    check("and the data is still there", reloaded.companionId === "companion_01_hen");
    reopened.close();
  } finally {
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${FILE}${suffix}`, { force: true });
  }

  console.log(`\ntest-migration: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

await main();
