import assert from "node:assert/strict";
import {
  extractCombatPower,
  extractDetectedName,
  parseCombatPowerScreenshot,
} from "../src/lib/leaderboard/parse";

assert.equal(
  extractDetectedName("铠卫\n唐小虎\n战斗力 4776", "唐小虎").matched,
  true,
);
assert.equal(
  extractDetectedName("唐 小 虎\n战斗力4776", "唐小虎").matched,
  true,
);
assert.equal(
  extractDetectedName("铠卫\n唐x小y虎\n[复活的支配骑士]\n战斗力 4776", "唐小虎")
    .matched,
  true,
);
assert.equal(
  extractDetectedName("唐小虔 战斗力 4776", "唐小虎").matched,
  true,
);
assert.equal(extractCombatPower("战斗力 4776"), 4776);
assert.equal(extractCombatPower("战 斗 力：4776"), 4776);

const parsed = parseCombatPowerScreenshot(
  "铠卫\n唐 小 虎\n战斗力 4776",
  "唐小虎",
);
assert.equal(parsed.ok, true);
assert.equal(parsed.combatPower, 4776);
assert.equal(extractDetectedName("清风\n战斗力 1000", "唐小虎").matched, false);

console.log("leaderboard parse checks passed");
