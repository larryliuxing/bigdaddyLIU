import assert from "node:assert/strict";
import {
  applyLastMinuteExtend,
  itemClockIso,
  itemIsDue,
  laterIso,
  remainingSeconds,
  resolveItemEndMs,
  roomRemainingFromItems,
  shouldExtendItemClock,
} from "../src/lib/auction/itemClock";

const now = Date.parse("2026-10-04T12:00:00.000Z");

assert.equal(resolveItemEndMs("2026-10-04T12:05:00.000Z", "2026-10-04T12:10:00.000Z"), Date.parse("2026-10-04T12:05:00.000Z"));
assert.equal(resolveItemEndMs(null, "2026-10-04T12:10:00.000Z"), Date.parse("2026-10-04T12:10:00.000Z"));
assert.equal(remainingSeconds(now + 90_000, now), 90);
assert.equal(itemIsDue(now - 1, now), true);
assert.equal(itemIsDue(now + 1, now), false);

assert.equal(shouldExtendItemClock(now + 60_000, now), true);
assert.equal(shouldExtendItemClock(now + 60_001, now), false);
assert.equal(shouldExtendItemClock(now + 1_000, now), true);
assert.equal(shouldExtendItemClock(now, now), false);

const late = applyLastMinuteExtend(now + 15_000, now);
assert.equal(late.extended, true);
assert.equal(late.endsAtMs, now + 60_000);

const early = applyLastMinuteExtend(now + 120_000, now);
assert.equal(early.extended, false);
assert.equal(early.endsAtMs, now + 120_000);

assert.equal(
  laterIso("2026-10-04T12:05:00.000Z", "2026-10-04T12:06:00.000Z"),
  "2026-10-04T12:06:00.000Z",
);
assert.equal(
  laterIso("2026-10-04T12:08:00.000Z", "2026-10-04T12:06:00.000Z"),
  "2026-10-04T12:08:00.000Z",
);

assert.equal(
  itemClockIso(
    { status: "active", endsAt: "2026-10-04T12:05:00.000Z" },
    "2026-10-04T12:10:00.000Z",
  ),
  "2026-10-04T12:05:00.000Z",
);
assert.equal(
  itemClockIso({ status: "voting", voteEndsAt: "2026-10-04T12:03:00.000Z" }),
  "2026-10-04T12:03:00.000Z",
);

const roomClock = roomRemainingFromItems(
  [
    { status: "active", endsAt: "2026-10-04T12:01:20.000Z" },
    { status: "active", endsAt: "2026-10-04T12:02:00.000Z" },
    { status: "sold", endsAt: "2026-10-04T12:10:00.000Z" },
  ],
  "2026-10-04T12:01:00.000Z",
  now,
);
assert.equal(roomClock.remainingLabel, "本场剩余");
assert.equal(roomClock.remainingSeconds, 120);

const voteOnly = roomRemainingFromItems(
  [{ status: "voting", voteEndsAt: "2026-10-04T12:00:40.000Z" }],
  "2026-10-04T12:00:00.000Z",
  now,
);
assert.equal(voteOnly.remainingLabel, "投票剩余");
assert.equal(voteOnly.remainingSeconds, 40);

console.log("auction item clock ok");
