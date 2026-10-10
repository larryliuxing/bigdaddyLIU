import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_AUCTION_ITEM_POST_BYTES,
  needsAuctionItemImageCompress,
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
    const keptRow = db
      .ensureDb()
      .prepare(`SELECT image_data FROM auction_items WHERE id = ?`)
      .get(kept.id) as { image_data: string | null };
    assert.equal(
      keptRow.image_data,
      null,
      "screenshot bytes must stay out of the SQLite row",
    );

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

    const jpegKeep = `data:image/jpeg;base64,${"C".repeat(200_000)}`;
    assert.equal(needsAuctionItemImageCompress(jpegKeep), false);
    const pngRecompress = `data:image/png;base64,${"D".repeat(200_000)}`;
    assert.equal(needsAuctionItemImageCompress(pngRecompress), true);

    const fourteen = Array.from({ length: 14 }, (_, i) =>
      db.createMember(`分红${i + 1}`),
    );
    const dupIds = fourteen.flatMap((m) => [m.id, m.id]);
    dupIds.push(999999);
    const started14 = Date.now();
    const with14 = db.createAuctionItem({
      sessionId: session.id,
      name: "青铜板甲",
      quality: "purple",
      startPrice: 10,
      bidIncrement: 1,
      imageData: jpegKeep,
      dividendMemberIds: dupIds,
    });
    const elapsed14 = Date.now() - started14;
    assert.equal(with14.hasImage, true);
    assert.equal(with14.imageData, null);
    assert.equal(with14.dividendMemberIds.length, 14);
    assert.ok(
      elapsed14 < 800,
      `14-member add blocked the process for ${elapsed14}ms`,
    );
    const payload14 = JSON.stringify({ item: with14 });
    assert.equal(payload14.includes("data:image"), false);

    const screenshotPng = `data:image/png;base64,${"E".repeat(900_000)}`;
    const createBody = JSON.stringify({
      sessionId: session.id,
      name: "稀有制作卷轴",
      quality: "purple",
      startPrice: 10,
      bidIncrement: 1,
      dividendMemberIds: fourteen.map((m) => m.id).slice(0, 8),
    });
    assert.equal(createBody.includes("data:image"), false);
    assert.ok(
      createBody.length < 2_000,
      `create POST should stay tiny, got ${createBody.length} chars`,
    );
    const tooBigForPost = `data:image/png;base64,${"F".repeat(2_100_000)}`;
    const hugePost = new Request("http://guild.test/api/auction/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "稀有制作卷轴",
        imageData: tooBigForPost,
        dividendMemberIds: [member.id],
      }),
    });
    const hugeParsed = await readJsonBodyCapped(hugePost);
    assert.equal(hugeParsed.tooLarge, true);

    const startedBare = Date.now();
    const scroll = db.createAuctionItem({
      sessionId: session.id,
      name: "稀有制作卷轴",
      quality: "purple",
      startPrice: 10,
      bidIncrement: 1,
      dividendMemberIds: fourteen.map((m) => m.id).slice(0, 8),
    });
    const elapsedBare = Date.now() - startedBare;
    assert.equal(scroll.hasImage, false);
    assert.equal(scroll.imageData, null);
    assert.equal(scroll.dividendMemberIds.length, 8);
    assert.ok(
      elapsedBare < 400,
      `create without screenshot blocked for ${elapsedBare}ms`,
    );

    const attached = db.setAuctionItemImage(scroll.id, jpegKeep);
    assert.ok(attached);
    assert.equal(attached.hasImage, true);
    assert.equal(attached.imageData, null);
    assert.equal(db.getItemImageData(scroll.id), jpegKeep);
    assert.equal(db.setAuctionItemImage(scroll.id, screenshotPng), null);
    assert.equal(db.getItemImageData(scroll.id), jpegKeep);
    assert.equal(db.setAuctionItemImage(999999, jpegKeep), null);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("auction add-item hang checks passed");
}

void main();
