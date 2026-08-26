import assert from "node:assert/strict";
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

console.log("auction quality bid-extend checks passed");
