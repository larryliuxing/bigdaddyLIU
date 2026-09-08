import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-boss-vote-"));
  try {
    process.chdir(tempDir);
    const {
      createBoss,
      createMember,
      castBossVote,
      getBossById,
      setBossVoteNeed,
      getBossRoomState,
      updateBoss,
    } = await import("../src/lib/db");

    const memberA = createMember("张三");
    const memberB = createMember("李四");
    const memberC = createMember("王五");
    const boss = createBoss({
      name: "投票王",
      intervalHours: 2,
    });

    setBossVoteNeed(3);
    const first = castBossVote({
      bossId: boss.id,
      voteType: "killed",
      memberId: memberA.id,
      memberName: memberA.name,
    });
    assert.equal(first.passed, false);
    assert.equal(first.voteCount, 1);
    const open = getBossById(boss.id)!;
    assert.equal(open.activeRound?.voteCount, 1);
    assert.equal(open.lastMark, null);

    const second = castBossVote({
      bossId: boss.id,
      voteType: "killed",
      memberId: memberB.id,
      memberName: memberB.name,
    });
    assert.equal(second.passed, false);
    assert.equal(second.voteCount, 2);

    const third = castBossVote({
      bossId: boss.id,
      voteType: "killed",
      memberId: memberC.id,
      memberName: memberC.name,
    });
    assert.equal(third.passed, true);
    const passed = getBossById(boss.id)!;
    assert.equal(passed.activeRound, null);
    assert.equal(passed.lastMark?.source, "vote");
    assert.deepEqual(
      passed.lastMark?.members.map((m) => m.memberName),
      ["张三", "李四", "王五"],
    );

    const boss2 = createBoss({
      name: "反对王",
      intervalHours: 3,
    });
    setBossVoteNeed(3);
    castBossVote({
      bossId: boss2.id,
      voteType: "killed",
      memberId: memberA.id,
      memberName: memberA.name,
    });
    const opposed = castBossVote({
      bossId: boss2.id,
      voteType: "not_spawned",
      memberId: memberB.id,
      memberName: memberB.name,
    });
    assert.equal(opposed.passed, false);
    const afterOppose = getBossById(boss2.id)!;
    assert.equal(afterOppose.activeRound?.voteType, "not_spawned");
    assert.equal(afterOppose.activeRound?.voteCount, 1);
    assert.equal(afterOppose.lastMark, null);
    assert.equal(afterOppose.lastKillAt, null);

    const boss3 = createBoss({
      name: "超时王",
      intervalHours: 4,
    });
    setBossVoteNeed(3);
    castBossVote({
      bossId: boss3.id,
      voteType: "killed",
      memberId: memberA.id,
      memberName: memberA.name,
    });
    const db = new Database(path.join(tempDir, "data", "guild.db"));
    db.prepare(
      `UPDATE boss_vote_rounds SET expires_at = ? WHERE boss_id = ? AND status = 'open'`,
    ).run(new Date(Date.now() - 1000).toISOString(), boss3.id);
    db.close();
    getBossRoomState();
    const auto = getBossById(boss3.id)!;
    assert.equal(auto.lastMark?.source, "vote");
    assert.deepEqual(
      auto.lastMark?.members.map((m) => m.memberName),
      ["张三"],
    );
    assert.ok(auto.lastKillAt);
    assert.ok(auto.nextSpawnAt);

    const beforeAdmin = auto.lastKillAt;
    const maintained = updateBoss(
      boss3.id,
      {
        lastKillAt: new Date("2026-09-08T12:00:00.000Z").toISOString(),
        nextSpawnAt: new Date("2026-09-08T16:00:00.000Z").toISOString(),
      },
      { adminName: "admin" },
    );
    assert.ok(maintained);
    assert.notEqual(maintained!.lastKillAt, beforeAdmin);
    assert.equal(maintained!.lastMark?.source, "admin");
    assert.equal(maintained!.lastMark?.adminName, "admin");
    assert.deepEqual(maintained!.lastMark?.members, []);

    setBossVoteNeed(1);
    const boss4 = createBoss({ name: "一人王", intervalHours: 1 });
    const instant = castBossVote({
      bossId: boss4.id,
      voteType: "not_spawned",
      memberId: memberA.id,
      memberName: memberA.name,
    });
    assert.equal(instant.passed, true);
    const one = getBossById(boss4.id)!;
    assert.equal(one.lastMark?.source, "vote");
    assert.deepEqual(
      one.lastMark?.members.map((m) => m.memberName),
      ["张三"],
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("check-boss-vote-rules: ok");
}

void main();
