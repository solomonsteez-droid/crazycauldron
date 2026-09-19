/**
 * Take a backup of the live database, by hand.
 *
 *   npx tsx scripts/backup.ts            take one now
 *   npx tsx scripts/backup.ts --list     show what is already there
 *
 * The server takes one every night on its own; this is for the times you want
 * one before doing something you are not sure about. Both go through the same
 * code, so a hand-made backup and a scheduled one are the same thing.
 *
 * Safe to run against a server that is up: SQLite's backup API copies a live
 * database consistently, page by page, rather than snatching the file.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
loadEnv({ path: path.join(ROOT, ".env") });

const databasePath = (() => {
  const raw = process.env.DATABASE_PATH ?? "./data/crazycauldron.db";
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
})();

const directory = path.resolve(
  process.env.BACKUP_DIR ?? path.join(path.dirname(databasePath), "..", "backups"),
);

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function list(): void {
  if (!fs.existsSync(directory)) {
    console.log(`no backups yet (${directory} does not exist)`);
    return;
  }
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith("crazycauldron-") && name.endsWith(".db"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log(`no backups in ${directory}`);
    return;
  }

  console.log(`${files.length} backup(s) in ${directory}, newest first:\n`);
  let total = 0;
  for (const name of files) {
    const bytes = fs.statSync(path.join(directory, name)).size;
    total += bytes;
    console.log(`  ${name}  ${mb(bytes)}`);
  }
  console.log(`\n  total ${mb(total)}`);
}

async function take(): Promise<void> {
  if (!fs.existsSync(databasePath)) {
    console.error(`No database at ${databasePath} - nothing to back up.`);
    process.exit(1);
  }

  fs.mkdirSync(directory, { recursive: true });
  const name = `crazycauldron-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  const file = path.join(directory, name);

  const startedAt = Date.now();
  // Read-only: this must never be the thing that corrupts what it is copying.
  const db = new Database(databasePath, { readonly: true });
  try {
    await db.backup(file);
  } finally {
    db.close();
  }

  const bytes = fs.statSync(file).size;
  console.log(`backed up ${databasePath}`);
  console.log(`        -> ${file}`);
  console.log(`   ${mb(bytes)} in ${Date.now() - startedAt}ms`);

  const destination = process.env.BACKUP_DEST;
  if (destination) {
    fs.mkdirSync(destination, { recursive: true });
    const copy = path.join(destination, name);
    fs.copyFileSync(file, copy);
    console.log(`        -> ${copy} (BACKUP_DEST)`);
  }

  // Sanity: a backup nobody can open is not a backup.
  const check = new Database(file, { readonly: true });
  try {
    const row = check.prepare("SELECT count(*) AS n FROM players").get() as { n: number };
    console.log(`   verified: opens cleanly, ${row.n} player(s)`);
  } finally {
    check.close();
  }

  /*
   * Opening it created a -wal and a -shm beside it. They belong to that open
   * handle, not to the backup, and leaving them next to a copy that is
   * supposed to be self-contained is how somebody later restores a database
   * with a journal from a different moment attached to it.
   */
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${file}${suffix}`, { force: true });
}

if (process.argv.includes("--list")) list();
else await take();
