import assert from "node:assert/strict";
import {
  DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
  formatThresholdPercentLabel,
  parseLeaderboardThresholdPercent,
  percentToRatio,
  ratioToPercent,
} from "../src/lib/leaderboard/threshold.ts";

assert.equal(parseLeaderboardThresholdPercent(85), 85);
assert.equal(parseLeaderboardThresholdPercent("82.5"), 82.5);
assert.equal(parseLeaderboardThresholdPercent(0), null);
assert.equal(parseLeaderboardThresholdPercent(100.1), null);
assert.equal(parseLeaderboardThresholdPercent("abc"), null);
assert.equal(percentToRatio(85), 0.85);
assert.equal(ratioToPercent(0.85), 85);
assert.equal(formatThresholdPercentLabel(85), "85");
assert.equal(formatThresholdPercentLabel(82.5), "82.5");
assert.equal(DEFAULT_LEADERBOARD_THRESHOLD_PERCENT, 85);

console.log("leaderboard threshold checks passed");
