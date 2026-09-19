/**
 * Put a backup back.
 *
 *   npx tsx scripts/restore.ts --latest
 *   npx tsx scripts/restore.ts backups/crazycauldron-2026-09-19T04-00-00-000Z.db
 *
 * Works on either backend, and tells them apart by the file: a .db is a SQLite
 * database and is copied into place; a .json.gz is a logical dump and is
 * replayed into Postgres inside one transaction.
 *
 * Stop the server first. This refuses to run while something is listening on
 * the configured port, because restoring underneath a live process gives you a
 * database the server has an open handle to and stale pages in memory - which
 * looks like it worked right up until it does not.
 *
 * The database being replaced is itself copied aside first. A restore is the
 * moment you are most likely to discover you wanted the other one.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import pg from "pg";
import { DUMP_SUFFIX, readDump, restorePostgres } from "../server/src/db/pgdump.js";
import net from "node:net";
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
const port = Number(process.env.PORT ?? 2567);
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/** Whether anything is listening, so a restore cannot happen under a live server. */
function portInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(700);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const no = () => {
      socket.destroy();
      resolve(false);
    };
    socket.on("error", no);
    socket.on("timeout", no);
  });
}

function latestBackup(): string | null {
  if (!fs.existsSync(directory)) return null;
  const files = fs
    .readdirSync(directory)
    .filter(
      (name) =>
        name.startsWith("crazycauldron-") &&
        (name.endsWith(".db") || name.endsWith(DUMP_SUFFIX)),
    )
    .sort();
  const newest = files[files.length - 1];
  return newest ? path.join(directory, newest) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const source = args.includes("--latest")
    ? latestBackup()
    : (args.find((a) => !a.startsWith("--")) ?? null);

  if (!source) {
    console.error("Nothing to restore. Pass a file, or --latest.");
    console.error(`Backups live in ${directory}`);
    process.exit(1);
  }

  const file = path.isAbsolute(source) ? source : path.join(ROOT, source);
  if (!fs.existsSync(file)) {
    console.error(`No such backup: ${file}`);
    process.exit(1);
  }

  if (await portInUse()) {
    console.error(
      `Something is listening on port ${port}. Stop the server before restoring - ` +
        "replacing the file underneath a running process does not do what it looks like it does.",
    );
    process.exit(1);
  }

  /*
   * A dump goes back into Postgres, not onto the disk. The file decides, not
   * the environment: restoring a SQLite file into Postgres or the other way
   * round is a mistake worth refusing outright.
   */
  if (file.endsWith(DUMP_SUFFIX)) {
    if (!databaseUrl) {
      console.error(
        `${path.basename(file)} is a Postgres dump, but DATABASE_URL is not set. ` +
          "Point it at the database to restore into.",
      );
      process.exit(1);
    }

    const dump = readDump(file);
    const counted = Object.values(dump.tables).reduce((n, rows) => n + rows.length, 0);
    console.log(`restoring ${file}`);
    console.log(`   taken ${dump.at}, ${counted} row(s)`);

    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl:
        databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
          ? undefined
          : { rejectUnauthorized: false },
    });
    try {
      const result = await restorePostgres(pool, dump);
      console.log(`   restored ${result.rows} row(s) across ${result.tables} table(s)`);
    } finally {
      await pool.end();
    }

    console.log("\nrestore: done. Start the server.");
    return;
  }

  if (databaseUrl) {
    console.error(
      `${path.basename(file)} is a SQLite backup, but DATABASE_URL is set. ` +
        "This server runs on Postgres; restore a .json.gz dump instead.",
    );
    process.exit(1);
  }

  // Refuse a backup that does not open. Better to find out now than after the
  // live database has been moved aside.
  const check = new Database(file, { readonly: true });
  let players = 0;
  try {
    players = (check.prepare("SELECT count(*) AS n FROM players").get() as { n: number }).n;
    check.prepare("PRAGMA quick_check").get();
  } finally {
    check.close();
  }

  console.log(`restoring ${file}`);
  console.log(`   ${mb(fs.statSync(file).size)}, ${players} player(s)`);

  if (fs.existsSync(databasePath)) {
    const aside = `${databasePath}.replaced-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(databasePath, aside);
    console.log(`   the database being replaced was copied to ${aside}`);
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(file, databasePath);

  /*
   * The old write-ahead log and shared-memory files belong to the database
   * that was just replaced. Left in place, SQLite would try to apply them on
   * top of the restored file.
   */
  for (const suffix of ["-wal", "-shm"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }

  const restored = new Database(databasePath, { readonly: true });
  try {
    const row = restored.prepare("SELECT count(*) AS n FROM players").get() as { n: number };
    console.log(`   restored to ${databasePath}: ${row.n} player(s)`);
  } finally {
    restored.close();
  }

  console.log("\nrestore: done. Start the server.");
}

await main();
