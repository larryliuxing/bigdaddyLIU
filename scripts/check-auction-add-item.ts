import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_AUCTION_ITEM_POST_BYTES,
  readJsonBodyCapped,
  sanitizeAuctionItemImage,
} from "../src/lib/auction/itemImage";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-auction-add-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const { buildRoomState } = await import("../src/lib/auction/room");

    assert.equal(sanitizeAuctionItemImage(null), null);
    assert.equal(sanitizeAuctionItemImage(""), null);
    assert.equal(sanitizeAuctionItemImage("not-an-image"), null);

    const small = `data:image/jpeg;base64,${"A".repeat(80_000)}`;
    assert.equal(sanitizeAuctionItemImage(small), small);

    const huge = `data:image/png;base64,${"B".repeat(2_000_000)}`;
    assert.equal(sanitizeAuctionItemImage(huge), null);

    const member = db.createMember("添加卡死测试");
    const session = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });

    const kept = db.createAuctionItem({
      sessionId: session.id,
      name: "压缩后的装",
      quality: "green",
      startPrice: 5,
      bidIncrement: 5,
      imageData: small,
      dividendMemberIds: [member.id],
    });
    assert.equal(kept.hasImage, true);
    assert.equal(db.getItemImageData(kept.id), small);

    const started = Date.now();
    const dropped = db.createAuctionItem({
      sessionId: session.id,
      name: "超大截图装",
      quality: "green",
      startPrice: 5,
      bidIncrement: 5,
      imageData: huge,
      dividendMemberIds: [member.id],
    });
    const elapsed = Date.now() - started;
    assert.equal(dropped.hasImage, false);
    assert.equal(db.getItemImageData(dropped.id), null);
    assert.ok(
      elapsed < 1500,
      `oversized screenshot insert blocked the process for ${elapsed}ms`,
    );

    const room = buildRoomState(session.id, { lite: true });
    const payload = JSON.stringify({ item: dropped, room });
    assert.equal(payload.includes("data:image"), false);
    assert.equal(room.items.length, 2);

    const tooLargeReq = new Request("http://guild.test/api/auction/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "卡死装",
        imageData: huge,
        dividendMemberIds: [member.id],
      }),
    });
    const capped = await readJsonBodyCapped(tooLargeReq);
    assert.equal(capped.tooLarge, true);

    const okReq = new Request("http://guild.test/api/auction/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "正常装",
        quality: "green",
        startPrice: 5,
        bidIncrement: 5,
        imageData: small,
        dividendMemberIds: [member.id],
      }),
    });
    const okParsed = await readJsonBodyCapped(okReq);
    assert.notEqual(okParsed.tooLarge, true);
    if (okParsed.tooLarge) {
      throw new Error("small add-item body should be accepted");
    }
    assert.equal((okParsed.body as { name: string }).name, "正常装");
    assert.ok(MAX_AUCTION_ITEM_POST_BYTES >= 1_000_000);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("auction add-item hang checks passed");
}

void main();
