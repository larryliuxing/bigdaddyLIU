import assert from "node:assert/strict";
import {
  extractCombatPower,
  extractDetectedName,
  isPlausibleNameCandidate,
  parseCombatPowerScreenshot,
} from "../src/lib/leaderboard/parse";

assert.equal(isPlausibleNameCandidate("CT", "唐小虎"), false);
assert.equal(extractDetectedName("CT", "唐小虎").detectedName, null);
assert.equal(extractDetectedName("有二这", "唐小虎").matched, false);
assert.equal(extractDetectedName("有二这", "唐小虎").detectedName, "有二这");
assert.equal(extractDetectedName("唐小虎", "唐小虎").matched, true);

assert.equal(extractCombatPower("能力值 4770"), 4770);
assert.equal(extractCombatPower("战斗力 4776"), 4776);
assert.equal(extractCombatPower("4770"), 4770);

// Dual power must match
const mismatch = parseCombatPowerScreenshot(
  {
    nameText: "唐小虎",
    powerTopText: "能力值 4770",
    powerBottomText: "4800",
  },
  "唐小虎",
);
assert.equal(mismatch.ok, false);
assert.match(String(mismatch.error), /不一致/);

const ok = parseCombatPowerScreenshot(
  {
    nameText: "唐小虎",
    powerTopText: "能力值 4770",
    powerBottomText: "4770",
  },
  "唐小虎",
);
assert.equal(ok.ok, true);
assert.equal(ok.combatPower, 4770);

const wrongPerson = parseCombatPowerScreenshot(
  {
    nameText: "有二这",
    powerTopText: "能力值 4770",
    powerBottomText: "4770",
  },
  "唐小虎",
);
assert.equal(wrongPerson.ok, false);
assert.equal(wrongPerson.detectedName, "有二这");

console.log("leaderboard ratio/dual-power parse checks passed");
