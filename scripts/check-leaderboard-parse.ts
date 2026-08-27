import assert from "node:assert/strict";
import {
  extractClickedCombatPower,
  extractCombatPower,
  extractDetectedName,
  isPlausibleNameCandidate,
  parseCombatPowerScreenshot,
} from "../src/lib/leaderboard/parse";
import {
  NAME_CLICK_CROP,
  NAME_CLICK_CROP_WIDE,
} from "../src/lib/leaderboard/regions";

assert.ok(NAME_CLICK_CROP.w > 0.16 && NAME_CLICK_CROP.w <= 0.22);
assert.ok(NAME_CLICK_CROP.h > 0.055 && NAME_CLICK_CROP.h <= 0.08);
assert.ok(NAME_CLICK_CROP_WIDE.w > 0.22 && NAME_CLICK_CROP_WIDE.w <= 0.28);
assert.ok(NAME_CLICK_CROP_WIDE.h > 0.07 && NAME_CLICK_CROP_WIDE.h <= 0.09);

assert.equal(isPlausibleNameCandidate("CT", "唐小虎"), false);
assert.equal(extractDetectedName("唐小虎", "唐小虎").matched, true);
assert.equal(extractDetectedName("周杰伦", "周杰伦").matched, true);
assert.equal(extractDetectedName("杰伦", "周杰伦").matched, true);
assert.equal(extractDetectedName("周 杰 伦", "周杰伦").matched, true);
assert.equal(extractDetectedName("洛丶洛", "洛丶洛").matched, true);
assert.equal(extractDetectedName("洛、洛", "洛丶洛").matched, true);
assert.equal(extractDetectedName("洛·洛", "洛丶洛").matched, true);
assert.equal(extractDetectedName("洛洛", "洛丶洛").matched, true);
assert.equal(extractDetectedName("和洛", "洛丶洛").matched, true);
assert.equal(extractDetectedName("和洛", "唐小龙").matched, false);
assert.equal(extractDetectedName("洛丶洛", "唐小龙").matched, false);

assert.equal(extractCombatPower("能力值 47176"), 47176);
assert.equal(extractCombatPower("战斗力 4776"), 4776);
assert.equal(extractClickedCombatPower("13293"), 13293);
assert.equal(extractClickedCombatPower("9348"), 9348);
assert.equal(extractClickedCombatPower("123"), null); // too short
assert.equal(extractClickedCombatPower("战斗力 ⚔️ 9348"), 9348);
assert.equal(extractClickedCombatPower("2749274 13270"), 13270);

const needClick = parseCombatPowerScreenshot(
  { nameText: "", powerTop: 4776 },
  "唐小虎",
);
assert.equal(needClick.ok, false);
assert.match(String(needClick.error), /点击/);

const ok = parseCombatPowerScreenshot(
  { nameText: "唐小虎", powerTop: 4776 },
  "唐小虎",
);
assert.equal(ok.ok, true);
assert.equal(ok.combatPower, 4776);

const missingPower = parseCombatPowerScreenshot(
  { nameText: "唐小虎", powerTop: null },
  "唐小虎",
);
assert.equal(missingPower.ok, false);
assert.match(String(missingPower.error), /战斗力|战力/);

const tooShort = parseCombatPowerScreenshot(
  { nameText: "唐小虎", powerTop: 999 },
  "唐小虎",
);
assert.equal(tooShort.ok, false);

console.log("leaderboard click-name redesign checks passed");
