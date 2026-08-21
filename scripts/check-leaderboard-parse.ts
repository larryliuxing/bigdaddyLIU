import assert from "node:assert/strict";
import {
  extractCombatPower,
  extractDetectedName,
  isPlausibleNameCandidate,
  parseCombatPowerScreenshot,
} from "../src/lib/leaderboard/parse";

assert.equal(isPlausibleNameCandidate("CT", "唐小虎"), false);
assert.equal(extractDetectedName("唐小虎", "唐小虎").matched, true);
assert.equal(extractDetectedName("入多避胡证基于双生1", "唐小虎").matched, false);

assert.equal(extractCombatPower("能力值 47176"), 47176);
assert.equal(extractCombatPower("战斗力 4776"), 4776);

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
assert.match(String(missingPower.error), /战力/);

console.log("leaderboard click-name redesign checks passed");
