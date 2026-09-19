/**
 * Copying the database while it is being written to.
 *
 * A plain file copy of an open SQLite database is a gamble: in WAL mode the
 * newest committed transactions live in the -wal file, so copying only the .db
 * can hand back a backup that is missing the last few minutes, and copying all
 * three mid-checkpoint can hand back one that is torn. SQLite's own backup API
 * takes a consistent snapshot of a live database, which is what better-sqlite3
 * exposes as db.backup(), so that is what this uses.
 *
 * Backups are written under ./backups as crazycauldron-<ISO timestamp>.db, and
 * mirrored to BACKUP_DEST when that is set. Old ones are pruned by count
 * rather than by age: a server that was down for a week should still have the
 * last seven backups it managed to take.
 */

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { config } from "../config.js";
import { log } from "../logger.js";

/** How many timestamped copies to keep in the local directory. */
export const KEEP_BACKUPS = 14;

export interface BackupResult {
  file: string;
  bytes: number;
  ms: number;
  copiedTo: string | null;
  pruned: string[];
}

/** A file name that sorts chronologically and is legal on every filesystem. */
export function backupName(at = new Date()): string {
  return `crazycauldron-${at.toISOString().replace(/[:.]/g, "-")}.db`;
}

export function backupDirectory(): string {
  return process.env.BACKUP_DIR ?? path.join(path.dirname(config.databasePath), "..", "backups");
}

/**
 * Takes one backup. Returns where it went and how big it was.
 *
 * `db.backup()` is asynchronous and copies in pages, so the server keeps
 * serving while it runs - which matters at 4am only in the sense that it means
 * nobody has to schedule downtime for it.
 */
export async function takeBackup(db: Database.Database): Promise<BackupResult> {
  const startedAt = Date.now();
  const directory = path.resolve(backupDirectory());
  fs.mkdirSync(directory, { recursive: true });

  const file = path.join(directory, backupName());
  await db.backup(file);

  const bytes = fs.statSync(file).size;

  /*
   * The backup API may leave a -wal and a -shm beside the copy. They belong to
   * the connection that wrote it, not to the backup, and a self-contained file
   * is the whole point of taking one.
   */
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${file}${suffix}`, { force: true });

  let copiedTo: string | null = null;
  const destination = process.env.BACKUP_DEST;
  if (destination) {
    try {
      fs.mkdirSync(destination, { recursive: true });
      copiedTo = path.join(destination, path.basename(file));
      fs.copyFileSync(file, copiedTo);
    } catch (err) {
      // A missing or unwritable destination must not lose the local copy.
      log.error("backup.destination_failed", {
        destination,
        message: (err as Error).message,
      });
      copiedTo = null;
    }
  }

  const pruned = prune(directory);
  return { file, bytes, ms: Date.now() - startedAt, copiedTo, pruned };
}

/** Keeps the newest KEEP_BACKUPS files and deletes the rest. */
export function prune(directory: string, keep = KEEP_BACKUPS): string[] {
  if (!fs.existsSync(directory)) return [];

  const files = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith("crazycauldron-") && name.endsWith(".db"))
    .sort();

  const doomed = files.slice(0, Math.max(0, files.length - keep));
  for (const name of doomed) {
    try {
      fs.unlinkSync(path.join(directory, name));
    } catch {
      // A file that cannot be removed is not worth failing a backup over.
    }
  }
  return doomed;
}

/** The backups on disk, newest first. */
export function listBackups(directory = backupDirectory()): { file: string; bytes: number; at: string }[] {
  const resolved = path.resolve(directory);
  if (!fs.existsSync(resolved)) return [];

  return fs
    .readdirSync(resolved)
    .filter((name) => name.startsWith("crazycauldron-") && name.endsWith(".db"))
    .sort()
    .reverse()
    .map((name) => {
      const file = path.join(resolved, name);
      return {
        file,
        bytes: fs.statSync(file).size,
        at: name.replace("crazycauldron-", "").replace(/\.db$/, ""),
      };
    });
}
