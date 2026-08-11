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
  AuctionSettings,
  DividendEntry,
  ItemQuality,
  Member,
  MemberRole,
  MemberRow,
} from "./types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "guild.db");

let db: Database.Database | null = null;

const DEFAULT_MEMBERS: Array<{ name: string; role: MemberRole }> = [
  { name: "辜饱饱", role: "leader" },
  { name: "清风", role: "normal" },
  { name: "毛毛", role: "normal" },
  { name: "阿胜", role: "officer" },
  { name: "大风起兮", role: "normal" },
  { name: "宇宙大魔王", role: "normal" },
  { name: "Hira", role: "normal" },
  { name: "马飞", role: "officer" },
  { name: "匿名的食铁兽战士", role: "normal" },
  { name: "小鱼", role: "normal" },
  { name: "夜行者", role: "normal" },
  { name: "星辰", role: "normal" },
  { name: "小龙龙", role: "normal" },
  { name: "丹", role: "normal" },
  { name: "安格斯牛堡", role: "normal" },
  { name: "熠珠", role: "normal" },
  { name: "唐小虎", role: "normal" },
];

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
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL UNIQUE,
      member_name TEXT NOT NULL,
      combat_power INTEGER NOT NULL,
      ocr_name TEXT NOT NULL,
      image_data TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(member_id) REFERENCES members(id)
    );
  `);

  seedIfEmpty(db);
  return db;
}

function seedIfEmpty(database: Database.Database) {
  const memberCount = database
    .prepare("SELECT COUNT(*) as count FROM members")
    .get() as { count: number };

  if (memberCount.count === 0) {
    const insert = database.prepare(
      "INSERT INTO members (name, role) VALUES (?, ?)",
    );
    const insertMany = database.transaction(
      (rows: Array<{ name: string; role: MemberRole }>) => {
        for (const row of rows) {
          insert.run(row.name, row.role);
        }
      },
    );
    insertMany(DEFAULT_MEMBERS);
  } else {
    const insertIgnore = database.prepare(
      "INSERT OR IGNORE INTO members (name, role) VALUES (?, ?)",
    );
    for (const row of DEFAULT_MEMBERS) {
      insertIgnore.run(row.name, row.role);
    }
  }

  const adminCount = database
    .prepare("SELECT COUNT(*) as count FROM admins")
    .get() as { count: number };

  if (adminCount.count === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const hash = bcrypt.hashSync(password, 10);
    database
      .prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
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
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    hasPassword: Boolean(row.password_hash),
    createdAt: row.created_at,
  };
}

export function listMembers(): Member[] {
  const rows = ensureDb()
    .prepare(
      "SELECT id, name, role, password_hash, created_at FROM members ORDER BY id ASC",
    )
    .all() as MemberRow[];
  return rows.map(toMember);
}

export function getMemberById(id: number): MemberRow | null {
  const row = ensureDb()
    .prepare(
      "SELECT id, name, role, password_hash, created_at FROM members WHERE id = ?",
    )
    .get(id) as MemberRow | undefined;
  return row ?? null;
}

export function getMemberByName(name: string): MemberRow | null {
  const row = ensureDb()
    .prepare(
      "SELECT id, name, role, password_hash, created_at FROM members WHERE name = ?",
    )
    .get(name.trim()) as MemberRow | undefined;
  return row ?? null;
}

export function createMember(name: string, role: MemberRole = "normal"): Member {
  const result = ensureDb()
    .prepare("INSERT INTO members (name, role) VALUES (?, ?)")
    .run(name.trim(), role);
  const row = getMemberById(Number(result.lastInsertRowid));
  if (!row) throw new Error("创建 member failed");
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

export function deleteMember(id: number): boolean {
  const result = ensureDb().prepare("DELETE FROM members WHERE id = ?").run(id);
  return result.changes > 0;
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

/* -------------------- Auction -------------------- */

type SessionRow = {
  id: number;
  status: AuctionSessionStatus;
  scheduled_start: string | null;
  started_at: string | null;
  ends_at: string | null;
  duration_minutes: number;
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
};

function toSession(row: SessionRow): AuctionSession {
  return {
    id: row.id,
    status: row.status,
    scheduledStart: row.scheduled_start,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
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

function toItem(row: ItemRow): AuctionItem {
  const dividendMemberIds = getItemDividendIds(row.id);
  const dividendMemberNames = dividendMemberIds
    .map((id) => getMemberById(id)?.name)
    .filter(Boolean) as string[];

  let winnerName: string | null = null;
  if (row.winner_member_id) {
    winnerName = getMemberById(row.winner_member_id)?.name ?? null;
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    quality: row.quality,
    startPrice: row.start_price,
    bidIncrement: row.bid_increment,
    imageData: row.image_data,
    sortOrder: row.sort_order,
    status: row.status,
    currentPrice: row.current_price,
    winnerMemberId: row.winner_member_id,
    winnerName,
    soldPrice: row.sold_price,
    activatedAt: row.activated_at,
    closedAt: row.closed_at,
    dividendMemberIds,
    dividendMemberNames,
  };
}

export function getAuctionSettings(): AuctionSettings {
  const row = ensureDb()
    .prepare(
      `SELECT id, default_start_time, duration_minutes, bid_extension_seconds, sound_enabled_default
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
  note?: string;
}): AuctionSession {
  const settings = getAuctionSettings();
  const duration = input?.durationMinutes ?? settings.durationMinutes;
  const result = ensureDb()
    .prepare(
      `INSERT INTO auction_sessions (status, scheduled_start, duration_minutes, note)
       VALUES ('draft', ?, ?, ?)`,
    )
    .run(input?.scheduledStart ?? null, duration, input?.note ?? null);
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
  data: { scheduledStart: string | null; durationMinutes?: number; note?: string },
): AuctionSession | null {
  const session = getSessionById(sessionId);
  if (!session || session.status === "live" || session.status === "ended") {
    return null;
  }
  ensureDb()
    .prepare(
      `UPDATE auction_sessions
       SET scheduled_start = ?, duration_minutes = ?, note = ?, status = ?
       WHERE id = ?`,
    )
    .run(
      data.scheduledStart,
      data.durationMinutes ?? session.durationMinutes,
      data.note ?? session.note,
      data.scheduledStart ? "scheduled" : "draft",
      sessionId,
    );
  return getSessionById(sessionId);
}

export function listItems(sessionId: number): AuctionItem[] {
  const rows = ensureDb()
    .prepare(
      `SELECT * FROM auction_items WHERE session_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(sessionId) as ItemRow[];
  return rows.map(toItem);
}

export function getItemById(id: number): AuctionItem | null {
  const row = ensureDb()
    .prepare(`SELECT * FROM auction_items WHERE id = ?`)
    .get(id) as ItemRow | undefined;
  return row ? toItem(row) : null;
}

export function createAuctionItem(input: {
  sessionId: number;
  name: string;
  quality: ItemQuality;
  startPrice: number;
  bidIncrement: number;
  imageData?: string | null;
  dividendMemberIds: number[];
}): AuctionItem {
  const database = ensureDb();
  const maxOrder = database
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM auction_items WHERE session_id = ?`,
    )
    .get(input.sessionId) as { max_order: number };

  const result = database
    .prepare(
      `INSERT INTO auction_items
       (session_id, name, quality, start_price, bid_increment, image_data, sort_order, current_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.sessionId,
      input.name.trim(),
      input.quality,
      input.startPrice,
      input.bidIncrement,
      input.imageData ?? null,
      maxOrder.max_order + 1,
      input.startPrice,
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
  if (!item || item.status === "active" || item.status === "sold") return false;
  const database = ensureDb();
  database
    .prepare(`DELETE FROM auction_item_dividends WHERE item_id = ?`)
    .run(itemId);
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
    isAnonymous: Boolean(r.is_anonymous),
    createdAt: r.created_at,
  }));
}

function nowIso() {
  return new Date().toISOString();
}

export function activateNextItem(sessionId: number): AuctionItem | null {
  const database = ensureDb();
  const next = database
    .prepare(
      `SELECT * FROM auction_items
       WHERE session_id = ? AND status = 'pending'
       ORDER BY sort_order ASC, id ASC LIMIT 1`,
    )
    .get(sessionId) as ItemRow | undefined;

  if (!next) {
    database
      .prepare(
        `UPDATE auction_sessions SET current_item_id = NULL WHERE id = ?`,
      )
      .run(sessionId);
    return null;
  }

  database
    .prepare(
      `UPDATE auction_items SET status = 'active', activated_at = ?, current_price = start_price WHERE id = ?`,
    )
    .run(nowIso(), next.id);
  database
    .prepare(
      `UPDATE auction_sessions SET current_item_id = ? WHERE id = ?`,
    )
    .run(next.id, sessionId);

  addEvent(sessionId, "item", `开始拍卖：${next.name}`);
  return getItemById(next.id);
}

export function closeCurrentItem(sessionId: number): AuctionItem | null {
  const session = getSessionById(sessionId);
  if (!session?.currentItemId) return null;
  const item = getItemById(session.currentItemId);
  if (!item || item.status !== "active") return null;

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
    addEvent(
      sessionId,
      "sold",
      `${item.name} 成交 ¥${topBid.amount}，得主 ${winner?.name ?? "未知"}`,
    );
  } else {
    ensureDb()
      .prepare(
        `UPDATE auction_items SET status = 'unsold', closed_at = ? WHERE id = ?`,
      )
      .run(nowIso(), item.id);
    addEvent(sessionId, "unsold", `${item.name} 流拍`);
  }

  return getItemById(item.id);
}

export function startAuctionSession(
  sessionId: number,
  options?: { forceNow?: boolean },
): AuctionSession {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("拍卖场次不存在");
  if (session.status === "live") return session;
  if (session.status === "ended") throw new Error("场次已结束");

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

  addEvent(sessionId, "system", `拍卖开始，时长 ${session.durationMinutes} 分钟`);
  activateNextItem(sessionId);
  return getSessionById(sessionId)!;
}

export function endAuctionSession(sessionId: number): AuctionSession {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("拍卖场次不存在");

  if (session.currentItemId) {
    closeCurrentItem(sessionId);
  }

  // mark remaining pending as cancelled
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

export function placeBid(input: {
  sessionId: number;
  memberId: number;
  amount: number;
  isAnonymous?: boolean;
}): { bid: AuctionBid; item: AuctionItem } {
  const session = getSessionById(input.sessionId);
  if (!session || session.status !== "live") {
    throw new Error("当前没有进行中的拍卖");
  }
  if (session.endsAt && new Date(session.endsAt).getTime() <= Date.now()) {
    endAuctionSession(input.sessionId);
    throw new Error("拍卖时间已结束");
  }
  if (!session.currentItemId) {
    throw new Error("当前没有可竞拍的拍品");
  }

  const item = getItemById(session.currentItemId);
  if (!item || item.status !== "active") {
    throw new Error("当前拍品不可出价");
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

  const member = getMemberById(input.memberId);
  if (!member) throw new Error("成员不存在");

  const result = ensureDb()
    .prepare(
      `INSERT INTO auction_bids (session_id, item_id, member_id, amount, is_anonymous)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.sessionId,
      item.id,
      input.memberId,
      input.amount,
      input.isAnonymous ? 1 : 0,
    );

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

  const displayName = input.isAnonymous ? "匿名" : member.name;
  addEvent(
    input.sessionId,
    "bid",
    `${displayName} 出价 ¥${input.amount}（${item.name}）`,
  );

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

  return {
    bid: {
      id: bidRow.id,
      sessionId: bidRow.session_id,
      itemId: bidRow.item_id,
      memberId: bidRow.member_id,
      memberName: member.name,
      amount: bidRow.amount,
      isAnonymous: Boolean(bidRow.is_anonymous),
      createdAt: bidRow.created_at,
    },
    item: getItemById(item.id)!,
  };
}

export function advanceAuction(sessionId: number): AuctionSession {
  const session = getSessionById(sessionId);
  if (!session || session.status !== "live") {
    throw new Error("当前没有进行中的拍卖");
  }

  if (session.endsAt && new Date(session.endsAt).getTime() <= Date.now()) {
    return endAuctionSession(sessionId);
  }

  closeCurrentItem(sessionId);
  const next = activateNextItem(sessionId);
  if (!next) {
    return endAuctionSession(sessionId);
  }
  return getSessionById(sessionId)!;
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
      return endAuctionSession(sessionId);
    }
  }

  return session;
}

export function calculateDividends(sessionId: number): DividendEntry[] {
  const session = getSessionById(sessionId);
  if (!session) throw new Error("场次不存在");
  if (session.status !== "ended") {
    throw new Error("请先结束拍卖再计算分红");
  }

  const items = listItems(sessionId).filter(
    (i) => i.status === "sold" && i.soldPrice != null,
  );
  const totals = new Map<number, { name: string; amount: number }>();

  for (const item of items) {
    const ids = item.dividendMemberIds;
    if (!ids.length || !item.soldPrice) continue;
    const share = item.soldPrice / ids.length;
    for (const memberId of ids) {
      const member = getMemberById(memberId);
      if (!member) continue;
      const prev = totals.get(memberId) ?? { name: member.name, amount: 0 };
      prev.amount += share;
      totals.set(memberId, prev);
    }
  }

  const database = ensureDb();
  database
    .prepare(`DELETE FROM auction_dividend_entries WHERE session_id = ? AND is_temporary = 0`)
    .run(sessionId);

  const insert = database.prepare(
    `INSERT INTO auction_dividend_entries (session_id, member_id, member_name, amount, is_temporary, note)
     VALUES (?, ?, ?, ?, 0, NULL)`,
  );
  const tx = database.transaction(() => {
    for (const [memberId, value] of totals.entries()) {
      insert.run(sessionId, memberId, value.name, roundMoney(value.amount));
    }
    database
      .prepare(
        `UPDATE auction_sessions SET dividends_calculated = 1 WHERE id = ?`,
      )
      .run(sessionId);
  });
  tx();

  addEvent(sessionId, "dividend", "已自动计算分红");
  return listDividends(sessionId);
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function listDividends(sessionId: number): DividendEntry[] {
  const rows = ensureDb()
    .prepare(
      `SELECT * FROM auction_dividend_entries WHERE session_id = ? ORDER BY amount DESC, id ASC`,
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

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    memberId: r.member_id,
    memberName: r.member_name,
    amount: r.amount,
    isTemporary: Boolean(r.is_temporary),
    note: r.note,
  }));
}

export function addTemporaryDividend(input: {
  sessionId: number;
  memberId?: number | null;
  memberName: string;
  amount: number;
  note?: string;
}): DividendEntry {
  if (!isDividendsCalculated(input.sessionId)) {
    throw new Error("请先完成自动分红计算");
  }

  const memberId = input.memberId ?? null;
  let memberName = input.memberName.trim();
  if (memberId) {
    const member = getMemberById(memberId);
    if (!member) throw new Error("成员不存在");
    memberName = member.name;
  }

  const result = ensureDb()
    .prepare(
      `INSERT INTO auction_dividend_entries
       (session_id, member_id, member_name, amount, is_temporary, note)
       VALUES (?, ?, ?, ?, 1, ?)`,
    )
    .run(
      input.sessionId,
      memberId,
      memberName,
      roundMoney(input.amount),
      input.note ?? "临时加人调整",
    );

  addEvent(
    input.sessionId,
    "dividend",
    `临时调整：${memberName} +¥${roundMoney(input.amount)}`,
  );

  const row = ensureDb()
    .prepare(`SELECT * FROM auction_dividend_entries WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as {
    id: number;
    session_id: number;
    member_id: number | null;
    member_name: string;
    amount: number;
    is_temporary: number;
    note: string | null;
  };

  return {
    id: row.id,
    sessionId: row.session_id,
    memberId: row.member_id,
    memberName: row.member_name,
    amount: row.amount,
    isTemporary: Boolean(row.is_temporary),
    note: row.note,
  };
}

export function updateDividendAmount(
  entryId: number,
  amount: number,
): DividendEntry | null {
  const existing = ensureDb()
    .prepare(`SELECT * FROM auction_dividend_entries WHERE id = ?`)
    .get(entryId) as
    | {
        id: number;
        session_id: number;
        member_id: number | null;
        member_name: string;
        amount: number;
        is_temporary: number;
        note: string | null;
      }
    | undefined;
  if (!existing) return null;

  ensureDb()
    .prepare(`UPDATE auction_dividend_entries SET amount = ? WHERE id = ?`)
    .run(roundMoney(amount), entryId);

  return {
    id: existing.id,
    sessionId: existing.session_id,
    memberId: existing.member_id,
    memberName: existing.member_name,
    amount: roundMoney(amount),
    isTemporary: Boolean(existing.is_temporary),
    note: existing.note,
  };
}

export function matchNamesFromText(text: string): {
  matched: Member[];
  unrecognized: string[];
} {
  const members = listMembers();
  const byName = new Map(members.map((m) => [m.name, m]));
  // Prefer longer names first to avoid partial collisions
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);

  const matchedIds = new Set<number>();
  const foundRaw = new Set<string>();

  for (const name of names) {
    if (text.includes(name)) {
      matchedIds.add(byName.get(name)!.id);
      foundRaw.add(name);
    }
  }

  // Also catch standalone tokens that look like names but aren't in roster
  const tokens = text
    .split(/[\s,，、|/\\;；\n\r\t:：]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1 && t.length <= 12);

  const unrecognized: string[] = [];
  for (const token of tokens) {
    if (/^[0-9.,]+$/.test(token)) continue;
    if (/贡献|获得|品级|战盟|名称|普通|守护|参与/.test(token)) continue;
    if (byName.has(token)) {
      matchedIds.add(byName.get(token)!.id);
      continue;
    }
    // Chinese-ish / latin nickname tokens not in roster
    if (/^[\u4e00-\u9fffA-Za-z0-9_·]+$/.test(token) && !foundRaw.has(token)) {
      if (!unrecognized.includes(token) && token.length >= 2) {
        unrecognized.push(token);
      }
    }
  }

  return {
    matched: members.filter((m) => matchedIds.has(m.id)),
    unrecognized,
  };
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
  ensureDb()
    .prepare(
      `INSERT INTO leaderboard_entries
         (member_id, member_name, combat_power, ocr_name, image_data, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(member_id) DO UPDATE SET
         member_name = excluded.member_name,
         combat_power = excluded.combat_power,
         ocr_name = excluded.ocr_name,
         image_data = excluded.image_data,
         updated_at = datetime('now')`,
    )
    .run(
      input.memberId,
      input.memberName,
      input.combatPower,
      input.ocrName,
      input.imageData ?? null,
    );
}

export function deleteLeaderboardEntry(memberId: number): boolean {
  const result = ensureDb()
    .prepare(`DELETE FROM leaderboard_entries WHERE member_id = ?`)
    .run(memberId);
  return result.changes > 0;
}

export function getLeaderboardBoard(thresholdRatio = 0.85) {
  const rows = ensureDb()
    .prepare(
      `SELECT * FROM leaderboard_entries ORDER BY combat_power DESC, updated_at ASC, id ASC`,
    )
    .all() as LeaderboardRow[];

  const count = rows.length;
  const average =
    count === 0
      ? 0
      : rows.reduce((sum, row) => sum + row.combat_power, 0) / count;
  const threshold = average * thresholdRatio;

  const entries = rows.map((row, index) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    combatPower: row.combat_power,
    ocrName: row.ocr_name,
    imageData: row.image_data,
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
      thresholdRatio,
    },
  };
}

