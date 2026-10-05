import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-price-stats-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const member = db.createMember("价统测试");
    const session = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });
    const item = db.createAuctionItem({
      sessionId: session.id,
      name: "枪术书 (格挡状态)",
      quality: "green",
      startPrice: 5,
      bidIncrement: 5,
      dividendMemberIds: [member.id],
    });
    db.recordItemSale({
      itemId: item.id,
      sessionId: session.id,
      itemName: item.name,
      quality: "green",
      soldPrice: 40,
      winnerMemberId: member.id,
      winnerName: member.name,
    });
    db.recordItemSale({
      itemId: item.id + 999,
      sessionId: session.id,
      itemName: "枪术书 (格挡状态)",
      quality: "green",
      soldPrice: 20,
      winnerMemberId: member.id,
      winnerName: member.name,
    });

    const blob = `data:image/jpeg;base64,${"A".repeat(400_000)}`;
    const insert = db.ensureDb().prepare(
      `INSERT INTO auction_items
       (session_id, name, quality, start_price, bid_increment, image_data, has_image, sort_order, current_price, status, sold_price)
       VALUES (?, ?, 'green', 5, 5, ?, 1, 99, 5, 'sold', 99)`,
    );
    for (let i = 0; i < 8; i += 1) {
      insert.run(session.id, `噪声装 ${i}`, blob);
    }

    const started = Date.now();
    const stats = db.getItemPriceStats("枪术书 (格挡状态)");
    const elapsed = Date.now() - started;
    assert.ok(stats, "history stats should resolve");
    assert.equal(stats?.count, 2);
    assert.equal(stats?.high, 40);
    assert.equal(stats?.low, 20);
    assert.ok(
      elapsed < 150,
      `price stats blocked the process for ${elapsed}ms`,
    );

    const missing = db.getItemPriceStats("没有这件装");
    assert.equal(missing, null);
    console.log(`price stats ${elapsed}ms`, stats);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("auction price-stats checks passed");
}

void main();
