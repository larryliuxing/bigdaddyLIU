import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-rename-"));
  try {
    process.chdir(tempDir);
    const {
      createMember,
      renameMember,
      getMemberById,
      upsertLeaderboardEntry,
      getLeaderboardBoard,
      listItemSaleHistory,
      ensureDb,
    } = await import("../src/lib/db");

    const alice = createMember("旧名字");
    const bob = createMember("别人");
    upsertLeaderboardEntry({
      memberId: alice.id,
      memberName: alice.name,
      combatPower: 8800,
      ocrName: "旧名字",
    });

    const db = ensureDb();
    db.prepare(
      `INSERT INTO auction_dividend_entries
         (session_id, member_id, member_name, amount, is_temporary)
       VALUES (1, ?, '旧名字', 12.5, 0)`,
    ).run(alice.id);
    db.prepare(
      `INSERT INTO auction_item_dividend_lines
         (session_id, item_id, member_id, member_name, sold_price, tax_rate,
          tax_amount, pool_amount, share_amount, is_temporary)
       VALUES (1, 1, ?, '旧名字', 100, 0.05, 5, 95, 12.5, 0)`,
    ).run(alice.id);
    db.prepare(
      `INSERT INTO auction_item_sale_history
         (item_id, session_id, item_name, item_name_key, quality, sold_price,
          winner_member_id, winner_name, sold_at)
       VALUES (1, 1, '测试武器', '测试武器', 'blue', 100, ?, '旧名字', datetime('now'))`,
    ).run(alice.id);
    db.prepare(
      `INSERT INTO boss_chat (member_id, member_name, message)
       VALUES (?, '旧名字', '来了')`,
    ).run(alice.id);
    db.prepare(
      `INSERT INTO boss_presence (member_id, member_name, last_seen_at)
       VALUES (?, '旧名字', datetime('now'))`,
    ).run(alice.id);

    const renamed = renameMember(alice.id, "  新名字  ");
    assert.ok(renamed);
    assert.equal(renamed.name, "新名字");
    assert.equal(getMemberById(alice.id)?.name, "新名字");

    const board = getLeaderboardBoard();
    assert.equal(board.entries.length, 1);
    assert.equal(board.entries[0].memberName, "新名字");
    assert.equal(board.entries[0].ocrName, "旧名字");

    const dividend = db
      .prepare(
        `SELECT member_name FROM auction_dividend_entries WHERE member_id = ?`,
      )
      .get(alice.id) as { member_name: string };
    assert.equal(dividend.member_name, "新名字");

    const line = db
      .prepare(
        `SELECT member_name FROM auction_item_dividend_lines WHERE member_id = ?`,
      )
      .get(alice.id) as { member_name: string };
    assert.equal(line.member_name, "新名字");

    const sales = listItemSaleHistory("测试武器");
    assert.equal(sales[0]?.winnerName, "新名字");

    const chat = db
      .prepare(`SELECT member_name FROM boss_chat WHERE member_id = ?`)
      .get(alice.id) as { member_name: string };
    assert.equal(chat.member_name, "新名字");

    const presence = db
      .prepare(`SELECT member_name FROM boss_presence WHERE member_id = ?`)
      .get(alice.id) as { member_name: string };
    assert.equal(presence.member_name, "新名字");

    const same = renameMember(alice.id, "新名字");
    assert.equal(same?.name, "新名字");

    assert.throws(() => renameMember(alice.id, "别人"), /name_taken/);
    assert.throws(() => renameMember(alice.id, "   "), /empty_name/);
    assert.throws(
      () => renameMember(alice.id, "一二三四五六七八九十一二三四五六七八九十一二三四五"),
      /name_too_long/,
    );
    assert.equal(renameMember(99999, "幽灵"), null);
    assert.equal(getMemberById(bob.id)?.name, "别人");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("admin rename member checks passed");
}

void main();
