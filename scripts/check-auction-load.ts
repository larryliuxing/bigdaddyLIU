import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-auction-load-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const { buildRoomState } = await import("../src/lib/auction/room");
    const member = db.createMember("负载测试");
    const session = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });
    const blob = `data:image/jpeg;base64,${"A".repeat(80_000)}`;
    const item = db.createAuctionItem({
      sessionId: session.id,
      name: "测试截图装",
      quality: "green",
      startPrice: 5,
      bidIncrement: 5,
      imageData: blob,
      dividendMemberIds: [member.id],
    });

    const listed = db.listItems(session.id, { includeImages: false });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].imageData, null);
    assert.equal(listed[0].hasImage, true);
    assert.equal(db.getItemImageData(item.id), blob);

    const room = buildRoomState(session.id, { lite: true });
    const payload = JSON.stringify(room);
    assert.equal(room.items[0].imageData, null);
    assert.equal(room.items[0].hasImage, true);
    assert.equal(payload.includes("data:image"), false);
    assert.equal(payload.includes(blob.slice(0, 40)), false);

    db.upsertLeaderboardEntry({
      memberId: member.id,
      memberName: member.name,
      combatPower: 1000,
      ocrName: member.name,
      imageData: blob,
    });
    const board = db.getLeaderboardBoard();
    assert.equal(board.entries[0].hasImage, true);
    assert.equal(
      JSON.stringify(board).includes("data:image"),
      false,
      "leaderboard board must not embed screenshots",
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("auction load checks passed");
}

void main();
