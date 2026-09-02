import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import type {
  AuctionBid,
  AuctionEvent,
  AuctionItem,
  AuctionItemStatus,
  AuctionSession,
  AuctionSessionStatus,
  AuctionSessionSummary,
  AuctionSettings,
  DividendEntry,
  DividendReport,
  DividendSummary,
  ItemDividendGroup,
  ItemDividendLine,
  ItemPriceStats,
  ItemQuality,
  Member,
  MemberRole,
  MemberRow,
} from "./types";
import {
  DEFAULT_AUCTION_TAX_RATE,
  normalizeAuctionTaxRate,
} from "./auction/tax";
import { computeTimerFromNow } from "./boss/timer";
import {
  isPinkAuction,
  isParticipantOnlyAuction,
  isOrdinaryPinkAuction,
  ORDINARY_PINK_BID_DENIED,
  PINK_ROLL_SECONDS,
  PINK_VOTE_SECONDS,
  pickUnusedRoll,
  resolvePinkContest,
} from "./auction/pink";
import {
  DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
  normalizeLeaderboardThresholdPercent,
  percentToRatio,
  ratioToPercent,
} from "./leaderboard/threshold";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "guild.db");

let db: Database.Database | null = null;

export function ensureDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'active',
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      exited_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_start_time TEXT NOT NULL DEFAULT '15:00',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      bid_extension_seconds INTEGER NOT NULL DEFAULT 20,
      sound_enabled_default INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS auction_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_start TEXT,
      started_at TEXT,
      ends_at TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      tax_rate REAL NOT NULL DEFAULT 0.05,
      current_item_id INTEGER,
      note TEXT,
      dividends_calculated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quality TEXT NOT NULL DEFAULT 'green',
      start_price REAL NOT NULL DEFAULT 5,
      bid_increment REAL NOT NULL DEFAULT 5,
      image_data TEXT,
      has_image INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      current_price REAL NOT NULL DEFAULT 5,
      winner_member_id INTEGER,
      sold_price REAL,
      activated_at TEXT,
      closed_at TEXT,
      FOREIGN KEY(session_id) REFERENCES auction_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS auction_item_dividends (
      item_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      PRIMARY KEY (item_id, member_id),
      FOREIGN KEY(item_id) REFERENCES auction_items(id),
      FOREIGN KEY(member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS auction_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_item_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      voter_member_id INTEGER NOT NULL,
      candidate_member_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, voter_member_id)
    );

    CREATE TABLE IF NOT EXISTS auction_item_rolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, member_id),
      UNIQUE(item_id, points)
    );

    CREATE TABLE IF NOT EXISTS auction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_dividend_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      is_temporary INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS auction_item_dividend_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      sold_price REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0.05,
      tax_amount REAL NOT NULL DEFAULT 0,
      pool_amount REAL NOT NULL DEFAULT 0,
      share_amount REAL NOT NULL DEFAULT 0,
      is_temporary INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_auction_items_session
      ON auction_items(session_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_auction_item_dividends_item
      ON auction_item_dividends(item_id, member_id);
    CREATE INDEX IF NOT EXISTS idx_auction_bids_session_item
      ON auction_bids(session_id, item_id, id);
    CREATE INDEX IF NOT EXISTS idx_auction_item_votes_item
      ON auction_item_votes(item_id);
    CREATE INDEX IF NOT EXISTS idx_auction_item_rolls_item
      ON auction_item_rolls(item_id);
    CREATE INDEX IF NOT EXISTS idx_auction_events_session
      ON auction_events(session_id, id);

    CREATE TABLE IF NOT EXISTS auction_item_sale_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      session_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_name_key TEXT NOT NULL,
      quality TEXT,
      sold_price REAL NOT NULL,
      winner_member_id INTEGER,
      winner_name TEXT,
      sold_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sale_history_name_key
      ON auction_item_sale_history(item_name_key);

    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL UNIQUE,
      member_name TEXT NOT NULL,
      combat_power INTEGER NOT NULL,
      ocr_name TEXT NOT NULL,
      image_data TEXT,
      has_image INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS bosses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#c084fc',
      spawn_rate INTEGER NOT NULL DEFAULT 50,
      interval_hours REAL NOT NULL DEFAULT 6,
      last_kill_at TEXT,
      next_spawn_at TEXT,
      drops_note TEXT,
      drops_image TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boss_vote_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(boss_id) REFERENCES bosses(id)
    );

    CREATE TABLE IF NOT EXISTS boss_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      boss_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL,
      member_id INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(round_id, member_id),
      FOREIGN KEY(round_id) REFERENCES boss_vote_rounds(id),
      FOREIGN KEY(boss_id) REFERENCES bosses(id)
    );

    CREATE TABLE IF NOT EXISTS boss_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boss_presence (
      member_id INTEGER PRIMARY KEY,
      member_name TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
  `);

  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(database: Database.Database) {
  // Members are managed only via admin — do not auto-seed roster names.

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  wipeRosterAndAuctionsOnce(database);
  prodGoLiveCleanupOnce(database);

  const adminCount = database
    .prepare("SELECT COUNT(*) as count FROM admins")
    .get() as { count: number };

  if (adminCount.count === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "Feisha2026";
    const hash = bcrypt.hashSync(password, 10);
    database
      .prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
  } else if (adminCount.count > 1) {
    // Keep a single admin account (lowest id).
    const keep = database
      .prepare("SELECT id FROM admins ORDER BY id ASC LIMIT 1")
      .get() as { id: number };
    database.prepare("DELETE FROM admins WHERE id != ?").run(keep.id);
  }

  const settings = database
    .prepare("SELECT id FROM auction_settings WHERE id = 1")
    .get();
  if (!settings) {
    database
      .prepare(
        `INSERT INTO auction_settings (id, default_start_time, duration_minutes, bid_extension_seconds, sound_enabled_default)
         VALUES (1, '15:00', 30, 20, 1)`,
      )
      .run();
  }

  ensureColumn(
    database,
    "auction_sessions",
    "tax_rate",
    "REAL NOT NULL DEFAULT 0.05",
  );

  ensureColumn(
    database,
    "members",
    "status",
    "TEXT NOT NULL DEFAULT 'active'",
  );
  ensureColumn(database, "members", "exited_at", "TEXT");

  ensureColumn(database, "bosses", "drops_image", "TEXT");
  ensureColumn(database, "auction_items", "bid_min", "REAL");
  ensureColumn(database, "auction_items", "bid_max", "REAL");
  ensureColumn(database, "auction_items", "vote_ends_at", "TEXT");
  ensureColumn(database, "auction_items", "roll_ends_at", "TEXT");
  ensureColumn(
    database,
    "auction_items",
    "has_image",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    database,
    "leaderboard_entries",
    "has_image",
    "INTEGER NOT NULL DEFAULT 0",
  );

  const bossCount = database
    .prepare("SELECT COUNT(*) as count FROM bosses")
    .get() as { count: number };
  if (bossCount.count === 0) {
    const insertBoss = database.prepare(
      `INSERT INTO bosses (name, color, spawn_rate, interval_hours, sort_order, drops_note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const defaults = [
      ["魔图拉", "#c084fc", 50, 6, 0, "可查询掉落物"],
      ["潘柴特", "#f472b6", 100, 12, 1, "可查询掉落物"],
      ["坦佛斯特", "#fb7185", 50, 6, 2, "可查询掉落物"],
    ] as const;
    for (const row of defaults) {
      insertBoss.run(...row);
    }
  }

  backfillSaleHistory(database);
  migrateLegacyPinkToSpecialOnce(database);
  migrateHasImageFlagsOnce(database);
  // Legacy: wipe leftover total-table temporary rows (feature removed).
  database
    .prepare(`DELETE FROM auction_dividend_entries WHERE is_temporary = 1`)
    .run();
}

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Old `pink` rows used the vote/limit rules; those are now `special_pink`. */
function migrateLegacyPinkToSpecialOnce(database: Database.Database) {
  const done = database
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get("migrate_pink_to_special_pink_v1") as { value: string } | undefined;
  if (done) return;
  database.exec(`
    UPDATE auction_items SET quality = 'special_pink' WHERE quality = 'pink';
    UPDATE auction_item_sale_history SET quality = 'special_pink' WHERE quality = 'pink';
  `);
  database
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("migrate_pink_to_special_pink_v1", new Date().toISOString());
}

function migrateHasImageFlagsOnce(database: Database.Database) {
  const done = database
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get("migrate_has_image_flags_v1") as { value: string } | undefined;
  if (done) return;
  database.exec(`
    UPDATE auction_items SET has_image = 1
      WHERE image_data IS NOT NULL AND length(image_data) > 32;
    UPDATE leaderboard_entries SET has_image = 1
      WHERE image_data IS NOT NULL AND length(image_data) > 32;
  `);
  database
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("migrate_has_image_flags_v1", new Date().toISOString());
}

/** One-shot: clear all members + auction data; keep admin + bosses. */
function wipeRosterAndAuctionsOnce(database: Database.Database) {
  const done = database
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get("wipe_roster_auctions_v1") as { value: string } | undefined;
  if (done) return;

  const wipe = database.transaction(() => {
    database.pragma("foreign_keys = OFF");
    database.exec(`
      DELETE FROM auction_item_dividends;
      DELETE FROM auction_item_dividend_lines;
      DELETE FROM auction_dividend_entries;
      DELETE FROM auction_bids;
      DELETE FROM auction_events;
      DELETE FROM auction_item_sale_history;
      DELETE FROM auction_items;
      DELETE FROM auction_sessions;
      DELETE FROM leaderboard_entries;
      DELETE FROM boss_votes;
      DELETE FROM boss_vote_rounds;
      DELETE FROM boss_presence;
      DELETE FROM boss_chat;
      DELETE FROM auction_item_rolls;
      DELETE FROM auction_item_votes;
      DELETE FROM members;
    `);
    database.pragma("foreign_keys = ON");

    // Keep a single admin row if any exist
    const admins = database
      .prepare(`SELECT id FROM admins ORDER BY id ASC`)
      .all() as Array<{ id: number }>;
    if (admins.length > 1) {
      database
        .prepare(`DELETE FROM admins WHERE id != ?`)
        .run(admins[0].id);
    }

    database
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run("wipe_roster_auctions_v1", new Date().toISOString());
  });

  wipe();
  console.info(
    "[db] wiped members + auction data (kept admins + bosses)",
  );
}

/**
 * One-shot before formal go-live:
 * - delete test members 测试1～测试6
 * - clear all auction history
 * - reset admin password
 * Bosses are kept.
 */
function prodGoLiveCleanupOnce(database: Database.Database) {
  const done = database
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get("prod_golive_cleanup_v1") as { value: string } | undefined;
  if (done) return;

  // Fixed go-live password (also update server .env ADMIN_PASSWORD to match)
  const adminPassword = "Feisha2026";
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || "admin";
  const adminHash = bcrypt.hashSync(adminPassword, 10);

  const run = database.transaction(() => {
    database.pragma("foreign_keys = OFF");

    // Clear all auction-related records
    database.exec(`
      DELETE FROM auction_item_dividends;
      DELETE FROM auction_item_dividend_lines;
      DELETE FROM auction_dividend_entries;
      DELETE FROM auction_item_rolls;
      DELETE FROM auction_item_votes;
      DELETE FROM auction_bids;
      DELETE FROM auction_events;
      DELETE FROM auction_item_sale_history;
      DELETE FROM auction_items;
      DELETE FROM auction_sessions;
    `);

    // Hard-delete 测试1～测试6 and their live refs
    const testMembers = database
      .prepare(
        `SELECT id FROM members
         WHERE name IN ('测试1','测试2','测试3','测试4','测试5','测试6')
            OR name GLOB '测试[1-6]'`,
      )
      .all() as Array<{ id: number }>;

    for (const { id } of testMembers) {
      database
        .prepare(`DELETE FROM auction_item_dividends WHERE member_id = ?`)
        .run(id);
      database
        .prepare(`DELETE FROM leaderboard_entries WHERE member_id = ?`)
        .run(id);
      database.prepare(`DELETE FROM boss_votes WHERE member_id = ?`).run(id);
      database.prepare(`DELETE FROM boss_presence WHERE member_id = ?`).run(id);
      database
        .prepare(`UPDATE boss_chat SET member_id = NULL WHERE member_id = ?`)
        .run(id);
      database.prepare(`DELETE FROM members WHERE id = ?`).run(id);
    }

    database.pragma("foreign_keys = ON");

    // Ensure single admin with new password
    const admins = database
      .prepare(`SELECT id FROM admins ORDER BY id ASC`)
      .all() as Array<{ id: number }>;
    if (admins.length === 0) {
      database
        .prepare(
          `INSERT INTO admins (username, password_hash) VALUES (?, ?)`,
        )
        .run(adminUsername, adminHash);
    } else {
      const keepId = admins[0].id;
      if (admins.length > 1) {
        database.prepare(`DELETE FROM admins WHERE id != ?`).run(keepId);
      }
      database
        .prepare(
          `UPDATE admins SET username = ?, password_hash = ? WHERE id = ?`,
        )
        .run(adminUsername, adminHash, keepId);
    }

    database
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run("prod_golive_cleanup_v1", new Date().toISOString());
  });

  run();
  console.info(
    "[db] prod go-live: removed 测试1-6, cleared auctions, reset admin password",
  );
}

/** Normalize item names so「祝福的生命之石」matches across spaces / case. */
export function normalizeItemNameKey(name: string) {
  return name.replace(/\s+/g, "").trim().toLowerCase();
}

function backfillSaleHistory(database: Database.Database) {
  const missing = database
    .prepare(
      `SELECT i.id, i.session_id, i.name, i.quality, i.sold_price, i.winner_member_id, i.closed_at,
              m.name as winner_name
       FROM auction_items i
       LEFT JOIN members m ON m.id = i.winner_member_id
       WHERE i.status = 'sold'
         AND i.sold_price IS NOT NULL
         AND i.sold_price > 0
         AND NOT EXISTS (
           SELECT 1 FROM auction_item_sale_history h WHERE h.item_id = i.id
         )`,
    )
    .all() as Array<{
    id: number;
    session_id: number;
    name: string;
    quality: string;
    sold_price: number;
    winner_member_id: number | null;
    closed_at: string | null;
    winner_name: string | null;
  }>;

  if (!missing.length) return;

  const insert = database.prepare(
    `INSERT INTO auction_item_sale_history
     (item_id, session_id, item_name, item_name_key, quality, sold_price, winner_member_id, winner_name, sold_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = database.transaction(() => {
    for (const row of missing) {
      insert.run(
        row.id,
        row.session_id,
        row.name,
        normalizeItemNameKey(row.name),
        row.quality,
        row.sold_price,
        row.winner_member_id,
        row.winner_name,
        row.closed_at || nowIso(),
      );
    }
  });
  tx();
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status === "exited" ? "exited" : "active",
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at,
    exitedAt: row.exited_at ?? null,
  };
}

const MEMBER_SELECT =
  "SELECT id, name, role, COALESCE(status, 'active') as status, password_hash, created_at, exited_at FROM members";

export function listMembers(options?: {
  includeExited?: boolean;
}): Member[] {
  const includeExited = options?.includeExited === true;
  const rows = ensureDb()
    .prepare(
      includeExited
        ? `${MEMBER_SELECT} ORDER BY CASE WHEN COALESCE(status, 'active') = 'exited' THEN 1 ELSE 0 END, id ASC`
        : `${MEMBER_SELECT} WHERE COALESCE(status, 'active') = 'active' ORDER BY id ASC`,
    )
    .all() as MemberRow[];
  return rows.map(toMember);
}

export function getMemberById(id: number): MemberRow | null {
  const row = ensureDb()
    .prepare(`${MEMBER_SELECT} WHERE id = ?`)
    .get(id) as MemberRow | undefined;
  if (!row) return null;
  return {
    ...row,
    status: row.status === "exited" ? "exited" : "active",
  };
}

export function getMemberByName(name: string): MemberRow | null {
  const row = ensureDb()
    .prepare(`${MEMBER_SELECT} WHERE name = ?`)
    .get(name.trim()) as MemberRow | undefined;
  if (!row) return null;
  return {
    ...row,
    status: row.status === "exited" ? "exited" : "active",
  };
}

export function createMember(name: string, role: MemberRole = "normal"): Member {
  const result = ensureDb()
    .prepare(
      "INSERT INTO members (name, role, status) VALUES (?, ?, 'active')",
    )
    .run(name.trim(), role);
  const row = getMemberById(Number(result.lastInsertRowid));
  if (!row) throw new Error("Create member failed");
  return toMember(row);
}

export function updateMember(
  id: number,
  data: { name?: string; role?: MemberRole },
): Member | null {
  const current = getMemberById(id);
  if (!current) return null;

  const name = data.name?.trim() || current.name;
  const role = data.role || current.role;

  ensureDb()
    .prepare("UPDATE members SET name = ?, role = ? WHERE id = ?")
    .run(name, role, id);

  const row = getMemberById(id);
  return row ? toMember(row) : null;
}

/** 清退：只保留历史记录，去掉账号与实时数据。 */
export function markMemberExited(id: number): boolean {
  const database = ensureDb();
  const existing = database
    .prepare(
      `SELECT id FROM members
       WHERE id = ? AND COALESCE(status, 'active') != 'exited'`,
    )
    .get(id);
  if (!existing) return false;

  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE members
         SET status = 'exited',
             exited_at = COALESCE(exited_at, datetime('now')),
             password_hash = NULL
         WHERE id = ?`,
      )
      .run(id);

    // Live / account state only — auction bids, dividends, sale history stay
    database
      .prepare("DELETE FROM leaderboard_entries WHERE member_id = ?")
      .run(id);
    database.prepare("DELETE FROM boss_presence WHERE member_id = ?").run(id);
  });
  tx();
  return true;
}

export function restoreMember(id: number): boolean {
  const result = ensureDb()
    .prepare(
      `UPDATE members
       SET status = 'active', exited_at = NULL
       WHERE id = ? AND status = 'exited'`,
    )
    .run(id);
  return result.changes > 0;
}

/** Soft-delete alias used by admin DELETE API. */
export function deleteMember(id: number): boolean {
  return markMemberExited(id);
}

export function resetMemberPassword(id: number): boolean {
  const result = ensureDb()
    .prepare("UPDATE members SET password_hash = NULL WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function setMemberPassword(id: number, password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  ensureDb()
    .prepare("UPDATE members SET password_hash = ? WHERE id = ?")
    .run(hash, id);
}

/** Atomically set password only if still unset. Returns true if claimed. */
export function claimMemberPassword(id: number, password: string): boolean {
  const hash = bcrypt.hashSync(password, 10);
  const result = ensureDb()
    .prepare(
      "UPDATE members SET password_hash = ? WHERE id = ? AND password_hash IS NULL",
    )
    .run(hash, id);
  return result.changes > 0;
}

export function verifyMemberPassword(id: number, password: string): boolean {
  const member = getMemberById(id);
  if (!member?.password_hash) return false;
  return bcrypt.compareSync(password, member.password_hash);
}

export function verifyAdmin(
  username: string,
  password: string,
): { id: number; username: string } | null {
  const row = ensureDb()
    .prepare("SELECT id, username, password_hash FROM admins WHERE username = ?")
    .get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;

  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

export function setAdminPassword(password: string, username = "admin"): boolean {
  const hash = bcrypt.hashSync(password, 10);
  const result = ensureDb()
    .prepare(`UPDATE admins SET password_hash = ? WHERE username = ?`)
    .run(hash, username);
  if (result.changes > 0) return true;
  ensureDb()
    .prepare(`INSERT INTO admins (username, password_hash) VALUES (?, ?)`)
    .run(username, hash);
  return true;
}

/* -------------------- Auction -------------------- */

type SessionRow = {
  id: number;
  status: AuctionSessionStatus;
  scheduled_start: string | null;
  started_at: string | null;
  ends_at: string | null;
  duration_minutes: number;
  tax_rate: number | null;
  current_item_id: number | null;
  note: string | null;
  dividends_calculated: number;
  created_at: string;
};

type ItemRow = {
  id: number;
  session_id: number;
  name: string;
  quality: ItemQuality;
  start_price: number;
  bid_increment: number;
  image_data: string | null;
  sort_order: number;
  status: AuctionItemStatus;
  current_price: number;
  winner_member_id: number | null;
  sold_price: number | null;
  activated_at: string | null;
  closed_at: string | null;
  bid_min: number | null;
  bid_max: number | null;
  vote_ends_at: string | null;
  roll_ends_at: string | null;
  has_image?: number;
  winner_name?: string | null;
};

const ITEM_COLUMNS = `auction_items.id, auction_items.session_id, auction_items.name,
  auction_items.quality, auction_items.start_price, auction_items.bid_increment,
  auction_items.sort_order, auction_items.status, auction_items.current_price,
  auction_items.winner_member_id, auction_items.sold_price,
  auction_items.activated_at, auction_items.closed_at, auction_items.bid_min,
  auction_items.bid_max, auction_items.vote_ends_at, auction_items.roll_ends_at,
  auction_items.has_image`;

function toSession(row: SessionRow): AuctionSession {
  return {
    id: row.id,
    status: row.status,
    scheduledStart: row.scheduled_start,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    taxRate: normalizeAuctionTaxRate(
      row.tax_rate,
      DEFAULT_AUCTION_TAX_RATE,
    ),
    currentItemId: row.current_item_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

function getItemDividendIds(itemId: number): number[] {
  const rows = ensureDb()
    .prepare("SELECT member_id FROM auction_item_dividends WHERE item_id = ?")
    .all(itemId) as Array<{ member_id: number }>;
  return rows.map((r) => r.member_id);
}

function toItem(
  row: ItemRow,
  opts?: {
    includeImages?: boolean;
    includeDividends?: boolean;
    dividendRoster?: { ids: number[]; names: string[] };
    winnerName?: string | null;
  },
): AuctionItem {
  const includeImages = opts?.includeImages === true;
  const includeDividends = opts?.includeDividends !== false;
  const dividendMemberIds = includeDividends
    ? (opts?.dividendRoster?.ids ?? getItemDividendIds(row.id))
    : [];
  const dividendMemberNames = includeDividends
    ? (opts?.dividendRoster?.names ??
      (dividendMemberIds
        .map((id) => getMemberById(id)?.name)
        .filter(Boolean) as string[]))
    : [];

  let winnerName: string | null =
    opts?.winnerName !== undefined
      ? (opts.winnerName ?? null)
      : (row.winner_name ?? null);
  if (winnerName == null && row.winner_member_id) {
    winnerName = getMemberById(row.winner_member_id)?.name ?? null;
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    quality: row.quality,
    startPrice: row.start_price,
    bidIncrement: row.bid_increment,
    imageData: includeImages ? row.image_data : null,
    hasImage: Boolean(row.has_image),
    sortOrder: row.sort_order,
    status: row.status,
    currentPrice: row.current_price,
    winnerMemberId: row.winner_member_id,
    winnerName,
    soldPrice: row.sold_price,
    activatedAt: row.activated_at,
    closedAt: row.closed_at,
    bidMin: row.bid_min ?? null,
    bidMax: row.bid_max ?? null,
    voteEndsAt: row.vote_ends_at ?? null,
    rollEndsAt: row.roll_ends_at ?? null,
    dividendMemberIds,
    dividendMemberNames,
    leadingBidderId: null,
    leadingBidderName: null,
  };
}

export function getAuctionSettings(): AuctionSettings {
  const row = ensureDb()
    .prepare(
      `SELECT id, default_start_time, duration_minutes, bid_extension_seconds,
              sound_enabled_default
       FROM auction_settings WHERE id = 1`,
    )
    .get() as {
    id: number;
    default_start_time: string;
    duration_minutes: number;
    bid_extension_seconds: number;
    sound_enabled_default: number;
  };

  return {
    id: row.id,
    defaultStartTime: row.default_start_time,
    durationMinutes: row.duration_minutes,
    bidExtensionSeconds: row.bid_extension_seconds,
    soundEnabledDefault: Boolean(row.sound_enabled_default),
  };
}

export function updateAuctionSettings(data: {
  defaultStartTime?: string;
  durationMinutes?: number;
  bidExtensionSeconds?: number;
}): AuctionSettings {
  const current = getAuctionSettings();
  ensureDb()
    .prepare(
      `UPDATE auction_settings
       SET default_start_time = ?, duration_minutes = ?, bid_extension_seconds = ?
       WHERE id = 1`,
    )
    .run(
      data.defaultStartTime ?? current.defaultStartTime,
      data.durationMinutes ?? current.durationMinutes,
      data.bidExtensionSeconds ?? current.bidExtensionSeconds,
    );
  return getAuctionSettings();
}

export function getLatestSession(): AuctionSession | null {
  const row = ensureDb()
    .prepare(
      `SELECT * FROM auction_sessions ORDER BY id DESC LIMIT 1`,
    )
    .get() as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function getSessionById(id: number): AuctionSession | null {
  const row = ensureDb()
    .prepare(`SELECT * FROM auction_sessions WHERE id = ?`)
    .get(id) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function listSessions(): AuctionSession[] {
  const rows = ensureDb()
    .prepare(`SELECT * FROM auction_sessions ORDER BY id DESC`)
    .all() as SessionRow[];
  return rows.map(toSession);
}

export function listSessionSummaries(): AuctionSessionSummary[] {
  const rows = ensureDb()
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM auction_items i WHERE i.session_id = s.id) AS item_count
       FROM auction_sessions s
       ORDER BY
         CASE s.status
           WHEN 'live' THEN 0
           WHEN 'scheduled' THEN 1
           WHEN 'draft' THEN 2
           ELSE 3
         END,
         COALESCE(s.scheduled_start, s.created_at) DESC,
         s.id DESC`,
    )
    .all() as Array<SessionRow & { item_count: number }>;
  return rows.map((row) => ({
    ...toSession(row),
    itemCount: Number(row.item_count) || 0,
  }));
}

/** Prefer live session, else nearest upcoming scheduled/draft, else latest. */
export function getPublicAuctionSession(): AuctionSession | null {
  const database = ensureDb();
  const live = database
    .prepare(
      `SELECT * FROM auction_sessions WHERE status = 'live' ORDER BY id DESC LIMIT 1`,
    )
    .get() as SessionRow | undefined;
  if (live) return maybeAutoProgress(live.id) ?? toSession(live);

  const upcoming = database
    .prepare(
      `SELECT * FROM auction_sessions
       WHERE status IN ('scheduled', 'draft')
       ORDER BY
         CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END,
         scheduled_start ASC,
         id ASC
       LIMIT 1`,
    )
    .get() as SessionRow | undefined;
  if (upcoming) return maybeAutoProgress(upcoming.id) ?? toSession(upcoming);

  return getLatestSession();
}

export function isDividendsCalculated(sessionId: number): boolean {
  const row = ensureDb()
    .prepare(
      `SELECT dividends_calculated FROM auction_sessions WHERE id = ?`,
    )
    .get(sessionId) as { dividends_calculated: number } | undefined;
  return Boolean(row?.dividends_calculated);
}

export function createDraftSession(input?: {
  scheduledStart?: string | null;
  durationMinutes?: number;
  taxRate?: number;
  note?: string;
}): AuctionSession {
  const settings = getAuctionSettings();
  const duration = input?.durationMinutes ?? settings.durationMinutes;
  const taxRate = normalizeAuctionTaxRate(
    input?.taxRate,
    DEFAULT_AUCTION_TAX_RATE,
  );
  let status: AuctionSessionStatus = "draft";
  if (input?.scheduledStart) {
    const startMs = new Date(input.scheduledStart).getTime();
    if (Number.isFinite(startMs) && startMs > Date.now() + 5000) {
      status = "scheduled";
    }
  }
  const result = ensureDb()
    .prepare(
      `INSERT INTO auction_sessions
       (status, scheduled_start, duration_minutes, tax_rate, note)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      status,
      input?.scheduledStart ?? null,
      duration,
      taxRate,
      input?.note ?? null,
    );
  return getSessionById(Number(result.lastInsertRowid))!;
}

export function getOrCreateEditableSession(): AuctionSession {
  const latest = getLatestSession();
  if (latest && (latest.status === "draft" || latest.status === "scheduled")) {
    return latest;
  }
  if (latest && latest.status === "live") {
    return latest;
  }
  return createDraftSession();
}

export function updateSessionSchedule(
  sessionId: number,
  data: {
    scheduledStart: string | null;
    durationMinutes?: number;
    taxRate?: number;
    note?: string;
  },
): AuctionSession | null {
  const session = getSessionById(sessionId);
  if (!session || session.status === "live" || session.status === "ended") {
    return null;
  }

  let status: AuctionSessionStatus = "draft";
  if (data.scheduledStart) {
    const startMs = new Date(data.scheduledStart).getTime();
    // Only mark scheduled when start time is still in the future
    status =
      Number.isFinite(startMs) && startMs > Date.now() + 5000
        ? "scheduled"
        : "draft";
  }

  ensureDb()
    .prepare(
      `UPDATE auction_sessions
       SET scheduled_start = ?, duration_minutes = ?, tax_rate = ?, note = ?, status = ?
       WHERE id = ?`,
    )
    .run(
      data.scheduledStart,
      data.durationMinutes ?? session.durationMinutes,
      normalizeAuctionTaxRate(data.taxRate, session.taxRate),
      data.note ?? session.note,
      status,
      sessionId,
    );
  return getSessionById(sessionId);
}

export function updateSessionTaxRate(
  sessionId: number,
  taxRate: number,
): AuctionSession {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("场次不存在");
  const normalized = normalizeAuctionTaxRate(taxRate, session.taxRate);
  ensureDb()
    .prepare(`UPDATE auction_sessions SET tax_rate = ? WHERE id = ?`)
    .run(normalized, sessionId);
  return getSessionById(sessionId)!;
}

/** Delete a not-started session and all related records. Irreversible. */
export function deleteAuctionSession(sessionId: number): boolean {
  const session = getSessionById(sessionId);
  if (!session) return false;
  if (session.status === "live" || session.status === "ended") return false;

  const database = ensureDb();
  const tx = database.transaction(() => {
    const itemIds = (
      database
        .prepare(`SELECT id FROM auction_items WHERE session_id = ?`)
        .all(sessionId) as Array<{ id: number }>
    ).map((r) => r.id);

    for (const itemId of itemIds) {
      database
        .prepare(`DELETE FROM auction_item_dividends WHERE item_id = ?`)
        .run(itemId);
      database.prepare(`DELETE FROM auction_item_votes WHERE item_id = ?`).run(itemId);
      database.prepare(`DELETE FROM auction_item_rolls WHERE item_id = ?`).run(itemId);
    }
    database.prepare(`DELETE FROM auction_bids WHERE session_id = ?`).run(sessionId);
    database.prepare(`DELETE FROM auction_events WHERE session_id = ?`).run(sessionId);
    database
      .prepare(`DELETE FROM auction_dividend_entries WHERE session_id = ?`)
      .run(sessionId);
    database.prepare(`DELETE FROM auction_items WHERE session_id = ?`).run(sessionId);
    database.prepare(`DELETE FROM auction_sessions WHERE id = ?`).run(sessionId);
  });
  tx();
  return true;
}

export function listItems(
  sessionId: number,
  opts?: { includeImages?: boolean; includeDividends?: boolean },
): AuctionItem[] {
  const database = ensureDb();
  const includeImages = opts?.includeImages === true;
  const rows = database
    .prepare(
      includeImages
        ? `SELECT ${ITEM_COLUMNS}, auction_items.image_data, m.name AS winner_name
           FROM auction_items
           LEFT JOIN members m ON m.id = auction_items.winner_member_id
           WHERE auction_items.session_id = ?
           ORDER BY auction_items.sort_order ASC, auction_items.id ASC`
        : `SELECT ${ITEM_COLUMNS}, m.name AS winner_name
           FROM auction_items
           LEFT JOIN members m ON m.id = auction_items.winner_member_id
           WHERE auction_items.session_id = ?
           ORDER BY auction_items.sort_order ASC, auction_items.id ASC`,
    )
    .all(sessionId) as ItemRow[];

  const rosters = new Map<number, { ids: number[]; names: string[] }>();
  if (opts?.includeDividends !== false && rows.length > 0) {
    const rosterRows = database
      .prepare(
        `SELECT d.item_id, d.member_id, m.name AS member_name
         FROM auction_item_dividends d
         INNER JOIN auction_items i ON i.id = d.item_id
         LEFT JOIN members m ON m.id = d.member_id
         WHERE i.session_id = ?
         ORDER BY d.item_id ASC, d.rowid ASC`,
      )
      .all(sessionId) as Array<{
      item_id: number;
      member_id: number;
      member_name: string | null;
    }>;
    for (const rosterRow of rosterRows) {
      const roster = rosters.get(rosterRow.item_id) ?? { ids: [], names: [] };
      roster.ids.push(rosterRow.member_id);
      if (rosterRow.member_name) roster.names.push(rosterRow.member_name);
      rosters.set(rosterRow.item_id, roster);
    }
  }

  return rows.map((row) =>
    toItem(row, {
      ...opts,
      includeImages,
      winnerName: row.winner_name ?? null,
      dividendRoster:
        opts?.includeDividends === false
          ? undefined
          : (rosters.get(row.id) ?? { ids: [], names: [] }),
    }),
  );
}

export function listItemImages(
  sessionId: number,
): Array<{ id: number; imageData: string | null }> {
  return ensureDb()
    .prepare(
      `SELECT id, image_data FROM auction_items
       WHERE session_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(sessionId)
    .map((row) => {
      const typed = row as { id: number; image_data: string | null };
      return { id: typed.id, imageData: typed.image_data };
    });
}

/** Latest high bidder per item in a session (by max bid id = current price). */
export function mapLeadingBidders(sessionId: number): Map<
  number,
  { memberId: number; memberName: string; amount: number }
> {
  const rows = ensureDb()
    .prepare(
      `SELECT b.item_id, b.member_id, m.name as member_name, b.amount
       FROM auction_bids b
       JOIN members m ON m.id = b.member_id
       INNER JOIN (
         SELECT item_id, MAX(id) as max_id
         FROM auction_bids
         WHERE session_id = ?
         GROUP BY item_id
       ) t ON b.id = t.max_id`,
    )
    .all(sessionId) as Array<{
    item_id: number;
    member_id: number;
    member_name: string;
    amount: number;
  }>;

  const map = new Map<
    number,
    { memberId: number; memberName: string; amount: number }
  >();
  for (const row of rows) {
    map.set(row.item_id, {
      memberId: row.member_id,
      memberName: row.member_name,
      amount: row.amount,
    });
  }
  return map;
}

export function recordItemSale(input: {
  itemId: number;
  sessionId: number;
  itemName: string;
  quality: ItemQuality;
  soldPrice: number;
  winnerMemberId: number | null;
  winnerName: string | null;
  soldAt?: string;
}) {
  const key = normalizeItemNameKey(input.itemName);
  if (!key || !(input.soldPrice > 0)) return;

  const existing = ensureDb()
    .prepare(`SELECT id FROM auction_item_sale_history WHERE item_id = ?`)
    .get(input.itemId) as { id: number } | undefined;
  if (existing) return;

  ensureDb()
    .prepare(
      `INSERT INTO auction_item_sale_history
       (item_id, session_id, item_name, item_name_key, quality, sold_price, winner_member_id, winner_name, sold_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.itemId,
      input.sessionId,
      input.itemName.trim(),
      key,
      input.quality,
      input.soldPrice,
      input.winnerMemberId,
      input.winnerName,
      input.soldAt || nowIso(),
    );
}

function toPriceStats(
  name: string,
  row: { count: number; high: number | null; low: number | null; avg: number | null },
): ItemPriceStats | null {
  if (!row.count || row.high == null || row.low == null || row.avg == null) {
    return null;
  }
  return {
    name,
    count: row.count,
    high: Math.round(row.high * 100) / 100,
    low: Math.round(row.low * 100) / 100,
    avg: Math.round(row.avg * 100) / 100,
  };
}

export function getItemPriceStats(name: string): ItemPriceStats | null {
  const key = normalizeItemNameKey(name);
  if (!key) return null;
  const database = ensureDb();

  // Prefer dedicated history table; also include any sold items not yet backfilled.
  const row = database
    .prepare(
      `SELECT COUNT(*) as count,
              MAX(sold_price) as high,
              MIN(sold_price) as low,
              AVG(sold_price) as avg
       FROM (
         SELECT sold_price FROM auction_item_sale_history WHERE item_name_key = ?
         UNION ALL
         SELECT i.sold_price
         FROM auction_items i
         WHERE i.status = 'sold'
           AND i.sold_price IS NOT NULL
           AND i.sold_price > 0
           AND lower(replace(i.name, ' ', '')) = ?
           AND NOT EXISTS (
             SELECT 1 FROM auction_item_sale_history h WHERE h.item_id = i.id
           )
       )`,
    )
    .get(key, key) as {
    count: number;
    high: number | null;
    low: number | null;
    avg: number | null;
  };
  return toPriceStats(name.trim() || key, row);
}

/** Batch lookup price stats keyed by normalized item name. */
export function mapPriceStatsByNames(
  names: string[],
): Map<string, ItemPriceStats> {
  const keys = [
    ...new Set(
      names.map(normalizeItemNameKey).filter((k) => k.length > 0),
    ),
  ];
  const map = new Map<string, ItemPriceStats>();
  if (!keys.length) return map;

  const placeholders = keys.map(() => "?").join(",");
  const rows = ensureDb()
    .prepare(
      `SELECT item_name_key,
              MIN(item_name) as sample_name,
              COUNT(*) as count,
              MAX(sold_price) as high,
              MIN(sold_price) as low,
              AVG(sold_price) as avg
       FROM auction_item_sale_history
       WHERE item_name_key IN (${placeholders})
       GROUP BY item_name_key`,
    )
    .all(...keys) as Array<{
    item_name_key: string;
    sample_name: string;
    count: number;
    high: number | null;
    low: number | null;
    avg: number | null;
  }>;

  for (const row of rows) {
    const stats = toPriceStats(row.sample_name, row);
    if (stats) map.set(row.item_name_key, stats);
  }
  return map;
}

export function listItemSaleHistory(
  name: string,
  limit = 20,
): Array<{
  id: number;
  sessionId: number;
  itemName: string;
  soldPrice: number;
  winnerName: string | null;
  soldAt: string;
}> {
  const key = normalizeItemNameKey(name);
  if (!key) return [];
  const rows = ensureDb()
    .prepare(
      `SELECT id, session_id, item_name, sold_price, winner_name, sold_at
       FROM auction_item_sale_history
       WHERE item_name_key = ?
       ORDER BY sold_at DESC, id DESC
       LIMIT ?`,
    )
    .all(key, limit) as Array<{
    id: number;
    session_id: number;
    item_name: string;
    sold_price: number;
    winner_name: string | null;
    sold_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    itemName: r.item_name,
    soldPrice: r.sold_price,
    winnerName: r.winner_name,
    soldAt: r.sold_at,
  }));
}

export function getItemById(
  id: number,
  opts?: { includeImages?: boolean },
): AuctionItem | null {
  const includeImages = opts?.includeImages === true;
  const row = ensureDb()
    .prepare(
      includeImages
        ? `SELECT ${ITEM_COLUMNS}, auction_items.image_data, m.name AS winner_name
           FROM auction_items
           LEFT JOIN members m ON m.id = auction_items.winner_member_id
           WHERE auction_items.id = ?`
        : `SELECT ${ITEM_COLUMNS}, m.name AS winner_name
           FROM auction_items
           LEFT JOIN members m ON m.id = auction_items.winner_member_id
           WHERE auction_items.id = ?`,
    )
    .get(id) as ItemRow | undefined;
  return row
    ? toItem(row, { includeImages, winnerName: row.winner_name ?? null })
    : null;
}

export function getItemImageData(itemId: number): string | null {
  const row = ensureDb()
    .prepare(`SELECT image_data FROM auction_items WHERE id = ?`)
    .get(itemId) as { image_data: string | null } | undefined;
  return row?.image_data ?? null;
}

export function createAuctionItem(input: {
  sessionId: number;
  name: string;
  quality: ItemQuality;
  startPrice: number;
  bidIncrement: number;
  imageData?: string | null;
  dividendMemberIds: number[];
  bidMin?: number | null;
  bidMax?: number | null;
}): AuctionItem {
  const database = ensureDb();
  const maxOrder = database
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM auction_items WHERE session_id = ?`,
    )
    .get(input.sessionId) as { max_order: number };

  const pink = isPinkAuction(input.quality);
  const bidMin = pink ? (input.bidMin ?? input.startPrice) : null;
  const bidMax = pink ? (input.bidMax ?? null) : null;
  const startPrice = pink ? (bidMin ?? input.startPrice) : input.startPrice;
  const imageData = input.imageData ?? null;
  const hasImage = Boolean(imageData && imageData.length > 32);

  const result = database
    .prepare(
      `INSERT INTO auction_items
       (session_id, name, quality, start_price, bid_increment, image_data, has_image, sort_order, current_price, bid_min, bid_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.sessionId,
      input.name.trim(),
      input.quality,
      startPrice,
      input.bidIncrement,
      imageData,
      hasImage ? 1 : 0,
      maxOrder.max_order + 1,
      startPrice,
      bidMin,
      bidMax,
    );

  const itemId = Number(result.lastInsertRowid);
  const insertDiv = database.prepare(
    `INSERT INTO auction_item_dividends (item_id, member_id) VALUES (?, ?)`,
  );
  const tx = database.transaction((ids: number[]) => {
    for (const memberId of ids) {
      insertDiv.run(itemId, memberId);
    }
  });
  tx(input.dividendMemberIds);

  return getItemById(itemId)!;
}

export function deleteAuctionItem(itemId: number): boolean {
  const item = getItemById(itemId);
  if (!item || item.status === "active" || item.status === "sold" || item.status === "voting" || item.status === "rolling") return false;
  const database = ensureDb();
  database
    .prepare(`DELETE FROM auction_item_dividends WHERE item_id = ?`)
    .run(itemId);
  database.prepare(`DELETE FROM auction_item_votes WHERE item_id = ?`).run(itemId);
  database.prepare(`DELETE FROM auction_item_rolls WHERE item_id = ?`).run(itemId);
  const result = database
    .prepare(`DELETE FROM auction_items WHERE id = ?`)
    .run(itemId);
  return result.changes > 0;
}

export function addEvent(
  sessionId: number,
  kind: string,
  message: string,
): void {
  ensureDb()
    .prepare(
      `INSERT INTO auction_events (session_id, kind, message) VALUES (?, ?, ?)`,
    )
    .run(sessionId, kind, message);
}

export function listEvents(sessionId: number, limit = 20): AuctionEvent[] {
  const rows = ensureDb()
    .prepare(
      `SELECT id, session_id, kind, message, created_at
       FROM auction_events WHERE session_id = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(sessionId, limit) as Array<{
    id: number;
    session_id: number;
    kind: string;
    message: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    kind: r.kind,
    message: r.message,
    createdAt: r.created_at,
  }));
}

export function listBids(sessionId: number, limit = 30): AuctionBid[] {
  const rows = ensureDb()
    .prepare(
      `SELECT b.*, m.name as member_name
       FROM auction_bids b
       JOIN members m ON m.id = b.member_id
       WHERE b.session_id = ?
       ORDER BY b.id DESC LIMIT ?`,
    )
    .all(sessionId, limit) as Array<{
    id: number;
    session_id: number;
    item_id: number;
    member_id: number;
    member_name: string;
    amount: number;
    is_anonymous: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    itemId: r.item_id,
    memberId: r.member_id,
    memberName: r.member_name,
    amount: r.amount,
    isAnonymous: false,
    createdAt: r.created_at,
  }));
}

export function countBidsForItem(itemId: number): number {
  const row = ensureDb()
    .prepare(`SELECT COUNT(*) as count FROM auction_bids WHERE item_id = ?`)
    .get(itemId) as { count: number };
  return row.count;
}

export function listStandingBids(itemId: number) {
  const rows = ensureDb()
    .prepare(
      `SELECT b.member_id as memberId, m.name as memberName, b.amount
       FROM auction_bids b
       JOIN members m ON m.id = b.member_id
       WHERE b.item_id = ?
         AND b.id = (
           SELECT MAX(b2.id) FROM auction_bids b2
           WHERE b2.item_id = b.item_id AND b2.member_id = b.member_id
         )
       ORDER BY b.amount DESC, b.id ASC`,
    )
    .all(itemId) as Array<{
    memberId: number;
    memberName: string;
    amount: number;
  }>;
  return rows;
}

function listItemVotes(itemId: number) {
  return ensureDb()
    .prepare(
      `SELECT voter_member_id as voterId, candidate_member_id as candidateId
       FROM auction_item_votes WHERE item_id = ?`,
    )
    .all(itemId) as Array<{ voterId: number; candidateId: number }>;
}

function listItemRolls(itemId: number) {
  return ensureDb()
    .prepare(
      `SELECT r.member_id as memberId, m.name as memberName, r.points
       FROM auction_item_rolls r
       JOIN members m ON m.id = r.member_id
       WHERE r.item_id = ?
       ORDER BY r.points DESC, r.id ASC`,
    )
    .all(itemId) as Array<{
    memberId: number;
    memberName: string;
    points: number;
  }>;
}

function secondsFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function finishPinkItem(
  item: AuctionItem,
  result: { memberId: number; amount: number; reason: string },
) {
  const winner = getMemberById(result.memberId);
  ensureDb()
    .prepare(
      `UPDATE auction_items
       SET status = 'sold', winner_member_id = ?, sold_price = ?, current_price = ?, closed_at = ?
       WHERE id = ?`,
    )
    .run(result.memberId, result.amount, result.amount, nowIso(), item.id);
  recordItemSale({
    itemId: item.id,
    sessionId: item.sessionId,
    itemName: item.name,
    quality: item.quality,
    soldPrice: result.amount,
    winnerMemberId: result.memberId,
    winnerName: winner?.name ?? null,
  });
  const reasonLabel =
    result.reason === "votes"
      ? "投票"
      : result.reason === "price"
        ? "同票价高"
        : "掷点";
  addEvent(
    item.sessionId,
    "sold",
        `${item.name} 成交 ¥${result.amount}，得主 ${winner?.name ?? "未知"}（特殊粉色·${reasonLabel}）`,
  );
}

function unsoldPinkItem(item: AuctionItem) {
  ensureDb()
    .prepare(
      `UPDATE auction_items SET status = 'unsold', closed_at = ? WHERE id = ?`,
    )
    .run(nowIso(), item.id);
  addEvent(item.sessionId, "unsold", `${item.name} 流拍（粉色无有效出价）`);
}

function beginPinkVote(itemId: number) {
  const item = getItemById(itemId);
  if (!item || item.status !== "active" || !isPinkAuction(item.quality)) {
    return null;
  }
  const bids = listStandingBids(itemId);
  if (!bids.length) {
    unsoldPinkItem(item);
    return getItemById(itemId);
  }
  ensureDb()
    .prepare(
      `UPDATE auction_items
       SET status = 'voting', vote_ends_at = ?
       WHERE id = ?`,
    )
    .run(secondsFromNow(PINK_VOTE_SECONDS), itemId);
  addEvent(
    item.sessionId,
    "vote",
    `${item.name} 出价结束，参与者开始匿名投票（${PINK_VOTE_SECONDS} 秒）`,
  );
  return getItemById(itemId);
}

function applyPinkContest(itemId: number, rollClosed: boolean) {
  const item = getItemById(itemId);
  if (!item || (item.status !== "voting" && item.status !== "rolling")) {
    return null;
  }
  const bids = listStandingBids(itemId);
  const votes = listItemVotes(itemId);
  const rolls = listItemRolls(itemId);
  const voteClosed =
    item.status === "rolling" ||
    item.status === "voting";
  // voteClosed true when resolving from timeout or all votes; caller decides.
  const result = resolvePinkContest({
    bids,
    votes,
    rolls,
    voteClosed,
    rollClosed,
  });
  if (result.kind === "unsold") {
    unsoldPinkItem(item);
    finishSessionIfIdle(item.sessionId);
    return getItemById(itemId);
  }
  if (result.kind === "wait_votes") return item;
  if (result.kind === "wait_roll") {
    if (item.status !== "rolling") {
      ensureDb()
        .prepare(
          `UPDATE auction_items
           SET status = 'rolling', roll_ends_at = ?
           WHERE id = ?`,
        )
        .run(secondsFromNow(PINK_ROLL_SECONDS), itemId);
      addEvent(
        item.sessionId,
        "roll",
        `${item.name} 同票同价，进入掷点（1–100，不可重复）`,
      );
    }
    return getItemById(itemId);
  }
  finishPinkItem(item, result);
  finishSessionIfIdle(item.sessionId);
  return getItemById(itemId);
}

export function resolvePinkVoting(itemId: number) {
  const item = getItemById(itemId);
  if (!item || item.status !== "voting") return null;
  const need =
    item.dividendMemberIds.length || getItemDividendIds(item.id).length;
  const cast = listItemVotes(itemId).length;
  const timedOut =
    Boolean(item.voteEndsAt) &&
    new Date(item.voteEndsAt!).getTime() <= Date.now();
  if (cast < need && !timedOut) return item;
  return applyPinkContest(itemId, false);
}

export function resolvePinkRolling(itemId: number) {
  const item = getItemById(itemId);
  if (!item || item.status !== "rolling") return null;
  const timedOut =
    Boolean(item.rollEndsAt) &&
    new Date(item.rollEndsAt!).getTime() <= Date.now();
  const bids = listStandingBids(itemId);
  const preview = resolvePinkContest({
    bids,
    votes: listItemVotes(itemId),
    rolls: listItemRolls(itemId),
    voteClosed: true,
    rollClosed: false,
  });
  if (preview.kind === "wait_roll" && !timedOut) return item;
  return applyPinkContest(itemId, timedOut || preview.kind !== "wait_roll");
}

export function castPinkVote(input: {
  itemId: number;
  voterMemberId: number;
  candidateMemberId: number;
}) {
  const item = getItemById(input.itemId);
  if (!item || item.status !== "voting") {
    throw new Error("当前不是投票阶段");
  }
  if (!item.dividendMemberIds.includes(input.voterMemberId)) {
    const roster = getItemDividendIds(item.id);
    if (!roster.includes(input.voterMemberId)) {
      throw new Error("仅本拍品参与者可以投票");
    }
  }
  const bids = listStandingBids(item.id);
  if (!bids.some((b) => b.memberId === input.candidateMemberId)) {
    throw new Error("只能投给已出价的参与者");
  }
  ensureDb()
    .prepare(
      `INSERT INTO auction_item_votes (item_id, voter_member_id, candidate_member_id)
       VALUES (?, ?, ?)
       ON CONFLICT(item_id, voter_member_id)
       DO UPDATE SET candidate_member_id = excluded.candidate_member_id`,
    )
    .run(item.id, input.voterMemberId, input.candidateMemberId);
  addEvent(
    item.sessionId,
    "vote",
    `${item.name} 收到一票（匿名）`,
  );
  resolvePinkVoting(item.id);
  return getItemById(item.id)!;
}

export function rollPinkPoints(input: { itemId: number; memberId: number }) {
  const item = getItemById(input.itemId);
  if (!item || item.status !== "rolling") {
    throw new Error("当前不是掷点阶段");
  }
  const preview = resolvePinkContest({
    bids: listStandingBids(item.id),
    votes: listItemVotes(item.id),
    rolls: listItemRolls(item.id),
    voteClosed: true,
    rollClosed: false,
  });
  const tied =
    preview.kind === "wait_roll" ? preview.memberIds : [];
  if (!tied.includes(input.memberId)) {
    throw new Error("只有平票平价的参与者可以掷点");
  }
  const existing = listItemRolls(item.id).find(
    (row) => row.memberId === input.memberId,
  );
  if (existing) {
    throw new Error(`你已经掷出 ${existing.points} 点`);
  }
  let points: number | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const taken = listItemRolls(item.id).map((row) => row.points);
    points = pickUnusedRoll(taken);
    if (points == null) throw new Error("点数已满");
    try {
      ensureDb()
        .prepare(
          `INSERT INTO auction_item_rolls (item_id, member_id, points) VALUES (?, ?, ?)`,
        )
        .run(item.id, input.memberId, points);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE/i.test(msg)) throw err;
      points = null;
    }
  }
  if (points == null) throw new Error("掷点失败，请再试一次");
  const member = getMemberById(input.memberId);
  addEvent(
    item.sessionId,
    "roll",
    `${member?.name ?? "参与者"} 掷出 ${points} 点`,
  );
  resolvePinkRolling(item.id);
  return { points, item: getItemById(item.id)! };
}

export function attachPinkRoomFields(
  item: AuctionItem,
  viewerMemberId?: number,
): AuctionItem {
  if (!isPinkAuction(item.quality)) return item;
  if (
    item.status !== "active" &&
    item.status !== "voting" &&
    item.status !== "rolling" &&
    item.status !== "sold"
  ) {
    return item;
  }
  const standingBids = listStandingBids(item.id);
  const votes = listItemVotes(item.id);
  const rolls = listItemRolls(item.id);
  const myVote =
    viewerMemberId != null
      ? (votes.find((v) => v.voterId === viewerMemberId)?.candidateId ?? null)
      : null;
  const myRoll =
    viewerMemberId != null
      ? (rolls.find((r) => r.memberId === viewerMemberId)?.points ?? null)
      : null;
  const contest = resolvePinkContest({
    bids: standingBids,
    votes,
    rolls,
    voteClosed: item.status === "rolling" || item.status === "sold",
    rollClosed: item.status === "sold",
  });
  const tiedMemberIds =
    contest.kind === "wait_roll" ? contest.memberIds : [];
  return {
    ...item,
    standingBids,
    voteCastCount: votes.length,
    voteNeed:
      item.dividendMemberIds.length || getItemDividendIds(item.id).length,
    myVoteCandidateId: myVote,
    myRollPoints: myRoll,
    tiedMemberIds,
    rolls: item.status === "rolling" || item.status === "sold" ? rolls : [],
  };
}

function nowIso() {
  return new Date().toISOString();
}

export function activateAllPendingItems(sessionId: number): AuctionItem[] {
  const database = ensureDb();
  const pending = database
    .prepare(
      `SELECT * FROM auction_items
       WHERE session_id = ? AND status = 'pending'
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(sessionId) as ItemRow[];

  if (pending.length === 0) {
    database
      .prepare(
        `UPDATE auction_sessions SET current_item_id = NULL WHERE id = ?`,
      )
      .run(sessionId);
    return [];
  }

  const activatedAt = nowIso();
  const update = database.prepare(
    `UPDATE auction_items
     SET status = 'active', activated_at = ?, current_price = start_price
     WHERE id = ?`,
  );
  const tx = database.transaction(() => {
    for (const row of pending) {
      update.run(activatedAt, row.id);
    }
    database
      .prepare(
        `UPDATE auction_sessions SET current_item_id = ? WHERE id = ?`,
      )
      .run(pending[0].id, sessionId);
  });
  tx();

  addEvent(
    sessionId,
    "item",
    `本场 ${pending.length} 件拍品同时开拍`,
  );
  return pending.map((row) => getItemById(row.id)!).filter(Boolean);
}

/** @deprecated sequential mode; prefer activateAllPendingItems */
export function activateNextItem(sessionId: number): AuctionItem | null {
  const activated = activateAllPendingItems(sessionId);
  return activated[0] ?? null;
}

export function closeItem(itemId: number): AuctionItem | null {
  const item = getItemById(itemId);
  if (!item || item.status !== "active") return null;

  if (isPinkAuction(item.quality)) {
    return beginPinkVote(itemId);
  }

  const topBid = ensureDb()
    .prepare(
      `SELECT member_id, amount FROM auction_bids
       WHERE item_id = ? ORDER BY amount DESC, id ASC LIMIT 1`,
    )
    .get(item.id) as { member_id: number; amount: number } | undefined;

  if (topBid) {
    ensureDb()
      .prepare(
        `UPDATE auction_items
         SET status = 'sold', winner_member_id = ?, sold_price = ?, current_price = ?, closed_at = ?
         WHERE id = ?`,
      )
      .run(topBid.member_id, topBid.amount, topBid.amount, nowIso(), item.id);
    const winner = getMemberById(topBid.member_id);
    recordItemSale({
      itemId: item.id,
      sessionId: item.sessionId,
      itemName: item.name,
      quality: item.quality,
      soldPrice: topBid.amount,
      winnerMemberId: topBid.member_id,
      winnerName: winner?.name ?? null,
    });
    addEvent(
      item.sessionId,
      "sold",
      `${item.name} 成交 ¥${topBid.amount}，得主 ${winner?.name ?? "未知"}`,
    );
  } else {
    ensureDb()
      .prepare(
        `UPDATE auction_items SET status = 'unsold', closed_at = ? WHERE id = ?`,
      )
      .run(nowIso(), item.id);
    addEvent(item.sessionId, "unsold", `${item.name} 流拍`);
  }

  return getItemById(item.id);
}

export function sessionHasOpenFloor(sessionId: number) {
  const row = ensureDb()
    .prepare(
      `SELECT COUNT(*) as count FROM auction_items
       WHERE session_id = ?
         AND status IN ('active', 'voting', 'rolling')`,
    )
    .get(sessionId) as { count: number };
  return row.count > 0;
}

export function closeAllActiveItems(sessionId: number): void {
  const active = ensureDb()
    .prepare(
      `SELECT id FROM auction_items WHERE session_id = ? AND status = 'active'`,
    )
    .all(sessionId) as Array<{ id: number }>;
  for (const row of active) {
    closeItem(row.id);
  }
}

function finishSessionIfIdle(sessionId: number): AuctionSession {
  if (sessionHasOpenFloor(sessionId)) {
    return getSessionById(sessionId)!;
  }

  ensureDb()
    .prepare(
      `UPDATE auction_items SET status = 'cancelled', closed_at = ?
       WHERE session_id = ? AND status = 'pending'`,
    )
    .run(nowIso(), sessionId);

  ensureDb()
    .prepare(
      `UPDATE auction_sessions
       SET status = 'ended', ends_at = COALESCE(ends_at, ?), current_item_id = NULL
       WHERE id = ?`,
    )
    .run(nowIso(), sessionId);

  addEvent(sessionId, "system", "拍卖已结束");
  return getSessionById(sessionId)!;
}

export function endAuctionSession(sessionId: number): AuctionSession {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("拍卖场次不存在");

  closeAllActiveItems(sessionId);
  return finishSessionIfIdle(sessionId);
}

export function closeCurrentItem(sessionId: number): AuctionItem | null {
  const session = getSessionById(sessionId);
  if (!session?.currentItemId) return null;
  return closeItem(session.currentItemId);
}

export function startAuctionSession(
  sessionId: number,
  options?: { forceNow?: boolean },
): AuctionSession {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("拍卖场次不存在");
  if (session.status === "live") return session;
  if (session.status === "ended") throw new Error("场次已结束");

  const otherLive = ensureDb()
    .prepare(
      `SELECT id FROM auction_sessions WHERE status = 'live' AND id != ? LIMIT 1`,
    )
    .get(sessionId) as { id: number } | undefined;
  if (otherLive) {
    throw new Error("已有进行中的拍卖，请先结束再开始本场");
  }

  const items = listItems(sessionId);
  if (items.length === 0) throw new Error("请先添加拍品");

  const startedAt = new Date();
  const endsAt = new Date(
    startedAt.getTime() + session.durationMinutes * 60 * 1000,
  );

  ensureDb()
    .prepare(
      `UPDATE auction_sessions
       SET status = 'live', started_at = ?, ends_at = ?, scheduled_start = COALESCE(scheduled_start, ?)
       WHERE id = ?`,
    )
    .run(
      startedAt.toISOString(),
      endsAt.toISOString(),
      options?.forceNow ? startedAt.toISOString() : session.scheduledStart,
      sessionId,
    );

  addEvent(
    sessionId,
    "system",
    `拍卖开始，${items.length} 件拍品同时竞拍，时长 ${session.durationMinutes} 分钟`,
  );
  activateAllPendingItems(sessionId);
  return getSessionById(sessionId)!;
}

export function placeBid(input: {
  sessionId: number;
  itemId: number;
  memberId: number;
  amount: number;
}): { bid: AuctionBid; item: AuctionItem } {
  const session = getSessionById(input.sessionId);
  if (!session || session.status !== "live") {
    throw new Error("当前没有进行中的拍卖");
  }
  if (session.endsAt && new Date(session.endsAt).getTime() <= Date.now()) {
    endAuctionSession(input.sessionId);
    throw new Error("拍卖时间已结束");
  }

  const item = getItemById(input.itemId);
  if (!item || item.sessionId !== input.sessionId) {
    throw new Error("拍品不存在");
  }
  if (item.status !== "active") {
    throw new Error("该拍品当前不可出价");
  }

  const member = getMemberById(input.memberId);
  if (!member) throw new Error("成员不存在");
  if (member.status === "exited") throw new Error("该成员已清退，无法出价");

  if (isParticipantOnlyAuction(item.quality)) {
    if (!item.dividendMemberIds.includes(input.memberId)) {
      throw new Error(
        isOrdinaryPinkAuction(item.quality)
          ? ORDINARY_PINK_BID_DENIED
          : "粉色拍品仅该物品参与者可以出价",
      );
    }
  }

  if (isPinkAuction(item.quality)) {
    const low = item.bidMin ?? item.startPrice;
    const high = item.bidMax;
    if (high == null || !(high > low)) {
      throw new Error("粉色拍品未设置有效限价");
    }
    if (input.amount + 1e-9 < low || input.amount - 1e-9 > high) {
      throw new Error(`出价须在 ¥${low}～¥${high} 之间`);
    }

    ensureDb()
      .prepare(
        `INSERT INTO auction_bids (session_id, item_id, member_id, amount, is_anonymous)
         VALUES (?, ?, ?, ?, 0)`,
      )
      .run(input.sessionId, item.id, input.memberId, input.amount);

    const standing = listStandingBids(item.id);
    const top = standing[0]?.amount ?? input.amount;
    ensureDb()
      .prepare(`UPDATE auction_items SET current_price = ? WHERE id = ?`)
      .run(top, item.id);

    addEvent(
      input.sessionId,
      "bid",
      `${member.name} 出价 ¥${input.amount}（${item.name}）`,
    );

    const bidRow = ensureDb()
      .prepare(`SELECT * FROM auction_bids WHERE item_id = ? AND member_id = ? ORDER BY id DESC LIMIT 1`)
      .get(item.id, input.memberId) as {
      id: number;
      session_id: number;
      item_id: number;
      member_id: number;
      amount: number;
      is_anonymous: number;
      created_at: string;
    };
    const updated = getItemById(item.id)!;
    updated.leadingBidderId = standing[0]?.memberId ?? member.id;
    updated.leadingBidderName = standing[0]?.memberName ?? member.name;
    return {
      bid: {
        id: bidRow.id,
        sessionId: bidRow.session_id,
        itemId: bidRow.item_id,
        memberId: bidRow.member_id,
        memberName: member.name,
        amount: bidRow.amount,
        isAnonymous: false,
        createdAt: bidRow.created_at,
      },
      item: updated,
    };
  }

  const minAmount =
    item.currentPrice === item.startPrice &&
    !ensureDb()
      .prepare(`SELECT id FROM auction_bids WHERE item_id = ? LIMIT 1`)
      .get(item.id)
      ? item.startPrice
      : item.currentPrice + item.bidIncrement;

  if (input.amount + 1e-9 < minAmount) {
    throw new Error(`出价至少 ¥${minAmount}`);
  }

  const result = ensureDb()
    .prepare(
      `INSERT INTO auction_bids (session_id, item_id, member_id, amount, is_anonymous)
       VALUES (?, ?, ?, ?, 0)`,
    )
    .run(input.sessionId, item.id, input.memberId, input.amount);

  ensureDb()
    .prepare(`UPDATE auction_items SET current_price = ? WHERE id = ?`)
    .run(input.amount, item.id);

  // Soft extend session near the end when bids come in
  const settings = getAuctionSettings();
  if (session.endsAt) {
    const ends = new Date(session.endsAt).getTime();
    const remain = ends - Date.now();
    if (remain < settings.bidExtensionSeconds * 1000) {
      const newEnds = new Date(
        Date.now() + settings.bidExtensionSeconds * 1000,
      ).toISOString();
      ensureDb()
        .prepare(`UPDATE auction_sessions SET ends_at = ? WHERE id = ?`)
        .run(newEnds, input.sessionId);
    }
  }

  addEvent(
    input.sessionId,
    "bid",
    `${member.name} 出价 ¥${input.amount}（${item.name}）`,
  );

  // High-bid fanfare for the whole room (highest matching tier only)
  if (input.amount > 1000) {
    addEvent(
      input.sessionId,
      "bid_fanfare_1000",
      `大哥${member.name}牛逼！这件上品灵器非你莫属！`,
    );
  } else if (input.amount > 600) {
    addEvent(
      input.sessionId,
      "bid_fanfare_600",
      `${member.name}豪掷：¥${input.amount}，还有谁！`,
    );
  } else if (input.amount > 300) {
    addEvent(
      input.sessionId,
      "bid_fanfare_300",
      `${member.name}出价：¥${input.amount}，势必拿下这件物品`,
    );
  }

  const bidRow = ensureDb()
    .prepare(`SELECT * FROM auction_bids WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as {
    id: number;
    session_id: number;
    item_id: number;
    member_id: number;
    amount: number;
    is_anonymous: number;
    created_at: string;
  };

  const updated = getItemById(item.id)!;
  updated.leadingBidderId = member.id;
  updated.leadingBidderName = member.name;

  return {
    bid: {
      id: bidRow.id,
      sessionId: bidRow.session_id,
      itemId: bidRow.item_id,
      memberId: bidRow.member_id,
      memberName: member.name,
      amount: bidRow.amount,
      isAnonymous: false,
      createdAt: bidRow.created_at,
    },
    item: updated,
  };
}

export function advanceAuction(sessionId: number): AuctionSession {
  // Simultaneous mode: "next" is no longer used; ending closes all items.
  return endAuctionSession(sessionId);
}

export function maybeAutoProgress(sessionId: number): AuctionSession | null {
  const session = getSessionById(sessionId);
  if (!session) return null;

  if (session.status === "scheduled" && session.scheduledStart) {
    if (new Date(session.scheduledStart).getTime() <= Date.now()) {
      try {
        return startAuctionSession(sessionId);
      } catch {
        return session;
      }
    }
  }

  if (session.status === "live" && session.endsAt) {
    if (new Date(session.endsAt).getTime() <= Date.now()) {
      endAuctionSession(sessionId);
    }
  }

  const latest = getSessionById(sessionId);
  if (latest?.status === "live") {
    const voting = ensureDb()
      .prepare(
        `SELECT id FROM auction_items WHERE session_id = ? AND status = 'voting'`,
      )
      .all(sessionId) as Array<{ id: number }>;
    for (const row of voting) resolvePinkVoting(row.id);
    const rolling = ensureDb()
      .prepare(
        `SELECT id FROM auction_items WHERE session_id = ? AND status = 'rolling'`,
      )
      .all(sessionId) as Array<{ id: number }>;
    for (const row of rolling) resolvePinkRolling(row.id);
    return finishSessionIfIdle(sessionId);
  }

  return getSessionById(sessionId);
}

export function getBelowThresholdMemberIds(thresholdRatio?: number): number[] {
  const board = getLeaderboardBoard(thresholdRatio);
  return board.entries.filter((e) => e.belowThreshold).map((e) => e.memberId);
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function rebuildSessionDividendTotals(sessionId: number) {
  const database = ensureDb();
  const lineRows = database
    .prepare(
      `SELECT member_id, member_name, SUM(share_amount) as total
       FROM auction_item_dividend_lines
       WHERE session_id = ?
       GROUP BY member_id, member_name`,
    )
    .all(sessionId) as Array<{
    member_id: number | null;
    member_name: string;
    total: number;
  }>;

  // Totals are derived only from per-item lines (no separate temporary rows).
  database
    .prepare(`DELETE FROM auction_dividend_entries WHERE session_id = ?`)
    .run(sessionId);

  const insert = database.prepare(
    `INSERT INTO auction_dividend_entries
     (session_id, member_id, member_name, amount, is_temporary, note)
     VALUES (?, ?, ?, ?, 0, NULL)`,
  );

  const totals = new Map<
    string,
    { memberId: number | null; name: string; amount: number }
  >();
  for (const row of lineRows) {
    const key =
      row.member_id != null ? `id:${row.member_id}` : `name:${row.member_name}`;
    const prev = totals.get(key) ?? {
      memberId: row.member_id,
      name: row.member_name,
      amount: 0,
    };
    prev.amount += Number(row.total) || 0;
    totals.set(key, prev);
  }

  const tx = database.transaction(() => {
    for (const value of totals.values()) {
      insert.run(
        sessionId,
        value.memberId,
        value.name,
        roundMoney(value.amount),
      );
    }
    database
      .prepare(
        `UPDATE auction_sessions SET dividends_calculated = 1 WHERE id = ?`,
      )
      .run(sessionId);
  });
  tx();
}

export function listItemDividendLines(
  sessionId: number,
  belowThreshold?: Set<number>,
): ItemDividendLine[] {
  const rows = ensureDb()
    .prepare(
      `SELECT l.*, i.name as item_name
       FROM auction_item_dividend_lines l
       LEFT JOIN auction_items i ON i.id = l.item_id
       WHERE l.session_id = ?
       ORDER BY l.item_id ASC, l.share_amount DESC, l.id ASC`,
    )
    .all(sessionId) as Array<{
    id: number;
    session_id: number;
    item_id: number;
    item_name: string | null;
    member_id: number | null;
    member_name: string;
    sold_price: number;
    tax_rate: number;
    tax_amount: number;
    pool_amount: number;
    share_amount: number;
    is_temporary: number;
  }>;

  const below = belowThreshold ?? new Set(getBelowThresholdMemberIds());
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    itemId: r.item_id,
    itemName: r.item_name || `拍品#${r.item_id}`,
    memberId: r.member_id,
    memberName: r.member_name,
    soldPrice: r.sold_price,
    taxRate: r.tax_rate,
    taxAmount: r.tax_amount,
    poolAmount: r.pool_amount,
    shareAmount: r.share_amount,
    isTemporary: Boolean(r.is_temporary),
    belowThreshold: r.member_id != null ? below.has(r.member_id) : false,
  }));
}

export function getDividendReport(sessionId: number): DividendReport {
  const session = getSessionById(sessionId);
  const belowThresholdMemberIds = getBelowThresholdMemberIds();
  const below = new Set(belowThresholdMemberIds);
  const lines = listItemDividendLines(sessionId, below);
  const totals = listDividends(sessionId, below)
    .filter((d) => !d.isTemporary)
    .map((d) => ({
      ...d,
      belowThreshold: d.memberId != null ? below.has(d.memberId) : false,
    }));

  const linesByItem = new Map<number, ItemDividendLine[]>();
  for (const line of lines) {
    const list = linesByItem.get(line.itemId) ?? [];
    list.push(line);
    linesByItem.set(line.itemId, list);
  }

  const soldItems = listItems(sessionId, {
    includeImages: false,
    includeDividends: false,
  }).filter(
    (i) => i.status === "sold" && i.soldPrice != null && i.soldPrice > 0,
  );

  // Legacy sessions may have totals without per-item lines — require recalculation.
  const rawCalculated = isDividendsCalculated(sessionId);
  const calculated =
    rawCalculated && (lines.length > 0 || soldItems.length === 0);

  const taxRateHint =
    lines[0]?.taxRate ?? session?.taxRate ?? DEFAULT_AUCTION_TAX_RATE;
  const itemGroups: ItemDividendGroup[] = [];

  if (calculated) {
    // After calculation, list every sold item (even empty roster for editing).
    for (const item of soldItems) {
      const itemLines = linesByItem.get(item.id) ?? [];
      const soldPrice = Number(item.soldPrice) || itemLines[0]?.soldPrice || 0;
      const taxRate = itemLines[0]?.taxRate ?? taxRateHint;
      const taxAmount =
        itemLines[0]?.taxAmount ?? roundMoney(soldPrice * taxRate);
      const poolAmount =
        itemLines[0]?.poolAmount ?? roundMoney(soldPrice - taxAmount);
      itemGroups.push({
        itemId: item.id,
        itemName: item.name,
        soldPrice,
        taxRate,
        taxAmount,
        poolAmount,
        lines: itemLines,
      });
    }
  }

  // Include line groups not already covered (pre-calc leftovers / deleted items).
  for (const [itemId, itemLines] of linesByItem.entries()) {
    if (itemGroups.some((g) => g.itemId === itemId)) continue;
    const first = itemLines[0];
    itemGroups.push({
      itemId,
      itemName: first.itemName,
      soldPrice: first.soldPrice,
      taxRate: first.taxRate,
      taxAmount: first.taxAmount,
      poolAmount: first.poolAmount,
      lines: itemLines,
    });
  }

  const grossSales = itemGroups.reduce((s, g) => s + g.soldPrice, 0);
  const taxTotal = itemGroups.reduce((s, g) => s + g.taxAmount, 0);
  const dividendPool = itemGroups.reduce((s, g) => s + g.poolAmount, 0);
  const temporaryTotal = totals
    .filter((t) => t.isTemporary)
    .reduce((s, t) => s + t.amount, 0);
  const payoutTotal = totals.reduce((s, t) => s + t.amount, 0);
  const taxRate =
    itemGroups[0]?.taxRate ?? session?.taxRate ?? DEFAULT_AUCTION_TAX_RATE;

  const summary: DividendSummary = {
    soldCount: itemGroups.length,
    grossSales: roundMoney(grossSales),
    taxRate,
    taxTotal: roundMoney(taxTotal),
    dividendPool: roundMoney(dividendPool),
    payoutTotal: roundMoney(payoutTotal),
    temporaryTotal: roundMoney(temporaryTotal),
  };

  return {
    session,
    calculated,
    taxRate,
    itemGroups,
    totals,
    summary,
    belowThresholdMemberIds,
    thresholdPercent: getLeaderboardThresholdPercent(),
  };
}

export function calculateDividends(
  sessionId: number,
  taxRateOverride?: number,
): DividendReport {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("场次不存在");
  if (session.status !== "ended") {
    throw new Error("请先结束拍卖再计算分红");
  }

  const taxRate =
    taxRateOverride != null && Number.isFinite(taxRateOverride)
      ? normalizeAuctionTaxRate(taxRateOverride, session.taxRate)
      : session.taxRate;

  if (taxRateOverride != null) {
    updateSessionTaxRate(sessionId, taxRate);
  }

  const items = listItems(sessionId, { includeImages: false }).filter(
    (i) => i.status === "sold" && i.soldPrice != null && i.soldPrice > 0,
  );

  const database = ensureDb();
  database
    .prepare(`DELETE FROM auction_item_dividend_lines WHERE session_id = ?`)
    .run(sessionId);

  const insertLine = database.prepare(
    `INSERT INTO auction_item_dividend_lines
     (session_id, item_id, member_id, member_name, sold_price, tax_rate, tax_amount, pool_amount, share_amount, is_temporary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );

  const tx = database.transaction(() => {
    for (const item of items) {
      const soldPrice = Number(item.soldPrice) || 0;
      const taxAmount = roundMoney(soldPrice * taxRate);
      const poolAmount = roundMoney(soldPrice - taxAmount);
      const ids = item.dividendMemberIds;
      if (!ids.length) {
        // Still mark calculated; admin can add members per item afterwards.
        continue;
      }
      const rawShare = poolAmount / ids.length;
      let allocated = 0;
      ids.forEach((memberId, index) => {
        const member = getMemberById(memberId);
        if (!member) return;
        const isLast = index === ids.length - 1;
        const shareAmount = isLast
          ? roundMoney(poolAmount - allocated)
          : roundMoney(rawShare);
        allocated = roundMoney(allocated + shareAmount);
        insertLine.run(
          sessionId,
          item.id,
          member.id,
          member.name,
          soldPrice,
          taxRate,
          taxAmount,
          poolAmount,
          shareAmount,
        );
      });
    }
  });
  tx();

  rebuildSessionDividendTotals(sessionId);
  addEvent(
    sessionId,
    "dividend",
    `已计算分红（税率 ${(taxRate * 100).toFixed(1)}%）`,
  );
  return getDividendReport(sessionId);
}

export function setItemDividendMembers(
  itemId: number,
  memberIds: number[],
): DividendReport {
  const item = getItemById(itemId);
  if (!item) throw new Error("拍品不存在");
  if (item.status !== "sold") {
    throw new Error("仅已成交拍品可调整分红名单");
  }

  const uniqueIds = [...new Set(memberIds.map(Number).filter((id) => id > 0))];
  if (uniqueIds.length === 0) {
    throw new Error("请至少保留一名分红成员");
  }

  const database = ensureDb();
  const tx = database.transaction(() => {
    database
      .prepare(`DELETE FROM auction_item_dividends WHERE item_id = ?`)
      .run(itemId);
    const insert = database.prepare(
      `INSERT INTO auction_item_dividends (item_id, member_id) VALUES (?, ?)`,
    );
    for (const id of uniqueIds) {
      if (!getMemberById(id)) continue;
      insert.run(itemId, id);
    }
  });
  tx();

  // Recalculate only this item's lines if session already calculated
  if (!isDividendsCalculated(item.sessionId)) {
    return getDividendReport(item.sessionId);
  }

  const session = getSessionById(item.sessionId);
  const existing = listItemDividendLines(item.sessionId).find(
    (l) => l.itemId === itemId,
  );
  const taxRate =
    existing?.taxRate ?? session?.taxRate ?? DEFAULT_AUCTION_TAX_RATE;
  const soldPrice = Number(item.soldPrice) || 0;
  const taxAmount = roundMoney(soldPrice * taxRate);
  const poolAmount = roundMoney(soldPrice - taxAmount);

  database
    .prepare(
      `DELETE FROM auction_item_dividend_lines WHERE session_id = ? AND item_id = ?`,
    )
    .run(item.sessionId, itemId);

  const insertLine = database.prepare(
    `INSERT INTO auction_item_dividend_lines
     (session_id, item_id, member_id, member_name, sold_price, tax_rate, tax_amount, pool_amount, share_amount, is_temporary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  const rawShare = poolAmount / uniqueIds.length;
  let allocated = 0;
  uniqueIds.forEach((memberId, index) => {
    const member = getMemberById(memberId);
    if (!member) return;
    const isLast = index === uniqueIds.length - 1;
    const shareAmount = isLast
      ? roundMoney(poolAmount - allocated)
      : roundMoney(rawShare);
    allocated = roundMoney(allocated + shareAmount);
    insertLine.run(
      item.sessionId,
      itemId,
      member.id,
      member.name,
      soldPrice,
      taxRate,
      taxAmount,
      poolAmount,
      shareAmount,
    );
  });

  rebuildSessionDividendTotals(item.sessionId);
  addEvent(
    item.sessionId,
    "dividend",
    `已调整「${item.name}」分红名单（${uniqueIds.length} 人）`,
  );
  return getDividendReport(item.sessionId);
}

export function listDividends(
  sessionId: number,
  belowThreshold?: Set<number>,
): DividendEntry[] {
  const rows = ensureDb()
    .prepare(
      `SELECT * FROM auction_dividend_entries
       WHERE session_id = ? AND is_temporary = 0
       ORDER BY amount DESC, id ASC`,
    )
    .all(sessionId) as Array<{
    id: number;
    session_id: number;
    member_id: number | null;
    member_name: string;
    amount: number;
    is_temporary: number;
    note: string | null;
  }>;

  const below = belowThreshold ?? new Set(getBelowThresholdMemberIds());
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    memberId: r.member_id,
    memberName: r.member_name,
    amount: r.amount,
    isTemporary: false,
    note: r.note,
    belowThreshold: r.member_id != null ? below.has(r.member_id) : false,
  }));
}

export function matchNamesFromText(text: string): {
  matched: Member[];
  unrecognized: string[];
} {
  return matchParticipantNames(
    text
      .split(/[\s,，、|/\\;；\n\r\t:：]+/)
      .map((t) => t.trim())
      .filter(Boolean),
    text,
  );
}

/**
 * Match OCR participant name candidates against the guild roster.
 * `names` are structured OCR results (preferred for「未入库」display);
 * `rawText` is optional extra OCR blob used only to find more roster hits.
 */
export function matchParticipantNames(
  names: string[],
  rawText = "",
): {
  matched: Member[];
  unrecognized: string[];
} {
  const members = listMembers();
  const compactFull = `${names.join("")}${rawText}`.replace(/\s+/g, "");
  const compactLower = compactFull.toLowerCase();

  const matchedIds = new Set<number>();

  // Primary: each guild member name appearing inside OCR text / names
  for (const member of members) {
    const name = member.name.replace(/\s+/g, "");
    if (name.length < 2) continue;
    if (
      compactFull.includes(name) ||
      compactLower.includes(name.toLowerCase())
    ) {
      matchedIds.add(member.id);
    }
  }

  const skip =
    /贡献|获得|品级|战盟|名称|普通|守护|参与|战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|洪门|千帆/;

  const cleanedNames = names
    .map((n) =>
      n
        .replace(/\s+/g, "")
        .replace(/[0-9A-Za-z|｜]/g, "")
        .trim(),
    )
    .filter((n) => n.length >= 2 && n.length <= 12)
    .filter((n) => /^[\u4e00-\u9fff]+$/.test(n))
    .filter((n) => !skip.test(n));

  const unrecognized: string[] = [];

  for (const token of cleanedNames) {
    let hit = false;
    for (const member of members) {
      const name = member.name.replace(/\s+/g, "");
      if (name.length < 2) continue;
      if (
        token === name ||
        (token.length >= 2 && name.includes(token)) ||
        (name.length >= 2 && token.includes(name)) ||
        isNearName(token, name)
      ) {
        matchedIds.add(member.id);
        hit = true;
        break;
      }
    }
    if (hit) continue;
    if (!unrecognized.includes(token)) unrecognized.push(token);
  }

  return {
    matched: members.filter((m) => matchedIds.has(m.id)),
    unrecognized: unrecognized.filter((token) => {
      return !members.some((m) => {
        if (!matchedIds.has(m.id)) return false;
        const name = m.name.replace(/\s+/g, "");
        return (
          name.includes(token) ||
          token.includes(name) ||
          isNearName(token, name)
        );
      });
    }),
  };
}

function charOverlapRatio(a: string, b: string) {
  if (!a || !b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 0;
  const setA = new Set(a);
  let shared = 0;
  for (const ch of b) {
    if (setA.has(ch)) shared += 1;
  }
  return shared / Math.max(a.length, b.length);
}

/** Tolerate minor OCR glyph mistakes against roster names. */
function isNearName(token: string, name: string) {
  if (!token || !name) return false;
  if (Math.abs(token.length - name.length) > 1) return false;
  const ratio = charOverlapRatio(token, name);
  if (token.length <= 3) return token.length === name.length && ratio >= 0.5;
  return ratio >= 0.6;
}

/* -------------------- Leaderboard -------------------- */

type LeaderboardRow = {
  id: number;
  member_id: number;
  member_name: string;
  combat_power: number;
  ocr_name: string;
  image_data: string | null;
  updated_at: string;
};

export function upsertLeaderboardEntry(input: {
  memberId: number;
  memberName: string;
  combatPower: number;
  ocrName: string;
  imageData?: string | null;
}) {
  const member = getMemberById(input.memberId);
  if (!member || member.status === "exited") {
    throw new Error("该成员已清退，无法更新排行榜");
  }
  const imageData = input.imageData ?? null;
  const hasImage = Boolean(imageData && imageData.length > 32);
  ensureDb()
    .prepare(
      `INSERT INTO leaderboard_entries
         (member_id, member_name, combat_power, ocr_name, image_data, has_image, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(member_id) DO UPDATE SET
         member_name = excluded.member_name,
         combat_power = excluded.combat_power,
         ocr_name = excluded.ocr_name,
         image_data = excluded.image_data,
         has_image = excluded.has_image,
         updated_at = datetime('now')`,
    )
    .run(
      input.memberId,
      input.memberName,
      input.combatPower,
      input.ocrName,
      imageData,
      hasImage ? 1 : 0,
    );
}

export function deleteLeaderboardEntry(memberId: number): boolean {
  const result = ensureDb()
    .prepare(`DELETE FROM leaderboard_entries WHERE member_id = ?`)
    .run(memberId);
  return result.changes > 0;
}

const LEADERBOARD_THRESHOLD_PERCENT_KEY = "leaderboard_threshold_percent";

export function getLeaderboardThresholdPercent(): number {
  const row = ensureDb()
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get(LEADERBOARD_THRESHOLD_PERCENT_KEY) as { value: string } | undefined;
  if (!row) return DEFAULT_LEADERBOARD_THRESHOLD_PERCENT;
  return normalizeLeaderboardThresholdPercent(Number(row.value));
}

export function getLeaderboardThresholdRatio(): number {
  return percentToRatio(getLeaderboardThresholdPercent());
}

export function setLeaderboardThresholdPercent(percent: number): number {
  const value = normalizeLeaderboardThresholdPercent(percent);
  ensureDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(LEADERBOARD_THRESHOLD_PERCENT_KEY, String(value));
  return value;
}

export function getLeaderboardBoard(thresholdRatio?: number) {
  const ratio = Number.isFinite(thresholdRatio)
    ? percentToRatio(ratioToPercent(Number(thresholdRatio)))
    : getLeaderboardThresholdRatio();
  const rows = ensureDb()
    .prepare(
      `SELECT le.id, le.member_id, le.member_name, le.combat_power, le.ocr_name,
              le.has_image, le.updated_at, m.role as member_role
       FROM leaderboard_entries le
       LEFT JOIN members m ON m.id = le.member_id
       WHERE m.id IS NULL OR COALESCE(m.status, 'active') = 'active'
       ORDER BY le.combat_power DESC, le.updated_at ASC, le.id ASC`,
    )
    .all() as Array<{
    id: number;
    member_id: number;
    member_name: string;
    combat_power: number;
    ocr_name: string;
    has_image: number | null;
    updated_at: string;
    member_role: MemberRole | null;
  }>;

  const count = rows.length;
  const average =
    count === 0
      ? 0
      : rows.reduce((sum, row) => sum + row.combat_power, 0) / count;
  const threshold = average * ratio;

  const entries = rows.map((row, index) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    combatPower: row.combat_power,
    ocrName: row.ocr_name,
    hasImage: Boolean(row.has_image),
    role: (row.member_role || "normal") as MemberRole,
    updatedAt: row.updated_at,
    rank: index + 1,
    belowThreshold: count > 0 ? row.combat_power < threshold : false,
  }));

  return {
    entries,
    stats: {
      count,
      average: Math.round(average * 10) / 10,
      threshold: Math.round(threshold * 10) / 10,
      thresholdRatio: ratio,
    },
  };
}

export function getLeaderboardImage(memberId: number): string | null {
  const row = ensureDb()
    .prepare(
      `SELECT image_data FROM leaderboard_entries WHERE member_id = ?`,
    )
    .get(memberId) as { image_data: string | null } | undefined;
  return row?.image_data ?? null;
}

/* -------------------- Boss Timer -------------------- */

export const BOSS_VOTE_NEED_DEFAULT = 3;
export const BOSS_VOTE_NEED_MIN = 1;
export const BOSS_VOTE_NEED_MAX = 5;
/** @deprecated Use getBossVoteNeed() — kept for import compatibility. */
export const BOSS_VOTE_NEED = BOSS_VOTE_NEED_DEFAULT;
export const BOSS_VOTE_WINDOW_SECONDS = 10;
export const BOSS_PRESENCE_TTL_SECONDS = 45;

const BOSS_VOTE_NEED_KEY = "boss_vote_need";

function clampBossVoteNeed(n: number) {
  if (!Number.isFinite(n)) return BOSS_VOTE_NEED_DEFAULT;
  return Math.min(
    BOSS_VOTE_NEED_MAX,
    Math.max(BOSS_VOTE_NEED_MIN, Math.round(n)),
  );
}

export function getBossVoteNeed(): number {
  const row = ensureDb()
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get(BOSS_VOTE_NEED_KEY) as { value: string } | undefined;
  if (!row) return BOSS_VOTE_NEED_DEFAULT;
  return clampBossVoteNeed(Number(row.value));
}

export function setBossVoteNeed(n: number): number {
  const value = clampBossVoteNeed(n);
  ensureDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(BOSS_VOTE_NEED_KEY, String(value));
  return value;
}

type BossRow = {
  id: number;
  name: string;
  color: string;
  spawn_rate: number;
  interval_hours: number;
  last_kill_at: string | null;
  next_spawn_at: string | null;
  drops_note: string | null;
  drops_image: string | null;
  /** Present on lite queries that omit drops_image blob */
  has_drops_image?: number | boolean;
  sort_order: number;
  enabled: number;
};

type RoundRow = {
  id: number;
  boss_id: number;
  vote_type: "killed" | "not_spawned";
  status: "open" | "passed" | "expired";
  started_at: string;
  expires_at: string;
  resolved_at: string | null;
};

function remainingFrom(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function expireOpenRounds(database: Database.Database = ensureDb()) {
  const now = new Date().toISOString();
  const expiring = database
    .prepare(
      `SELECT r.id, r.boss_id, r.vote_type, b.name as boss_name,
              (SELECT COUNT(*) FROM boss_votes v WHERE v.round_id = r.id) as vote_count
       FROM boss_vote_rounds r
       JOIN bosses b ON b.id = r.boss_id
       WHERE r.status = 'open' AND r.expires_at <= ?`,
    )
    .all(now) as Array<{
    id: number;
    boss_id: number;
    vote_type: "killed" | "not_spawned";
    boss_name: string;
    vote_count: number;
  }>;

  database
    .prepare(
      `UPDATE boss_vote_rounds
       SET status = 'expired', resolved_at = ?
       WHERE status = 'open' AND expires_at <= ?`,
    )
    .run(now, now);

  for (const row of expiring) {
    const label = row.vote_type === "killed" ? "已击杀" : "未刷新";
    addBossChatSystem(
      `「${row.boss_name}」投票「${label}」超时未通过（${row.vote_count}人同意）`,
    );
  }
}

function getRoundVotes(roundId: number) {
  return ensureDb()
    .prepare(
      `SELECT member_id, member_name, created_at
       FROM boss_votes WHERE round_id = ? ORDER BY id ASC`,
    )
    .all(roundId) as Array<{
    member_id: number;
    member_name: string;
    created_at: string;
  }>;
}

function toRound(row: RoundRow): import("./types").BossVoteRound {
  const votes = getRoundVotes(row.id).map((v) => ({
    memberId: v.member_id,
    memberName: v.member_name,
    createdAt: v.created_at,
  }));
  return {
    id: row.id,
    bossId: row.boss_id,
    voteType: row.vote_type,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    votes,
    voteCount: votes.length,
    remainingSeconds: remainingFrom(row.expires_at) ?? 0,
  };
}

function getOpenRoundForBoss(bossId: number) {
  expireOpenRounds();
  const row = ensureDb()
    .prepare(
      `SELECT * FROM boss_vote_rounds
       WHERE boss_id = ? AND status = 'open'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(bossId) as RoundRow | undefined;
  return row ? toRound(row) : null;
}

function toBoss(
  row: BossRow,
  opts?: { includeImage?: boolean },
): import("./types").Boss {
  const includeImage = opts?.includeImage !== false;
  const hasDropsImage = includeImage
    ? Boolean(row.drops_image)
    : Boolean(row.has_drops_image ?? row.drops_image);
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    spawnRate: row.spawn_rate,
    intervalHours: row.interval_hours,
    lastKillAt: row.last_kill_at,
    nextSpawnAt: row.next_spawn_at,
    dropsNote: row.drops_note,
    dropsImage: includeImage ? (row.drops_image ?? null) : null,
    hasDropsImage,
    sortOrder: row.sort_order,
    enabled: Boolean(row.enabled),
    remainingSeconds: remainingFrom(row.next_spawn_at),
    activeRound: getOpenRoundForBoss(row.id),
    lastMark: getLastMarkForBoss(row.id),
  };
}

function getLastMarkForBoss(bossId: number): import("./types").BossLastMark | null {
  const row = ensureDb()
    .prepare(
      `SELECT * FROM boss_vote_rounds
       WHERE boss_id = ? AND status = 'passed'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(bossId) as RoundRow | undefined;
  if (!row) return null;
  const votes = getRoundVotes(row.id);
  if (!votes.length) return null;
  return {
    voteType: row.vote_type,
    at: row.resolved_at || row.started_at,
    members: votes.map((v) => ({
      memberId: v.member_id,
      memberName: v.member_name,
    })),
  };
}

const BOSS_LITE_SELECT = `
  id, name, color, spawn_rate, interval_hours, last_kill_at, next_spawn_at,
  drops_note, NULL as drops_image,
  CASE WHEN drops_image IS NOT NULL AND drops_image != '' THEN 1 ELSE 0 END as has_drops_image,
  sort_order, enabled
`;

export function listBosses(
  includeDisabled = false,
  opts?: { includeImages?: boolean },
) {
  expireOpenRounds();
  const includeImages = opts?.includeImages === true;
  const select = includeImages ? "*" : BOSS_LITE_SELECT;
  const rows = ensureDb()
    .prepare(
      includeDisabled
        ? `SELECT ${select} FROM bosses ORDER BY sort_order ASC, id ASC`
        : `SELECT ${select} FROM bosses WHERE enabled = 1 ORDER BY sort_order ASC, id ASC`,
    )
    .all() as BossRow[];
  return rows.map((row) => toBoss(row, { includeImage: includeImages }));
}

export function getBossById(id: number) {
  const row = ensureDb()
    .prepare(`SELECT * FROM bosses WHERE id = ?`)
    .get(id) as BossRow | undefined;
  return row ? toBoss(row) : null;
}

export function createBoss(input: {
  name: string;
  color?: string;
  spawnRate?: number;
  intervalHours?: number;
  dropsNote?: string;
  dropsImage?: string | null;
}) {
  const maxOrder = ensureDb()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) as m FROM bosses`)
    .get() as { m: number };
  const result = ensureDb()
    .prepare(
      `INSERT INTO bosses (name, color, spawn_rate, interval_hours, drops_note, drops_image, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name.trim(),
      input.color || "#c084fc",
      input.spawnRate ?? 50,
      input.intervalHours ?? 6,
      input.dropsNote ?? null,
      input.dropsImage ?? null,
      maxOrder.m + 1,
    );
  return getBossById(Number(result.lastInsertRowid))!;
}

export function updateBoss(
  id: number,
  data: Partial<{
    name: string;
    color: string;
    spawnRate: number;
    intervalHours: number;
    dropsNote: string | null;
    dropsImage: string | null;
    enabled: boolean;
    lastKillAt: string | null;
    nextSpawnAt: string | null;
  }>,
) {
  const current = ensureDb()
    .prepare(`SELECT * FROM bosses WHERE id = ?`)
    .get(id) as BossRow | undefined;
  if (!current) return null;

  ensureDb()
    .prepare(
      `UPDATE bosses SET
         name = ?, color = ?, spawn_rate = ?, interval_hours = ?,
         drops_note = ?, drops_image = ?, enabled = ?, last_kill_at = ?, next_spawn_at = ?
       WHERE id = ?`,
    )
    .run(
      data.name?.trim() ?? current.name,
      data.color ?? current.color,
      data.spawnRate ?? current.spawn_rate,
      data.intervalHours ?? current.interval_hours,
      data.dropsNote === undefined ? current.drops_note : data.dropsNote,
      data.dropsImage === undefined
        ? current.drops_image
        : data.dropsImage,
      data.enabled === undefined ? current.enabled : data.enabled ? 1 : 0,
      data.lastKillAt === undefined ? current.last_kill_at : data.lastKillAt,
      data.nextSpawnAt === undefined ? current.next_spawn_at : data.nextSpawnAt,
      id,
    );
  return getBossById(id);
}

export function deleteBoss(id: number) {
  const database = ensureDb();
  database.prepare(`DELETE FROM boss_votes WHERE boss_id = ?`).run(id);
  database.prepare(`DELETE FROM boss_vote_rounds WHERE boss_id = ?`).run(id);
  const result = database.prepare(`DELETE FROM bosses WHERE id = ?`).run(id);
  return result.changes > 0;
}

function applyPassedVote(bossId: number, voteType: "killed" | "not_spawned") {
  const boss = getBossById(bossId);
  if (!boss) return;
  const computed = computeTimerFromNow(boss.intervalHours, voteType);

  if (voteType === "killed") {
    updateBoss(bossId, {
      lastKillAt: computed.lastKillAt ?? null,
      nextSpawnAt: computed.nextSpawnAt,
    });
  } else {
    updateBoss(bossId, {
      nextSpawnAt: computed.nextSpawnAt,
    });
  }
}

export function castBossVote(input: {
  bossId: number;
  voteType: "killed" | "not_spawned";
  memberId: number;
  memberName: string;
}) {
  const boss = getBossById(input.bossId);
  if (!boss || !boss.enabled) throw new Error("BOSS 不存在或已停用");

  const database = ensureDb();
  const nowIso = new Date().toISOString();

  const run = database.transaction(() => {
    database
      .prepare(
        `UPDATE boss_vote_rounds
         SET status = 'expired', resolved_at = ?
         WHERE boss_id = ? AND status = 'open'`,
      )
      .run(nowIso, input.bossId);

    const inserted = database
      .prepare(
        `INSERT INTO boss_vote_rounds (boss_id, vote_type, status, started_at, expires_at, resolved_at)
         VALUES (?, ?, 'passed', ?, ?, ?)`,
      )
      .run(input.bossId, input.voteType, nowIso, nowIso, nowIso);

    database
      .prepare(
        `INSERT INTO boss_votes (round_id, boss_id, vote_type, member_id, member_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(inserted.lastInsertRowid),
        input.bossId,
        input.voteType,
        input.memberId,
        input.memberName,
        nowIso,
      );
  });
  run();

  applyPassedVote(input.bossId, input.voteType);
  const updated = getBossById(input.bossId)!;
  const label = input.voteType === "killed" ? "已击杀" : "未刷新";
  addBossChatSystem(
    `「${boss.name}」${input.memberName} 标记「${label}」已生效，倒计时已按当前时间重开（间隔 ${boss.intervalHours} 小时）`,
  );

  return {
    round: updated.activeRound,
    passed: true,
    voteCount: updated.lastMark?.members.length ?? 1,
    boss: updated,
  };
}

export function touchBossPresence(memberId: number, memberName: string) {
  ensureDb()
    .prepare(
      `INSERT INTO boss_presence (member_id, member_name, last_seen_at)
       VALUES (?, ?, ?)
       ON CONFLICT(member_id) DO UPDATE SET
         member_name = excluded.member_name,
         last_seen_at = excluded.last_seen_at`,
    )
    .run(memberId, memberName, new Date().toISOString());
}

export function getBossOnlineCount() {
  const cutoff = new Date(
    Date.now() - BOSS_PRESENCE_TTL_SECONDS * 1000,
  ).toISOString();
  const row = ensureDb()
    .prepare(
      `SELECT COUNT(*) as count FROM boss_presence WHERE last_seen_at >= ?`,
    )
    .get(cutoff) as { count: number };
  return row.count;
}

export function listBossChat(limit = 30) {
  const rows = ensureDb()
    .prepare(
      `SELECT * FROM boss_chat ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    member_id: number | null;
    member_name: string;
    message: string;
    created_at: string;
  }>;
  return rows
    .map((r) => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      message: r.message,
      createdAt: r.created_at,
    }))
    .reverse();
}

export function addBossChat(input: {
  memberId: number | null;
  memberName: string;
  message: string;
}) {
  const text = input.message.trim().slice(0, 200);
  if (!text) throw new Error("消息不能为空");
  const result = ensureDb()
    .prepare(
      `INSERT INTO boss_chat (member_id, member_name, message) VALUES (?, ?, ?)`,
    )
    .run(input.memberId, input.memberName, text);
  return listBossChat().find((m) => m.id === Number(result.lastInsertRowid))!;
}

function addBossChatSystem(message: string) {
  ensureDb()
    .prepare(
      `INSERT INTO boss_chat (member_id, member_name, message) VALUES (NULL, '系统', ?)`,
    )
    .run(message);
}

export function getBossRoomState(opts?: { includeImages?: boolean }) {
  expireOpenRounds();
  const bosses = listBosses(false, {
    includeImages: opts?.includeImages === true,
  });
  // Soonest refresh first; unset timers last
  bosses.sort((a, b) => {
    const ra = a.remainingSeconds;
    const rb = b.remainingSeconds;
    if (ra == null && rb == null) return a.sortOrder - b.sortOrder || a.id - b.id;
    if (ra == null) return 1;
    if (rb == null) return -1;
    if (ra !== rb) return ra - rb;
    return a.sortOrder - b.sortOrder || a.id - b.id;
  });
  return {
    bosses,
    onlineCount: getBossOnlineCount(),
    chat: listBossChat(40),
    serverNow: new Date().toISOString(),
    voteNeed: getBossVoteNeed(),
    voteWindowSeconds: BOSS_VOTE_WINDOW_SECONDS,
  };
}

/** Drops payload for on-demand lightbox (avoids shipping images on every poll). */
export function getBossDrops(id: number) {
  const row = ensureDb()
    .prepare(
      `SELECT id, name, drops_note, drops_image FROM bosses WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        name: string;
        drops_note: string | null;
        drops_image: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    dropsNote: row.drops_note,
    dropsImage: row.drops_image,
  };
}


