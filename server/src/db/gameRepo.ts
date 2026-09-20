import type Database from "better-sqlite3";
import { SKILL_IDS, type Quality, type SkillId } from "@crazycauldron/shared";
import type {
  CodexRecord,
  GameRepository,
  GameStateRecord,
  LeaderboardEntry,
  PublicTally,
  PurchaseRecord,
  StackRecord,
} from "./gameTypes.js";

/**
 * Progress is spread across five small tables rather than one JSON blob, so the
 * leaderboard can be a plain indexed query and a future migration can touch one
 * concern at a time.
 *
 * Every save is a single transaction: a player who logs out mid-cook can lose
 * the action, but never end up with the ingredients spent and the dish missing.
 */
export function migrateGameTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_game (
      wallet          TEXT PRIMARY KEY REFERENCES players(wallet) ON DELETE CASCADE,
      coins           INTEGER NOT NULL DEFAULT 0,
      chef_xp         INTEGER NOT NULL DEFAULT 0,
      pan_tier        INTEGER NOT NULL DEFAULT 0,
      bag_tier        INTEGER NOT NULL DEFAULT 0,
      buff_expires_at INTEGER NOT NULL DEFAULT 0,
      hat_id          TEXT NOT NULL DEFAULT '',
      companion_id    TEXT NOT NULL DEFAULT '',
      apron_id        TEXT NOT NULL DEFAULT 'cloak_01_wool',
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_skill_xp (
      wallet TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      skill  TEXT NOT NULL,
      xp     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, skill)
    );

    CREATE TABLE IF NOT EXISTS player_inventory (
      wallet     TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      stack_key  TEXT NOT NULL,
      kind       TEXT NOT NULL,
      item_id    TEXT NOT NULL,
      quality    TEXT,
      qty        INTEGER NOT NULL,
      expires_at INTEGER,
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
      ready_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, node_id)
    );

    CREATE TABLE IF NOT EXISTS player_wardrobe (
      wallet      TEXT NOT NULL REFERENCES players(wallet) ON DELETE CASCADE,
      item_id     TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      PRIMARY KEY (wallet, item_id)
    );

    CREATE TABLE IF NOT EXISTS cook_tally (
      day     TEXT PRIMARY KEY,
      superbs INTEGER NOT NULL DEFAULT 0
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
      cook      INTEGER NOT NULL,
      at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shop_purchases_wallet ON shop_purchases (wallet);
    CREATE INDEX IF NOT EXISTS idx_player_game_chef ON player_game (chef_xp DESC);
  `);

  addColumn(db, "player_game", "companion_id", "TEXT NOT NULL DEFAULT ''");
}

/**
 * Adds a column to a table that already exists.
 *
 * CREATE TABLE IF NOT EXISTS does nothing to a table that is already there, so
 * a new column reaches a fresh database and never reaches anybody's. SQLite
 * has no ADD COLUMN IF NOT EXISTS, so the columns are read first and the
 * statement is only run when it is needed.
 */
function addColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

interface GameRow {
  coins: number;
  chef_xp: number;
  pan_tier: number;
  bag_tier: number;
  buff_expires_at: number;
  hat_id: string;
  companion_id: string;
  apron_id: string;
}
interface WardrobeRow {
  item_id: string;
}
interface SkillRow {
  skill: string;
  xp: number;
}
interface StackRow {
  stack_key: string;
  kind: string;
  item_id: string;
  quality: string | null;
  qty: number;
  expires_at: number | null;
}
interface CodexRow {
  recipe_id: string;
  best_quality: string;
  cooked_count: number;
}
interface SectionRow {
  section: number;
}
interface NodeRow {
  node_id: string;
  ready_at: number;
}
interface LeaderRow {
  wallet: string;
  display_name: string;
  chef_xp: number;
}

function emptyXp(): Record<SkillId, number> {
  return { foraging: 0, prospecting: 0, knifework: 0, firecraft: 0, spicecraft: 0 };
}

export class SqliteGameRepository implements GameRepository {
  private readonly selectGame;
  private readonly upsertGame;
  private readonly selectSkills;
  private readonly upsertSkill;
  private readonly selectStacks;
  private readonly deleteStacks;
  private readonly insertStack;
  private readonly selectCodex;
  private readonly upsertCodex;
  private readonly selectSections;
  private readonly insertSection;
  private readonly selectNodes;
  private readonly deleteNodes;
  private readonly insertNode;
  private readonly selectTop;
  private readonly selectWardrobe;
  private readonly insertWardrobe;
  private readonly saveTx: (state: GameStateRecord) => void;

  constructor(private readonly db: Database.Database) {
    this.selectGame = db.prepare<[string], GameRow>(
      `SELECT coins, chef_xp, pan_tier, bag_tier, buff_expires_at, hat_id, companion_id, apron_id
       FROM player_game WHERE wallet = ?`,
    );
    this.upsertGame = db.prepare(
      `INSERT INTO player_game (wallet, coins, chef_xp, pan_tier, bag_tier, buff_expires_at, hat_id, companion_id, apron_id, updated_at)
       VALUES (@wallet, @coins, @chefXp, @panTier, @bagTier, @buffExpiresAt, @hatId, @companionId, @apronId, @now)
       ON CONFLICT(wallet) DO UPDATE SET
         coins = @coins, chef_xp = @chefXp, pan_tier = @panTier,
         bag_tier = @bagTier, buff_expires_at = @buffExpiresAt,
         hat_id = @hatId, companion_id = @companionId, apron_id = @apronId,
         updated_at = @now`,
    );

    this.selectSkills = db.prepare<[string], SkillRow>(
      "SELECT skill, xp FROM player_skill_xp WHERE wallet = ?",
    );
    this.upsertSkill = db.prepare(
      `INSERT INTO player_skill_xp (wallet, skill, xp) VALUES (?, ?, ?)
       ON CONFLICT(wallet, skill) DO UPDATE SET xp = excluded.xp`,
    );

    this.selectStacks = db.prepare<[string], StackRow>(
      "SELECT stack_key, kind, item_id, quality, qty, expires_at FROM player_inventory WHERE wallet = ?",
    );
    this.deleteStacks = db.prepare("DELETE FROM player_inventory WHERE wallet = ?");
    this.insertStack = db.prepare(
      `INSERT INTO player_inventory (wallet, stack_key, kind, item_id, quality, qty, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    this.selectCodex = db.prepare<[string], CodexRow>(
      "SELECT recipe_id, best_quality, cooked_count FROM player_codex WHERE wallet = ?",
    );
    this.upsertCodex = db.prepare(
      `INSERT INTO player_codex (wallet, recipe_id, best_quality, cooked_count) VALUES (?, ?, ?, ?)
       ON CONFLICT(wallet, recipe_id) DO UPDATE SET
         best_quality = excluded.best_quality, cooked_count = excluded.cooked_count`,
    );

    this.selectSections = db.prepare<[string], SectionRow>(
      "SELECT section FROM player_sections WHERE wallet = ?",
    );
    this.insertSection = db.prepare(
      `INSERT INTO player_sections (wallet, section, unlocked_at) VALUES (?, ?, ?)
       ON CONFLICT(wallet, section) DO NOTHING`,
    );

    this.selectNodes = db.prepare<[string, number], NodeRow>(
      "SELECT node_id, ready_at FROM player_nodes WHERE wallet = ? AND ready_at > ?",
    );
    this.deleteNodes = db.prepare("DELETE FROM player_nodes WHERE wallet = ?");
    this.insertNode = db.prepare(
      "INSERT INTO player_nodes (wallet, node_id, ready_at) VALUES (?, ?, ?)",
    );

    this.selectWardrobe = db.prepare<[string], WardrobeRow>(
      "SELECT item_id FROM player_wardrobe WHERE wallet = ?",
    );
    this.insertWardrobe = db.prepare(
      `INSERT INTO player_wardrobe (wallet, item_id, unlocked_at) VALUES (?, ?, ?)
       ON CONFLICT(wallet, item_id) DO NOTHING`,
    );

    this.selectTop = db.prepare<[number], LeaderRow>(
      `SELECT g.wallet, p.display_name, g.chef_xp
       FROM player_game g JOIN players p ON p.wallet = g.wallet
       WHERE g.chef_xp > 0
       ORDER BY g.chef_xp DESC, p.display_name ASC
       LIMIT ?`,
    );

    // One transaction per save. Inventory and node timers are rewritten wholesale
    // because both are small and the player state in memory is the truth.
    this.saveTx = db.transaction((state: GameStateRecord) => {
      const now = new Date().toISOString();
      this.upsertGame.run({
        wallet: state.wallet,
        coins: state.coins,
        chefXp: state.chefXp,
        panTier: state.panTier,
        bagTier: state.bagTier,
        buffExpiresAt: state.buffExpiresAt,
        hatId: state.hatId,
        companionId: state.companionId,
        apronId: state.cloakId,
        now,
      });

      for (const item of state.unlockedItems) {
        this.insertWardrobe.run(state.wallet, item, now);
      }

      for (const skill of SKILL_IDS) {
        this.upsertSkill.run(state.wallet, skill, state.skillXp[skill] ?? 0);
      }

      this.deleteStacks.run(state.wallet);
      for (const stack of state.stacks) {
        if (stack.qty <= 0) continue;
        this.insertStack.run(
          state.wallet,
          stack.key,
          stack.kind,
          stack.id,
          stack.quality ?? null,
          stack.qty,
          stack.expiresAt ?? null,
        );
      }

      for (const entry of state.codex) {
        this.upsertCodex.run(state.wallet, entry.recipeId, entry.bestQuality, entry.cookedCount);
      }

      for (const section of state.unlockedSections) {
        this.insertSection.run(state.wallet, section, now);
      }

      this.deleteNodes.run(state.wallet);
      const epochNow = Date.now();
      for (const [nodeId, readyAt] of Object.entries(state.nodeReadyAt)) {
        if (readyAt > epochNow) this.insertNode.run(state.wallet, nodeId, readyAt);
      }
    });
  }

  async load(wallet: string): Promise<GameStateRecord> {
    const row = this.selectGame.get(wallet);

    const skillXp = emptyXp();
    for (const skill of this.selectSkills.all(wallet)) {
      if ((SKILL_IDS as string[]).includes(skill.skill)) {
        skillXp[skill.skill as SkillId] = skill.xp;
      }
    }

    const stacks: StackRecord[] = this.selectStacks.all(wallet).map((s) => ({
      key: s.stack_key,
      kind: s.kind === "dish" ? "dish" : "ingredient",
      id: s.item_id,
      ...(s.quality ? { quality: s.quality as Quality } : {}),
      qty: s.qty,
      ...(s.expires_at ? { expiresAt: s.expires_at } : {}),
    }));

    const codex: CodexRecord[] = this.selectCodex.all(wallet).map((c) => ({
      recipeId: c.recipe_id,
      bestQuality: c.best_quality as Quality,
      cookedCount: c.cooked_count,
    }));

    const nodeReadyAt: Record<string, number> = {};
    for (const node of this.selectNodes.all(wallet, Date.now())) {
      nodeReadyAt[node.node_id] = node.ready_at;
    }

    return {
      wallet,
      coins: row?.coins ?? 0,
      chefXp: row?.chef_xp ?? 0,
      skillXp,
      panTier: row?.pan_tier ?? 0,
      bagTier: row?.bag_tier ?? 0,
      buffExpiresAt: row?.buff_expires_at ?? 0,
      stacks,
      codex,
      unlockedSections: this.selectSections.all(wallet).map((s) => s.section),
      nodeReadyAt,
      unlockedItems: this.selectWardrobe.all(wallet).map((r) => r.item_id),
      hatId: row?.hat_id ?? "",
      companionId: row?.companion_id ?? "",
      /*
       * The column is still called apron_id. Renaming it would mean a table
       * rewrite on every existing deployment to change a string that only
       * this line reads, so the name stays and the meaning moved: what it
       * holds is a cloak, and PlayerState migrates anything older.
       */
      cloakId: row?.apron_id ?? "cloak_01_wool",
    };
  }

  async save(state: GameStateRecord): Promise<void> {
    this.saveTx(state);
  }

  /**
   * The insert is the check: a signature already in the table collides on its
   * primary key, and the whole thing rolls back without granting anything.
   */
  async claimPurchase(record: PurchaseRecord): Promise<{ granted: boolean }> {
    const claim = this.db.transaction((purchase: PurchaseRecord) => {
      const inserted = this.db
        .prepare(
          `INSERT INTO shop_purchases (signature, wallet, item_id, cook, at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(signature) DO NOTHING`,
        )
        .run(purchase.signature, purchase.wallet, purchase.itemId, purchase.cook, purchase.at);

      if (inserted.changes === 0) return false;

      this.insertWardrobe.run(purchase.wallet, purchase.itemId, purchase.at);
      return true;
    });

    return { granted: claim(record) };
  }

  async purchasesOf(wallet: string): Promise<PurchaseRecord[]> {
    const rows = this.db
      .prepare<[string], { signature: string; item_id: string; cook: number; at: string }>(
        "SELECT signature, item_id, cook, at FROM shop_purchases WHERE wallet = ? ORDER BY at DESC",
      )
      .all(wallet);
    return rows.map((r) => ({
      signature: r.signature,
      wallet,
      itemId: r.item_id,
      cook: r.cook,
      at: r.at,
    }));
  }

  async recordCook(quality: Quality, day: string): Promise<void> {
    if (quality !== "superb") return;
    this.db
      .prepare(
        `INSERT INTO cook_tally (day, superbs) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET superbs = superbs + 1`,
      )
      .run(day);
  }

  async publicTally(day: string): Promise<PublicTally> {
    const chefs = this.db
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM players")
      .get();
    const dishes = this.db
      .prepare<[], { n: number }>("SELECT COALESCE(SUM(cooked_count), 0) AS n FROM player_codex")
      .get();
    const superbs = this.db
      .prepare<[string], { superbs: number }>("SELECT superbs FROM cook_tally WHERE day = ?")
      .get(day);

    return {
      chefsRegistered: chefs?.n ?? 0,
      dishesCooked: dishes?.n ?? 0,
      superbsToday: superbs?.superbs ?? 0,
    };
  }

  async readFlag(name: string): Promise<string | null> {
    const row = this.db
      .prepare<[string], { value: string }>("SELECT value FROM server_flags WHERE name = ?")
      .get(name);
    return row?.value ?? null;
  }

  async writeFlag(name: string, value: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO server_flags (name, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(name, value, new Date().toISOString());
  }

  async topByChefXp(limit: number): Promise<LeaderboardEntry[]> {
    const rows = this.selectTop.all(limit);
    if (rows.length === 0) return [];

    // One extra read for the whole page rather than one per row. Skill XP is
    // needed only to work out which level-20 titles each chef has earned.
    const placeholders = rows.map(() => "?").join(", ");
    const skillRows = this.db
      .prepare<string[], SkillRow & { wallet: string }>(
        `SELECT wallet, skill, xp FROM player_skill_xp WHERE wallet IN (${placeholders})`,
      )
      .all(...rows.map((r) => r.wallet));

    const byWallet = new Map<string, Record<SkillId, number>>();
    for (const row of rows) byWallet.set(row.wallet, emptyXp());
    for (const skill of skillRows) {
      if (!(SKILL_IDS as string[]).includes(skill.skill)) continue;
      const bucket = byWallet.get(skill.wallet);
      if (bucket) bucket[skill.skill as SkillId] = skill.xp;
    }

    return rows.map((r) => ({
      wallet: r.wallet,
      displayName: r.display_name,
      chefXp: r.chef_xp,
      skillXp: byWallet.get(r.wallet) ?? emptyXp(),
    }));
  }
}
