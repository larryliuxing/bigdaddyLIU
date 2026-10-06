import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  formatFundAmount,
  fundTransferredAtIso,
  parseFundAmount,
  parseFundDeposit,
  sumFundEntries,
} from "../src/lib/fund";

assert.equal(parseFundAmount(0), 0);
assert.equal(parseFundAmount("1234567"), 1234567);
assert.equal(parseFundAmount("1,234,567"), 1234567);
assert.equal(parseFundAmount("100万"), 1_000_000);
assert.equal(parseFundAmount("1.5万"), 15_000);
assert.equal(parseFundAmount(-1), null);
assert.equal(parseFundAmount("abc"), null);
assert.equal(parseFundDeposit(0), null);
assert.equal(parseFundDeposit("100万"), 1_000_000);
assert.equal(formatFundAmount(null), "尚未公示");
assert.equal(formatFundAmount(1234567), "1,234,567");
assert.equal(
  fundTransferredAtIso("2026-10-06", "15:30"),
  "2026-10-06T07:30:00.000Z",
);
assert.equal(
  sumFundEntries([
    {
      id: 1,
      amount: 100,
      transferredAt: "2026-10-01T07:00:00.000Z",
      createdBy: "admin",
    },
    {
      id: 2,
      amount: 250,
      transferredAt: "2026-10-06T07:30:00.000Z",
      createdBy: "admin",
    },
  ]).amount,
  350,
);

console.log("guild fund parse checks passed");

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-fund-"));
  try {
    process.chdir(tempDir);
    fs.mkdirSync("data");
    const raw = new Database(path.join("data", "guild.db"));
    raw.exec(
      `CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );
    raw
      .prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?)`)
      .run(
        "guild_fund",
        JSON.stringify({
          amount: 800000,
          updatedAt: "2026-10-05T08:00:00.000Z",
          updatedBy: "admin",
        }),
      );
    raw.close();

    const db = await import("../src/lib/db");
    const migrated = db.getGuildFund();
    assert.equal(migrated.amount, 800000);
    assert.equal(migrated.entries.length, 1);
    assert.equal(
      migrated.entries[0].transferredAt,
      "2026-10-05T08:00:00.000Z",
    );

    const saved = db.addGuildFundEntry({
      amount: 200000,
      transferredAt: "2026-10-06T07:30:00.000Z",
      createdBy: "admin",
    });
    assert.equal(saved.amount, 1_000_000);
    assert.equal(saved.entries.length, 2);
    assert.equal(saved.entries[0].amount, 200000);
    assert.equal(saved.entries[1].amount, 800000);

    const removed = db.deleteGuildFundEntry(saved.entries[0].id, {
      note: "记错金额，已作废",
      deletedBy: "admin",
    });
    assert.ok(removed);
    assert.equal(removed.amount, 800000);
    assert.equal(removed.entries.length, 1);
    assert.equal(removed.deletions.length, 1);
    assert.equal(removed.deletions[0].amount, 200000);
    assert.equal(removed.deletions[0].note, "记错金额，已作废");
    assert.equal(db.deleteGuildFundEntry(999999, { note: "没有这条", deletedBy: "admin" }), null);
    assert.throws(() =>
      db.deleteGuildFundEntry(removed.entries[0].id, {
        note: "   ",
        deletedBy: "admin",
      }),
    );

    const adjusted = db.updateGuildFundEntry({
      id: removed.entries[0].id,
      amount: 900000,
      transferredAt: "2026-10-05T09:00:00.000Z",
    });
    assert.ok(adjusted);
    assert.equal(adjusted.amount, 900000);
    assert.equal(adjusted.entries[0].transferredAt, "2026-10-05T09:00:00.000Z");
    assert.equal(adjusted.deletions.length, 1);

    assert.throws(() =>
      db.addGuildFundEntry({
        amount: 0,
        transferredAt: "2026-10-06T07:30:00.000Z",
        createdBy: "admin",
      }),
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("guild fund db checks passed");
}

void main();
