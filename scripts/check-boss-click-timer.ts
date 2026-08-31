import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeTimerFromNow } from "../src/lib/boss/timer";

const HOUR_MS = 60 * 60 * 1000;
const nowMs = 1_700_000_000_000;

const killed = computeTimerFromNow(2, "killed", nowMs);
assert.equal(killed.lastKillAt, new Date(nowMs).toISOString());
assert.equal(killed.nextSpawnAt, new Date(nowMs + 2 * HOUR_MS).toISOString());

const notSpawned = computeTimerFromNow(6, "not_spawned", nowMs);
assert.equal("lastKillAt" in notSpawned, false);
assert.equal(
  notSpawned.nextSpawnAt,
  new Date(nowMs + 6 * HOUR_MS).toISOString(),
);

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-boss-click-"));
  try {
    process.chdir(tempDir);
    const { createBoss, createMember, castBossVote, getBossById } =
      await import("../src/lib/db");

    const memberA = createMember("张三");
    const memberB = createMember("李四");
    const boss = createBoss({
      name: "测试王",
      intervalHours: 2,
    });
    assert.equal(boss.lastMark, null);

    const beforeKill = Date.now();
    const kill = castBossVote({
      bossId: boss.id,
      voteType: "killed",
      memberId: memberA.id,
      memberName: memberA.name,
    });
    const afterKill = Date.now();
    assert.equal(kill.passed, true);

    const afterKilled = getBossById(boss.id)!;
    assert.ok(afterKilled.lastKillAt);
    assert.ok(afterKilled.nextSpawnAt);
    const killAt = new Date(afterKilled.lastKillAt!).getTime();
    const nextAt = new Date(afterKilled.nextSpawnAt!).getTime();
    assert.ok(killAt >= beforeKill - 50 && killAt <= afterKill + 50);
    assert.ok(
      Math.abs(nextAt - (killAt + 2 * HOUR_MS)) < 50,
      "killed nextSpawnAt should be now + interval",
    );
    assert.equal(afterKilled.lastMark?.voteType, "killed");
    assert.deepEqual(
      afterKilled.lastMark?.members.map((m) => m.memberName),
      ["张三"],
    );

    const prevKillAt = afterKilled.lastKillAt;
    const beforeMiss = Date.now();
    const miss = castBossVote({
      bossId: boss.id,
      voteType: "not_spawned",
      memberId: memberB.id,
      memberName: memberB.name,
    });
    const afterMiss = Date.now();
    assert.equal(miss.passed, true);

    const afterMissed = getBossById(boss.id)!;
    assert.equal(afterMissed.lastKillAt, prevKillAt);
    const missNext = new Date(afterMissed.nextSpawnAt!).getTime();
    assert.ok(missNext >= beforeMiss + 2 * HOUR_MS - 50);
    assert.ok(missNext <= afterMiss + 2 * HOUR_MS + 50);
    assert.equal(afterMissed.lastMark?.voteType, "not_spawned");
    assert.deepEqual(
      afterMissed.lastMark?.members.map((m) => m.memberName),
      ["李四"],
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("boss click timer checks passed");
}

void main();
