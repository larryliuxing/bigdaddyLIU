import assert from "node:assert/strict";
import {
  pickUnusedRoll,
  resolvePinkContest,
} from "../src/lib/auction/pink";

const bids = [
  { memberId: 1, amount: 40 },
  { memberId: 2, amount: 50 },
  { memberId: 3, amount: 50 },
];

assert.equal(resolvePinkContest({
  bids,
  votes: [],
  rolls: [],
  voteClosed: false,
  rollClosed: false,
}).kind, "wait_votes");

const byVotes = resolvePinkContest({
  bids,
  votes: [
    { candidateId: 1 },
    { candidateId: 1 },
    { candidateId: 2 },
  ],
  rolls: [],
  voteClosed: true,
  rollClosed: false,
});
assert.equal(byVotes.kind, "winner");
if (byVotes.kind === "winner") {
  assert.equal(byVotes.memberId, 1);
  assert.equal(byVotes.amount, 40);
  assert.equal(byVotes.reason, "votes");
}

const byPrice = resolvePinkContest({
  bids: [
    { memberId: 2, amount: 60 },
    { memberId: 3, amount: 50 },
  ],
  votes: [
    { candidateId: 2 },
    { candidateId: 3 },
  ],
  rolls: [],
  voteClosed: true,
  rollClosed: false,
});
assert.equal(byPrice.kind, "winner");
if (byPrice.kind === "winner") {
  assert.equal(byPrice.memberId, 2);
  assert.equal(byPrice.amount, 60);
  assert.equal(byPrice.reason, "price");
}

const needRoll = resolvePinkContest({
  bids: [
    { memberId: 2, amount: 50 },
    { memberId: 3, amount: 50 },
  ],
  votes: [
    { candidateId: 2 },
    { candidateId: 3 },
  ],
  rolls: [],
  voteClosed: true,
  rollClosed: false,
});
assert.equal(needRoll.kind, "wait_roll");
if (needRoll.kind === "wait_roll") {
  assert.deepEqual(needRoll.memberIds.sort(), [2, 3]);
}

const byRoll = resolvePinkContest({
  bids: [
    { memberId: 2, amount: 50 },
    { memberId: 3, amount: 50 },
  ],
  votes: [
    { candidateId: 2 },
    { candidateId: 3 },
  ],
  rolls: [
    { memberId: 2, points: 12 },
    { memberId: 3, points: 88 },
  ],
  voteClosed: true,
  rollClosed: false,
});
assert.equal(byRoll.kind, "winner");
if (byRoll.kind === "winner") {
  assert.equal(byRoll.memberId, 3);
  assert.equal(byRoll.reason, "roll");
}

const unused = pickUnusedRoll([1, 2, 3], () => 0);
assert.equal(unused, 4);

assert.equal(pickUnusedRoll(Array.from({ length: 100 }, (_, i) => i + 1)), null);

console.log("pink auction contest checks passed");

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "guild-pink-auction-"));
  try {
    process.chdir(tempDir);
    const db = await import("../src/lib/db");
    const a = db.createMember("甲");
    const b = db.createMember("乙");
    const outsider = db.createMember("路人");
    const session = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });
    const item = db.createAuctionItem({
      sessionId: session.id,
      name: "粉色测试装",
      quality: "pink",
      startPrice: 10,
      bidIncrement: 1,
      dividendMemberIds: [a.id, b.id],
      bidMin: 10,
      bidMax: 80,
    });
    assert.equal(item.bidMin, 10);
    assert.equal(item.bidMax, 80);

    db.startAuctionSession(session.id, { forceNow: true });

    let threw = false;
    try {
      db.placeBid({
        sessionId: session.id,
        itemId: item.id,
        memberId: outsider.id,
        amount: 20,
      });
    } catch (err) {
      threw = /参与者/.test((err as Error).message);
    }
    assert.equal(threw, true);

    db.placeBid({
      sessionId: session.id,
      itemId: item.id,
      memberId: a.id,
      amount: 30,
    });
    db.placeBid({
      sessionId: session.id,
      itemId: item.id,
      memberId: b.id,
      amount: 45,
    });

    db.endAuctionSession(session.id);
    const voting = db.getItemById(item.id)!;
    assert.equal(voting.status, "voting");
    const liveDuringVote = db.getSessionById(session.id)!;
    assert.equal(liveDuringVote.status, "live", "session stays live during pink vote");

    db.castPinkVote({
      itemId: item.id,
      voterMemberId: a.id,
      candidateMemberId: b.id,
    });
    db.castPinkVote({
      itemId: item.id,
      voterMemberId: b.id,
      candidateMemberId: b.id,
    });
    const sold = db.getItemById(item.id)!;
    assert.equal(sold.status, "sold");
    assert.equal(sold.winnerMemberId, b.id);
    assert.equal(sold.soldPrice, 45);

    const rollSession = db.createDraftSession({
      scheduledStart: null,
      durationMinutes: 30,
    });
    const rollItem = db.createAuctionItem({
      sessionId: rollSession.id,
      name: "粉色掷点装",
      quality: "pink",
      startPrice: 10,
      bidIncrement: 1,
      dividendMemberIds: [a.id, b.id],
      bidMin: 10,
      bidMax: 80,
    });
    db.startAuctionSession(rollSession.id, { forceNow: true });
    db.placeBid({
      sessionId: rollSession.id,
      itemId: rollItem.id,
      memberId: a.id,
      amount: 30,
    });
    db.placeBid({
      sessionId: rollSession.id,
      itemId: rollItem.id,
      memberId: b.id,
      amount: 30,
    });
    db.endAuctionSession(rollSession.id);
    db.castPinkVote({
      itemId: rollItem.id,
      voterMemberId: a.id,
      candidateMemberId: a.id,
    });
    db.castPinkVote({
      itemId: rollItem.id,
      voterMemberId: b.id,
      candidateMemberId: b.id,
    });
    const rolling = db.getItemById(rollItem.id)!;
    assert.equal(rolling.status, "rolling");
    const first = db.rollPinkPoints({ itemId: rollItem.id, memberId: a.id });
    const second = db.rollPinkPoints({ itemId: rollItem.id, memberId: b.id });
    const rolled = db.getItemById(rollItem.id)!;
    assert.equal(rolled.status, "sold");
    const expectedWinner = first.points > second.points ? a.id : b.id;
    assert.equal(rolled.winnerMemberId, expectedWinner);
    assert.equal(rolled.soldPrice, 30);
    assert.notEqual(first.points, second.points);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("pink auction db checks passed");
}

void main();
