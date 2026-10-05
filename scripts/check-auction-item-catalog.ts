import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-item-catalog-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const member = db.createMember("拍品库测试");
    const session = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });

    const started = Date.now();
    db.createAuctionItem({
      sessionId: session.id,
      name: "魔道书 (回音魔力催化)",
      quality: "purple",
      startPrice: 5,
      bidIncrement: 1,
      dividendMemberIds: [member.id],
    });
    const createMs = Date.now() - started;
    assert.ok(createMs < 500, `catalog upsert blocked add for ${createMs}ms`);

    const recent = db.searchItemCatalog("", 20);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].name, "魔道书 (回音魔力催化)");
    assert.equal(recent[0].quality, "purple");
    assert.equal(recent[0].lastStartPrice, 5);
    assert.equal(recent[0].lastBidIncrement, 1);
    assert.equal(recent[0].lastSoldPrice, null);

    const byPartial = db.searchItemCatalog("魔道", 20);
    assert.equal(byPartial.length, 1);
    assert.equal(byPartial[0].name, "魔道书 (回音魔力催化)");

    db.createAuctionItem({
      sessionId: session.id,
      name: "魔道书 (回音魔力催化)",
      quality: "purple",
      startPrice: 8,
      bidIncrement: 2,
      dividendMemberIds: [member.id],
    });
    const updated = db.searchItemCatalog("魔道书", 20)[0];
    assert.equal(updated.lastStartPrice, 8);
    assert.equal(updated.lastBidIncrement, 2);
    assert.equal(updated.useCount, 2);

    const soldItem = db.createAuctionItem({
      sessionId: session.id,
      name: "魔道书 (回音魔力催化)",
      quality: "purple",
      startPrice: 8,
      bidIncrement: 2,
      dividendMemberIds: [member.id],
    });
    db.recordItemSale({
      itemId: soldItem.id,
      sessionId: session.id,
      itemName: soldItem.name,
      quality: "purple",
      soldPrice: 40,
      winnerMemberId: member.id,
      winnerName: member.name,
    });
    const afterSale = db.searchItemCatalog("魔道书", 20)[0];
    assert.equal(afterSale.lastSoldPrice, 40);
    assert.equal(afterSale.lastStartPrice, 8);

    db.createAuctionItem({
      sessionId: session.id,
      name: "特殊粉装",
      quality: "special_pink",
      startPrice: 10,
      bidIncrement: 1,
      bidMin: 10,
      bidMax: 80,
      dividendMemberIds: [member.id],
    });
    const pink = db.searchItemCatalog("特殊粉", 20)[0];
    assert.equal(pink.quality, "special_pink");
    assert.equal(pink.lastBidMin, 10);
    assert.equal(pink.lastBidMax, 80);

    const miss = db.searchItemCatalog("没有这件装", 20);
    assert.equal(miss.length, 0);

    console.log(`item catalog checks passed (${createMs}ms add)`);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

void main();
