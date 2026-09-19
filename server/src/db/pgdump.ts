/**
 * Backing up Postgres without pg_dump.
 *
 * pg_dump is the right tool and it is not available: Colyseus Cloud runs a
 * Node image, and the nightly backup has to work from inside the server
 * process. So a backup is a logical dump - every row of every table, as JSON,
 * gzipped - which has three properties that matter more than being clever. It
 * needs no binary, it is readable by anything, and it restores into an empty
 * database of either backend, because it is just rows.
 *
 * It is not a point-in-time snapshot. Tables are read one after another inside
 * a single repeatable-read transaction, which is what makes them consistent
 * with each other; without that, a player who finished cooking between two
 * SELECTs could be dumped holding neither the ingredients nor the dish.
 */

import type pg from "pg";
import fs from "node:fs";
import { createGzip, gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/**
 * Every table, in an order a restore can replay.
 *
 * `players` first: every other table has a foreign key into it, so inserting
 * a progress row before its player exists would be rejected.
 */
export const TABLES = [
  "players",
  "player_game",
  "player_skill_xp",
  "player_inventory",
  "player_codex",
  "player_sections",
  "player_nodes",
  "player_wardrobe",
  "shop_purchases",
  "server_flags",
] as const;

export interface Dump {
  /** Bumped only if the shape of this file changes, not when a column does. */
  version: 1;
  backend: "postgres";
  at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/** The suffix that says a backup is a logical dump rather than a SQLite file. */
export const DUMP_SUFFIX = ".json.gz";

export async function dumpPostgres(pool: pg.Pool, file: string): Promise<{ rows: number }> {
  const client = await pool.connect();
  const tables: Record<string, Record<string, unknown>[]> = {};
  let rows = 0;
  try {
    // Repeatable read: every table is read as of the same moment, so the dump
    // is internally consistent even though it takes several queries.
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const table of TABLES) {
      const result = await client.query(`SELECT * FROM ${table}`);
      tables[table] = result.rows as Record<string, unknown>[];
      rows += result.rows.length;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const dump: Dump = { version: 1, backend: "postgres", at: new Date().toISOString(), tables };
  await pipeline(
    Readable.from([JSON.stringify(dump)]),
    createGzip({ level: 9 }),
    fs.createWriteStream(file),
  );
  return { rows };
}

/** Reads a dump back into memory, checking it is one. */
export function readDump(file: string): Dump {
  const parsed = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) as Dump;
  if (parsed.version !== 1 || typeof parsed.tables !== "object") {
    throw new Error(`${file} is not a CrazyCauldron dump`);
  }
  return parsed;
}

/**
 * Replaces the contents of the database with a dump.
 *
 * All of it or none of it: a restore that half-applied would leave progress
 * rows pointing at players who are no longer there. Foreign keys are deferred
 * for the duration so the tables can go back in any order without tripping
 * over each other.
 */
export async function restorePostgres(
  pool: pg.Pool,
  dump: Dump,
): Promise<{ rows: number; tables: number }> {
  const client = await pool.connect();
  let rows = 0;
  let tables = 0;
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    // Reverse order, so children go before the parent they reference.
    for (const table of [...TABLES].reverse()) {
      await client.query(`DELETE FROM ${table}`);
    }

    for (const table of TABLES) {
      const list = dump.tables[table] ?? [];
      if (list.length === 0) continue;
      tables += 1;

      const columns = Object.keys(list[0]!);
      const quoted = columns.map((c) => `"${c}"`).join(", ");
      for (const row of list) {
        const values = columns.map((c) => row[c] ?? null);
        const params = columns.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(`INSERT INTO ${table} (${quoted}) VALUES (${params})`, values);
        rows += 1;
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { rows, tables };
}
