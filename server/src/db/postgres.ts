/**
 * The same seven tables, in Postgres.
 *
 * Why there are two backends at all: Colyseus Cloud does not promise that a
 * container's filesystem survives a deploy, and a SQLite database is one file
 * on that filesystem. A deploy that silently resets every player's progress is
 * not a risk worth taking for the convenience of a file, so anywhere with a
 * DATABASE_URL runs on Postgres and a developer's machine keeps the file.
 *
 * The schema is deliberately the same shape as the SQLite one - same tables,
 * same columns, same names - so the two can be read against each other, and so
 * a backup taken from one is legible in the other.
 */

import pg from "pg";
import { SKILL_IDS, type Quality, type SkillId } from "@crazycauldron/shared";
import type {
  CodexRecord,
  GameRepository,
  GameStateRecord,
  LeaderboardEntry,
  PurchaseRecord,
  StackRecord,
} from "./gameTypes.js";
import type { PlayerRecord, PlayerRepository } from "./types.js";

const { Pool } = pg;

/*
 * Postgres hands back BIGINT and NUMERIC as strings, because they can exceed
 * what a double holds. Ours cannot - coins, XP and epoch milliseconds are all
 * comfortably inside 2^53 - and a string where the rest of the server expects
 * a number is the kind of bug that only shows up in arithmetic. So they are
 * parsed here, once, rather than at forty call sites.
 */
pg.types.setTypeParser(20, (value) => Number(value)); // int8
pg.types.setTypeParser(1700, (value) => Number(value)); // numeric

export type Pool = pg.Pool;

/**
 * Opens the pool and brings the schema up to date.
 *
 * `IF NOT EXISTS` throughout, run on every boot: the first deploy creates the
 * tables and every later one confirms they are there. That is enough migration
 * for a schema that has only ever grown, and when it stops being enough this
 * is the function that will need a version table.
 */
export async function openPostgres(url: string): Promise<pg.Pool> {
  const pool = new Pool({
    connectionString: url,
    // A managed Postgres almost always wants TLS and almost never presents a
    // certificate chain the client already trusts.
    ssl: url.includes("localhost") || url.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
    max: 10,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      wallet       TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players (last_seen_at);

    CREATE TABLE IF NOT EXISTS player_game (
      wallet          TEXT PRIMARY KEY REFERENCES players(wallet) ON DELETE CASCADE,
      coins           BIGINT NOT NULL DEFAULT 0,
      chef_xp         BIGINT NOT NULL DEFAULT 0,
      pan_tier        INTEGER NOT NULL DEFAULT 0,
      bag_tier        INTEGER NOT NULL DEFAULT 0,
      buff_expires_at BIGINT NOT NULL DEFAULT 0,
      hat_id          TEXT NOT NULL DEFAULT '',
      apron_id        TEXT NOT NULL DEFAULT 'cloak_01_wool',
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_skill_xp (
      wallet TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      skill  TEXT NOT NULL,
      xp     BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, skill)
    );

    CREATE TABLE IF NOT EXISTS player_inventory (
      wallet     TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      stack_key  TEXT NOT NULL,
      kind       TEXT NOT NULL,
      item_id    TEXT NOT NULL,
      quality    TEXT,
      qty        INTEGER NOT NULL,
      expires_at BIGINT,
      PRIMARY KEY (wallet, stack_key)
    );

    CREATE TABLE IF NOT EXISTS player_codex (
      wallet       TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      recipe_id    TEXT NOT NULL,
      best_quality TEXT NOT NULL,
      cooked_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, recipe_id)
    );

    CREATE TABLE IF NOT EXISTS player_sections (
      wallet      TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      section     INTEGER NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (wallet, section)
    );

    CREATE TABLE IF NOT EXISTS player_nodes (
      wallet   TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      node_id  TEXT NOT NULL,
      ready_at BIGINT NOT NULL,
      PRIMARY KEY (wallet, node_id)
    );

    CREATE TABLE IF NOT EXISTS player_wardrobe (
      wallet      TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      item_id     TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (wallet, item_id)
    );

    CREATE TABLE IF NOT EXISTS server_flags (
      name       TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shop_purchases (
      signature TEXT PRIMARY KEY,
      wallet    TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      item_id   TEXT NOT NULL,
      cook      BIGINT NOT NULL,
      at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shop_purchases_wallet ON shop_purchases (wallet);
    CREATE INDEX IF NOT EXISTS idx_player_game_chef ON player_game (chef_xp DESC);
  `);

  return pool;
}

function emptyXp(): Record<SkillId, number> {
  return { foraging: 0, prospecting: 0, knifework: 0, firecraft: 0, spicecraft: 0 };
}

export class PostgresPlayerRepository implements PlayerRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findByWallet(wallet: string): Promise<PlayerRecord | null> {
    const { rows } = await this.pool.query<{
      wallet: string;
      display_name: string;
      created_at: string;
      last_seen_at: string;
    }>("SELECT * FROM players WHERE wallet = $1", [wallet]);
    const row = rows[0];
    return row
      ? {
          wallet: row.wallet,
          displayName: row.display_name,
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
        }
      : null;
  }

  async upsertOnLogin(wallet: string, defaultDisplayName: string): Promise<PlayerRecord> {
    const now = new Date().toISOString();
    const { rows } = await this.pool.query<{
      wallet: string;
      display_name: string;
      created_at: string;
      last_seen_at: string;
    }>(
      `INSERT INTO players (wallet, display_name, created_at, last_seen_at)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (wallet) DO UPDATE SET last_seen_at = $3
       RETURNING *`,
      [wallet, defaultDisplayName, now],
    );
    const row = rows[0];
    if (!row) throw new Error(`Player row missing immediately after upsert: ${wallet}`);
    return {
      wallet: row.wallet,
      displayName: row.display_name,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  async touchLastSeen(wallet: string): Promise<void> {
    await this.pool.query("UPDATE players SET last_seen_at = $1 WHERE wallet = $2", [
      new Date().toISOString(),
      wallet,
    ]);
  }
}

export class PostgresGameRepository implements GameRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * One read per table, all down the same connection.
   *
   * Seven small indexed reads beat one join that would return the player's
   * whole inventory once per codex entry. They run in sequence on a single
   * checked-out connection rather than in parallel across seven, because this
   * runs on join: thirty people arriving at once would otherwise ask for two
   * hundred connections from a pool of ten, and queue behind each other for
   * the privilege.
   *
   * Inside one transaction, so the seven agree with each other - a player who
   * finishes cooking between two of them must not be read holding neither the
   * ingredients nor the dish.
   */
  async load(wallet: string): Promise<GameStateRecord> {
    const db = await this.pool.connect();
    let game, skills, stacks, codex, sections, nodes, wardrobe;
    try {
      await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      game = await db.query<{
        coins: number;
        chef_xp: number;
        pan_tier: number;
        bag_tier: number;
        buff_expires_at: number;
        hat_id: string;
        apron_id: string;
      }>(
        `SELECT coins, chef_xp, pan_tier, bag_tier, buff_expires_at, hat_id, apron_id
         FROM player_game WHERE wallet = $1`,
        [wallet],
      );
      skills = await db.query<{ skill: string; xp: number }>(
        "SELECT skill, xp FROM player_skill_xp WHERE wallet = $1",
        [wallet],
      );
      stacks = await db.query<{
        stack_key: string;
        kind: string;
        item_id: string;
        quality: string | null;
        qty: number;
        expires_at: number | null;
      }>(
        `SELECT stack_key, kind, item_id, quality, qty, expires_at
         FROM player_inventory WHERE wallet = $1`,
        [wallet],
      );
      codex = await db.query<{ recipe_id: string; best_quality: string; cooked_count: number }>(
        "SELECT recipe_id, best_quality, cooked_count FROM player_codex WHERE wallet = $1",
        [wallet],
      );
      sections = await db.query<{ section: number }>(
        "SELECT section FROM player_sections WHERE wallet = $1",
        [wallet],
      );
      nodes = await db.query<{ node_id: string; ready_at: number }>(
        "SELECT node_id, ready_at FROM player_nodes WHERE wallet = $1 AND ready_at > $2",
        [wallet, Date.now()],
      );
      wardrobe = await db.query<{ item_id: string }>(
        "SELECT item_id FROM player_wardrobe WHERE wallet = $1",
        [wallet],
      );
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }

    const skillXp = emptyXp();
    for (const row of skills.rows) {
      if ((SKILL_IDS as string[]).includes(row.skill)) skillXp[row.skill as SkillId] = row.xp;
    }

    const nodeReadyAt: Record<string, number> = {};
    for (const row of nodes.rows) nodeReadyAt[row.node_id] = row.ready_at;

    const row = game.rows[0];
    return {
      wallet,
      coins: row?.coins ?? 0,
      chefXp: row?.chef_xp ?? 0,
      skillXp,
      panTier: row?.pan_tier ?? 0,
      bagTier: row?.bag_tier ?? 0,
      buffExpiresAt: row?.buff_expires_at ?? 0,
      stacks: stacks.rows.map(
        (s): StackRecord => ({
          key: s.stack_key,
          kind: s.kind === "dish" ? "dish" : "ingredient",
          id: s.item_id,
          ...(s.quality ? { quality: s.quality as Quality } : {}),
          qty: s.qty,
          ...(s.expires_at ? { expiresAt: s.expires_at } : {}),
        }),
      ),
      codex: codex.rows.map(
        (c): CodexRecord => ({
          recipeId: c.recipe_id,
          bestQuality: c.best_quality as Quality,
          cookedCount: c.cooked_count,
        }),
      ),
      unlockedSections: sections.rows.map((s) => s.section),
      nodeReadyAt,
      unlockedItems: wardrobe.rows.map((r) => r.item_id),
      hatId: row?.hat_id ?? "",
      // See the note in gameRepo.ts: the column is named for the garment this
      // one replaced, and the name is not worth a table rewrite.
      cloakId: row?.apron_id ?? "cloak_01_wool",
    };
  }

  /**
   * One transaction, exactly as the SQLite side does it.
   *
   * A player who is cut off mid-save must never end up having spent the
   * ingredients without gaining the dish, so either all of this lands or none
   * of it does.
   */
  async save(state: GameStateRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO player_game
           (wallet, coins, chef_xp, pan_tier, bag_tier, buff_expires_at, hat_id, apron_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (wallet) DO UPDATE SET
           coins = $2, chef_xp = $3, pan_tier = $4, bag_tier = $5,
           buff_expires_at = $6, hat_id = $7, apron_id = $8, updated_at = $9`,
        [
          state.wallet,
          state.coins,
          state.chefXp,
          state.panTier,
          state.bagTier,
          state.buffExpiresAt,
          state.hatId,
          state.cloakId,
          now,
        ],
      );

      for (const item of state.unlockedItems) {
        await client.query(
          `INSERT INTO player_wardrobe (wallet, item_id, unlocked_at) VALUES ($1, $2, $3)
           ON CONFLICT (wallet, item_id) DO NOTHING`,
          [state.wallet, item, now],
        );
      }

      for (const skill of SKILL_IDS) {
        await client.query(
          `INSERT INTO player_skill_xp (wallet, skill, xp) VALUES ($1, $2, $3)
           ON CONFLICT (wallet, skill) DO UPDATE SET xp = EXCLUDED.xp`,
          [state.wallet, skill, state.skillXp[skill] ?? 0],
        );
      }

      // Inventory and node timers are rewritten wholesale: both are small, and
      // the copy in memory is the truth.
      await client.query("DELETE FROM player_inventory WHERE wallet = $1", [state.wallet]);
      for (const stack of state.stacks) {
        if (stack.qty <= 0) continue;
        await client.query(
          `INSERT INTO player_inventory (wallet, stack_key, kind, item_id, quality, qty, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            state.wallet,
            stack.key,
            stack.kind,
            stack.id,
            stack.quality ?? null,
            stack.qty,
            stack.expiresAt ?? null,
          ],
        );
      }

      for (const entry of state.codex) {
        await client.query(
          `INSERT INTO player_codex (wallet, recipe_id, best_quality, cooked_count)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (wallet, recipe_id) DO UPDATE SET
             best_quality = EXCLUDED.best_quality, cooked_count = EXCLUDED.cooked_count`,
          [state.wallet, entry.recipeId, entry.bestQuality, entry.cookedCount],
        );
      }

      for (const section of state.unlockedSections) {
        await client.query(
          `INSERT INTO player_sections (wallet, section, unlocked_at) VALUES ($1, $2, $3)
           ON CONFLICT (wallet, section) DO NOTHING`,
          [state.wallet, section, now],
        );
      }

      await client.query("DELETE FROM player_nodes WHERE wallet = $1", [state.wallet]);
      const epochNow = Date.now();
      for (const [nodeId, readyAt] of Object.entries(state.nodeReadyAt)) {
        if (readyAt > epochNow) {
          await client.query(
            "INSERT INTO player_nodes (wallet, node_id, ready_at) VALUES ($1, $2, $3)",
            [state.wallet, nodeId, readyAt],
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The insert is the check: a signature already in the table conflicts, the
   * insert reports nothing written, and the transaction grants nothing.
   */
  async claimPurchase(record: PurchaseRecord): Promise<{ granted: boolean }> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const inserted = await db.query(
        `INSERT INTO shop_purchases (signature, wallet, item_id, cook, at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (signature) DO NOTHING`,
        [record.signature, record.wallet, record.itemId, record.cook, record.at],
      );

      if (inserted.rowCount === 0) {
        await db.query("COMMIT");
        return { granted: false };
      }

      await db.query(
        `INSERT INTO player_wardrobe (wallet, item_id, unlocked_at) VALUES ($1, $2, $3)
         ON CONFLICT (wallet, item_id) DO NOTHING`,
        [record.wallet, record.itemId, record.at],
      );
      await db.query("COMMIT");
      return { granted: true };
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  }

  async purchasesOf(wallet: string): Promise<PurchaseRecord[]> {
    const { rows } = await this.pool.query<{
      signature: string;
      item_id: string;
      cook: number;
      at: string;
    }>(
      "SELECT signature, item_id, cook, at FROM shop_purchases WHERE wallet = $1 ORDER BY at DESC",
      [wallet],
    );
    return rows.map((r) => ({
      signature: r.signature,
      wallet,
      itemId: r.item_id,
      cook: Number(r.cook),
      at: r.at,
    }));
  }

  async readFlag(name: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ value: string }>(
      "SELECT value FROM server_flags WHERE name = $1",
      [name],
    );
    return rows[0]?.value ?? null;
  }

  async writeFlag(name: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO server_flags (name, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [name, value, new Date().toISOString()],
    );
  }

  async topByChefXp(limit: number): Promise<LeaderboardEntry[]> {
    const { rows } = await this.pool.query<{
      wallet: string;
      display_name: string;
      chef_xp: number;
    }>(
      `SELECT g.wallet, p.display_name, g.chef_xp
       FROM player_game g JOIN players p ON p.wallet = g.wallet
       WHERE g.chef_xp > 0
       ORDER BY g.chef_xp DESC, p.display_name ASC
       LIMIT $1`,
      [limit],
    );
    if (rows.length === 0) return [];

    // One extra read for the whole page rather than one per row.
    const wallets = rows.map((r) => r.wallet);
    const skills = await this.pool.query<{ wallet: string; skill: string; xp: number }>(
      "SELECT wallet, skill, xp FROM player_skill_xp WHERE wallet = ANY($1)",
      [wallets],
    );

    const byWallet = new Map<string, Record<SkillId, number>>();
    for (const wallet of wallets) byWallet.set(wallet, emptyXp());
    for (const row of skills.rows) {
      if (!(SKILL_IDS as string[]).includes(row.skill)) continue;
      const bucket = byWallet.get(row.wallet);
      if (bucket) bucket[row.skill as SkillId] = row.xp;
    }

    return rows.map((r) => ({
      wallet: r.wallet,
      displayName: r.display_name,
      chefXp: r.chef_xp,
      skillXp: byWallet.get(r.wallet) ?? emptyXp(),
    }));
  }
}
