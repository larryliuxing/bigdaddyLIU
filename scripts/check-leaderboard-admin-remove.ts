import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-lb-remove-"));
  try {
    process.chdir(tempDir);
    const {
      createMember,
      upsertLeaderboardEntry,
      getLeaderboardBoard,
      deleteLeaderboardEntry,
    } = await import("../src/lib/db");

    const wrong = createMember("错误数据");
    const right = createMember("正确数据");
    upsertLeaderboardEntry({
      memberId: wrong.id,
      memberName: wrong.name,
      combatPower: 99999,
      ocrName: wrong.name,
    });
    upsertLeaderboardEntry({
      memberId: right.id,
      memberName: right.name,
      combatPower: 5000,
      ocrName: right.name,
    });

    let board = getLeaderboardBoard();
    assert.equal(board.entries.length, 2);
    assert.equal(board.entries[0].memberName, "错误数据");

    assert.equal(deleteLeaderboardEntry(wrong.id), true);
    assert.equal(deleteLeaderboardEntry(wrong.id), false);

    board = getLeaderboardBoard();
    assert.equal(board.entries.length, 1);
    assert.equal(board.entries[0].memberName, "正确数据");
    assert.equal(board.entries[0].rank, 1);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("leaderboard admin remove checks passed");
}

void main();
