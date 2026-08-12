import assert from "node:assert/strict";
import {
  extractCombatPower,
  extractDetectedName,
  isPlausibleNameCandidate,
  parseCombatPowerScreenshot,
} from "../src/lib/leaderboard/parse";

// Latin OCR junk must never become the detected Chinese name
assert.equal(isPlausibleNameCandidate("CT", "唐小虎"), false);
assert.equal(extractDetectedName("CT", "唐小虎").matched, false);
assert.equal(extractDetectedName("CT", "唐小虎").detectedName, null);

assert.equal(
  extractDetectedName("日程自动进行中", "唐小虎").matched,
  false,
);
assert.equal(
  extractDetectedName("日程自动进行中", "唐小虎").detectedName,
  null,
);

assert.equal(extractDetectedName("唐小虎", "唐小虎").matched, true);
assert.equal(extractDetectedName("唐 小 虎", "唐小虎").matched, true);
assert.equal(extractDetectedName("唐虎", "唐小虎").matched, true); // 2-of-3

const rejected = parseCombatPowerScreenshot(
  {
    nameText: "CT\n日程自动进行中",
    powerText: "战斗力 4776\n日程自动进行中",
  },
  "唐小虎",
);
assert.equal(rejected.ok, false);
assert.equal(rejected.detectedName, null);
assert.equal(rejected.combatPower, 4776);

const ok = parseCombatPowerScreenshot(
  {
    nameText: "唐小虎",
    powerText: "战斗力 4776\n日程自动进行中",
  },
  "唐小虎",
);
assert.equal(ok.ok, true);
assert.equal(ok.combatPower, 4776);

// Latin member names still work
assert.equal(extractDetectedName("Hira", "Hira").matched, true);
assert.equal(isPlausibleNameCandidate("Hira", "Hira"), true);

assert.equal(extractCombatPower("战斗力 4776\n日程自动进行中"), 4776);

console.log("leaderboard CT/blue-name parse checks passed");
