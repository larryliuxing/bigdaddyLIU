import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-reauction-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");

    const member = db.createMember("重拍分红");
    const session = db.createDraftSession({
      scheduledStart: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 40,
      taxRate: 0.08,
    });
    const sword = db.createAuctionItem({
      sessionId: session.id,
      name: "重拍之剑",
      quality: "blue",
      startPrice: 10,
      bidIncrement: 5,
      dividendMemberIds: [member.id],
    });
    const image = `data:image/jpeg;base64,${"A".repeat(80)}`;
    db.setAuctionItemImage(sword.id, image);
    const bow = db.createAuctionItem({
      sessionId: session.id,
      name: "重拍之弓",
      quality: "special_pink",
      startPrice: 20,
      bidIncrement: 1,
      bidMin: 20,
      bidMax: 80,
      dividendMemberIds: [],
    });
    const shield = db.createAuctionItem({
      sessionId: session.id,
      name: "不重拍之盾",
      quality: "green",
      startPrice: 8,
      bidIncrement: 2,
      dividendMemberIds: [],
    });

    assert.throws(
      () =>
        db.reauctionSession({
          sourceSessionId: session.id,
          itemIds: [sword.id],
          scheduledStart: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      /只能重拍已完成的场次/,
    );

    db.startAuctionSession(session.id, { forceNow: true });
    db.endAuctionSession(session.id);
    db.ensureDb()
      .prepare(
        `UPDATE auction_items
         SET status = 'sold', winner_member_id = ?, sold_price = 99, current_price = 99
         WHERE id = ?`,
      )
      .run(member.id, sword.id);

    const when = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const partial = db.reauctionSession({
      sourceSessionId: session.id,
      itemIds: [bow.id, sword.id],
      scheduledStart: when,
      durationMinutes: 25,
    });
    assert.equal(partial.itemCount, 2);
    assert.equal(partial.session.status, "scheduled");
    assert.equal(partial.session.durationMinutes, 25);
    assert.equal(partial.session.taxRate, 0.08);
    assert.notEqual(partial.session.id, session.id);

    const copied = db.listItems(partial.session.id);
    assert.deepEqual(
      copied.map((item) => item.name),
      ["重拍之剑", "重拍之弓"],
    );
    assert.equal(copied[0].status, "pending");
    assert.equal(copied[0].startPrice, 10);
    assert.equal(copied[0].currentPrice, 10);
    assert.equal(copied[0].soldPrice, null);
    assert.equal(copied[0].winnerMemberId, null);
    assert.deepEqual(copied[0].dividendMemberIds, [member.id]);
    assert.equal(copied[0].hasImage, true);
    assert.equal(db.getItemImageData(copied[0].id), image);
    assert.equal(copied[1].quality, "special_pink");
    assert.equal(copied[1].bidMin, 20);
    assert.equal(copied[1].bidMax, 80);
    assert.equal(copied[1].status, "pending");

    const original = db.getItemById(sword.id);
    assert.equal(original?.status, "sold");
    assert.equal(original?.soldPrice, 99);
    assert.equal(db.getSessionById(session.id)?.status, "ended");
    assert.equal(db.listItems(session.id).length, 3);

    assert.throws(
      () =>
        db.reauctionSession({
          sourceSessionId: session.id,
          itemIds: [],
          scheduledStart: when,
        }),
      /请选择要重拍的拍品/,
    );
    assert.throws(
      () =>
        db.reauctionSession({
          sourceSessionId: session.id,
          itemIds: [shield.id, copied[0].id],
          scheduledStart: when,
        }),
      /所选拍品不属于该场次/,
    );
    assert.throws(
      () =>
        db.reauctionSession({
          sourceSessionId: session.id,
          itemIds: [sword.id, bow.id, shield.id],
          scheduledStart: when,
          durationMinutes: 2,
        }),
      /时长需在 5–180 分钟/,
    );

    const all = db.reauctionSession({
      sourceSessionId: session.id,
      itemIds: [shield.id, sword.id, bow.id],
      scheduledStart: when,
    });
    assert.equal(all.itemCount, 3);
    assert.equal(all.session.durationMinutes, 40);
    assert.deepEqual(
      db.listItems(all.session.id).map((item) => item.name),
      ["重拍之剑", "重拍之弓", "不重拍之盾"],
    );

    console.log("check-auction-reauction: ok");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

void main();
