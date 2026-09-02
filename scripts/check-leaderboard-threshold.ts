import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
  formatThresholdPercentLabel,
  parseLeaderboardThresholdPercent,
  percentToRatio,
  ratioToPercent,
} from "../src/lib/leaderboard/threshold";

assert.equal(parseLeaderboardThresholdPercent(85), 85);
assert.equal(parseLeaderboardThresholdPercent("82.5"), 82.5);
assert.equal(parseLeaderboardThresholdPercent(0), null);
assert.equal(parseLeaderboardThresholdPercent(100.1), null);
assert.equal(parseLeaderboardThresholdPercent("abc"), null);
assert.equal(percentToRatio(85), 0.85);
assert.equal(ratioToPercent(0.85), 85);
assert.equal(formatThresholdPercentLabel(85), "85");
assert.equal(formatThresholdPercentLabel(82.5), "82.5");
assert.equal(DEFAULT_LEADERBOARD_THRESHOLD_PERCENT, 85);

console.log("leaderboard threshold checks passed");

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-lb-threshold-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const high = db.createMember("高战力");
    const low = db.createMember("低战力");
    db.upsertLeaderboardEntry({
      memberId: high.id,
      memberName: high.name,
      combatPower: 10000,
      ocrName: high.name,
    });
    db.upsertLeaderboardEntry({
      memberId: low.id,
      memberName: low.name,
      combatPower: 1000,
      ocrName: low.name,
    });

    db.setLeaderboardThresholdPercent(85);
    let board = db.getLeaderboardBoard();
    assert.equal(board.stats.thresholdRatio, 0.85);
    assert.equal(
      board.entries.find((e) => e.memberId === low.id)?.belowThreshold,
      true,
    );

    db.setLeaderboardThresholdPercent(10);
    board = db.getLeaderboardBoard();
    assert.equal(board.stats.thresholdRatio, 0.1);
    assert.equal(
      board.entries.find((e) => e.memberId === low.id)?.belowThreshold,
      false,
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("leaderboard threshold db checks passed");
}

void main();
