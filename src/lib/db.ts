import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import type { Member, MemberRole, MemberRow } from "./types";

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
];

function ensureDb(): Database.Database {
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
