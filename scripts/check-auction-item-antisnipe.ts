import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-item-antisnipe-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const a = db.createMember("甲");
    const b = db.createMember("乙");
    const session = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });
    const lateLot = db.createAuctionItem({
      sessionId: session.id,
      name: "卡秒装",
      quality: "green",
      startPrice: 10,
      bidIncrement: 5,
      dividendMemberIds: [a.id],
    });
    const longLot = db.createAuctionItem({
      sessionId: session.id,
      name: "长时装",
      quality: "green",
      startPrice: 10,
      bidIncrement: 5,
      dividendMemberIds: [a.id],
    });
    db.startAuctionSession(session.id, { forceNow: true });

    const now = Date.now();
    const lateIso = new Date(now + 20_000).toISOString();
    const longIso = new Date(now + 10 * 60_000).toISOString();
    db.ensureDb()
      .prepare(`UPDATE auction_items SET ends_at = ? WHERE id = ?`)
      .run(lateIso, lateLot.id);
    db.ensureDb()
      .prepare(`UPDATE auction_items SET ends_at = ? WHERE id = ?`)
      .run(longIso, longLot.id);
    db.ensureDb()
      .prepare(`UPDATE auction_sessions SET ends_at = ? WHERE id = ?`)
      .run(longIso, session.id);

    db.placeBid({
      sessionId: session.id,
      itemId: lateLot.id,
      memberId: a.id,
      amount: 10,
    });

    const extended = db.getItemById(lateLot.id)!;
    const untouched = db.getItemById(longLot.id)!;
    const live = db.getSessionById(session.id)!;
    const extendedMs = new Date(extended.endsAt ?? "").getTime();
    assert.ok(extended.endsAt, "late lot gets its own clock");
    assert.ok(
      Math.abs(extendedMs - (Date.now() + 60_000)) < 3_000,
      "last-minute bid resets this lot to 60s from now",
    );
    assert.equal(untouched.endsAt, longIso, "other lots keep their own clock");
    assert.ok(
      new Date(live.endsAt ?? "").getTime() >= extendedMs - 50,
      "session stays at least as late as the extended lot",
    );

    db.placeBid({
      sessionId: session.id,
      itemId: longLot.id,
      memberId: a.id,
      amount: 10,
    });
    const stillLong = db.getItemById(longLot.id)!;
    assert.equal(stillLong.endsAt, longIso, "early bid does not extend");

    db.ensureDb()
      .prepare(`UPDATE auction_items SET ends_at = ? WHERE id = ?`)
      .run(new Date(Date.now() - 1_000).toISOString(), longLot.id);
    const afterClose = db.maybeAutoProgress(session.id)!;
    const closedLong = db.getItemById(longLot.id)!;
    const stillOpen = db.getItemById(lateLot.id)!;
    assert.equal(closedLong.status, "sold");
    assert.equal(closedLong.winnerMemberId, a.id);
    assert.equal(stillOpen.status, "active");
    assert.equal(afterClose.status, "live", "session waits for remaining lots");

    db.ensureDb()
      .prepare(`UPDATE auction_items SET ends_at = ? WHERE id = ?`)
      .run(new Date(Date.now() - 1_000).toISOString(), lateLot.id);
    let lateRejected = false;
    try {
      db.placeBid({
        sessionId: session.id,
        itemId: lateLot.id,
        memberId: b.id,
        amount: 15,
      });
    } catch (err) {
      lateRejected = /已截止/.test((err as Error).message);
    }
    assert.equal(lateRejected, true);
    const soldLate = db.getItemById(lateLot.id)!;
    assert.equal(soldLate.status, "sold");
    assert.equal(soldLate.winnerMemberId, a.id);

    const ended = db.maybeAutoProgress(session.id)!;
    assert.equal(ended.status, "ended");

    const pinkSession = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });
    const pink = db.createAuctionItem({
      sessionId: pinkSession.id,
      name: "粉色卡秒装",
      quality: "special_pink",
      startPrice: 10,
      bidIncrement: 1,
      dividendMemberIds: [a.id, b.id],
      bidMin: 10,
      bidMax: 80,
    });
    db.startAuctionSession(pinkSession.id, { forceNow: true });
    const pinkClose = new Date(Date.now() + 12_000).toISOString();
    db.ensureDb()
      .prepare(`UPDATE auction_items SET ends_at = ? WHERE id = ?`)
      .run(pinkClose, pink.id);
    db.placeBid({
      sessionId: pinkSession.id,
      itemId: pink.id,
      memberId: a.id,
      amount: 20,
    });
    const pinkExtended = db.getItemById(pink.id)!;
    assert.equal(pinkExtended.status, "active");
    assert.ok(
      Math.abs(new Date(pinkExtended.endsAt ?? "").getTime() - (Date.now() + 60_000)) <
        3_000,
      "pink last-minute bids also extend only this lot",
    );
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("auction item anti-snipe checks passed");
}

void main();
