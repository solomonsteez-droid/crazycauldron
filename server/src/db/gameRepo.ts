import type Database from "better-sqlite3";
import { SKILL_IDS, type Quality, type SkillId } from "@crazycauldron/shared";
import type {
  CodexRecord,
  GameRepository,
  GameStateRecord,
  LeaderboardEntry,
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

    CREATE INDEX IF NOT EXISTS idx_player_game_chef ON player_game (chef_xp DESC);
  `);
}

interface GameRow {
  coins: number;
  chef_xp: number;
  pan_tier: number;
  bag_tier: number;
  buff_expires_at: number;
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
  private readonly saveTx: (state: GameStateRecord) => void;

  constructor(private readonly db: Database.Database) {
    this.selectGame = db.prepare<[string], GameRow>(
      "SELECT coins, chef_xp, pan_tier, bag_tier, buff_expires_at FROM player_game WHERE wallet = ?",
    );
    this.upsertGame = db.prepare(
      `INSERT INTO player_game (wallet, coins, chef_xp, pan_tier, bag_tier, buff_expires_at, updated_at)
       VALUES (@wallet, @coins, @chefXp, @panTier, @bagTier, @buffExpiresAt, @now)
       ON CONFLICT(wallet) DO UPDATE SET
         coins = @coins, chef_xp = @chefXp, pan_tier = @panTier,
         bag_tier = @bagTier, buff_expires_at = @buffExpiresAt, updated_at = @now`,
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
        now,
      });

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

  load(wallet: string): GameStateRecord {
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
    };
  }

  save(state: GameStateRecord): void {
    this.saveTx(state);
  }

  topByChefXp(limit: number): LeaderboardEntry[] {
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
