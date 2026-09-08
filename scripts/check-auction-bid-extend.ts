import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extraMsForQualityBid,
  formatExtendLabel,
  qualityExtendHint,
  PINK_EXTEND_MS,
  PURPLE_EXTEND_MS,
} from "../src/lib/auction/bidExtend";

assert.equal(extraMsForQualityBid("purple", 61_000), 0);
assert.equal(extraMsForQualityBid("pink", 61_000), 0);
assert.equal(extraMsForQualityBid("purple", 60_000), PURPLE_EXTEND_MS);
assert.equal(extraMsForQualityBid("purple", 1), PURPLE_EXTEND_MS);
assert.equal(extraMsForQualityBid("pink", 60_000), PINK_EXTEND_MS);
assert.equal(extraMsForQualityBid("pink", 30_000), PINK_EXTEND_MS);
assert.equal(extraMsForQualityBid("blue", 30_000), 0);
assert.equal(extraMsForQualityBid("orange", 10_000), 0);
assert.equal(extraMsForQualityBid("green", 0), 0);
assert.equal(extraMsForQualityBid("purple", -1), 0);

assert.equal(formatExtendLabel(30_000), "30 秒");
assert.equal(formatExtendLabel(60_000), "1 分钟");
assert.equal(qualityExtendHint("purple"), "最后一分钟内出价，本场加时 30 秒");
assert.equal(qualityExtendHint("pink"), "最后一分钟内出价，本场加时 1 分钟");
assert.equal(qualityExtendHint("blue"), null);

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-bid-extend-"));
  try {
    process.chdir(tempDir);
    const {
      createMember,
      createDraftSession,
      createAuctionItem,
      startAuctionSession,
      placeBid,
      getSessionById,
      ensureDb,
      listEvents,
    } = await import("../src/lib/db");

    const member = createMember("加时测试");
    const session = createDraftSession({ durationMinutes: 30 });
    const purple = createAuctionItem({
      sessionId: session.id,
      name: "紫装",
      quality: "purple",
      startPrice: 5,
      bidIncrement: 5,
      dividendMemberIds: [member.id],
    });
    startAuctionSession(session.id, { forceNow: true });

    const remainMs = 45_000;
    const oldEnds = new Date(Date.now() + remainMs).toISOString();
    ensureDb()
      .prepare(`UPDATE auction_sessions SET ends_at = ? WHERE id = ?`)
      .run(oldEnds, session.id);

    placeBid({
      sessionId: session.id,
      itemId: purple.id,
      memberId: member.id,
      amount: 5,
    });

    const updated = getSessionById(session.id);
    assert.ok(updated?.endsAt);
    const added =
      new Date(updated.endsAt).getTime() - new Date(oldEnds).getTime();
    assert.ok(
      Math.abs(added - PURPLE_EXTEND_MS) < 50,
      `expected +30s, got ${added}ms`,
    );

    const events = listEvents(session.id, 20);
    assert.ok(
      events.some((ev) => ev.message.includes("本场延长 30 秒")),
      "missing extend event",
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("auction quality bid-extend checks passed");
}

void main();
