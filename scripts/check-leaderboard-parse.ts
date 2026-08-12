import assert from "node:assert/strict";
import {
  extractCombatPower,
  extractDetectedName,
  parseCombatPowerScreenshot,
} from "../src/lib/leaderboard/parse";

// Name matching must use blue name OCR — not bottom white UI
assert.equal(
  extractDetectedName("日程自动进行中", "唐小虎").matched,
  false,
);
assert.equal(
  extractDetectedName("日程自动进行中", "唐小虎").detectedName,
  null,
);

assert.equal(
  extractDetectedName("唐小虎", "唐小虎").matched,
  true,
);
assert.equal(
  extractDetectedName("唐 小 虎", "唐小虎").matched,
  true,
);

// Full white UI in power text must not become the "detected name"
const rejected = parseCombatPowerScreenshot(
  {
    nameText: "日程自动进行中\n战斗力",
    powerText: "战斗力 4776\n日程自动进行中",
  },
  "唐小虎",
);
assert.equal(rejected.ok, false);
assert.notEqual(rejected.detectedName, "日程自动进行中");

const ok = parseCombatPowerScreenshot(
  {
    nameText: "唐小虎",
    powerText: "战斗力 4776\n日程自动进行中",
  },
  "唐小虎",
);
assert.equal(ok.ok, true);
assert.equal(ok.combatPower, 4776);
assert.equal(ok.detectedName, "唐小虎");

assert.equal(extractCombatPower("战斗力 4776\n日程自动进行中"), 4776);

console.log("leaderboard blue-name parse checks passed");
