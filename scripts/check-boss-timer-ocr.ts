import assert from "node:assert/strict";
import {
  buildOcrTimerDraft,
  matchBossFromOcr,
  normalizeBossTimeOcr,
  parseBossTimesFromOcr,
  splitKillAndAppearance,
} from "../src/lib/boss/ocrParse";
import { planTimerFromOcrKill } from "../src/lib/boss/timer";

const sample =
  "2026年 08月 31日 10时 46分\n2026年 08月 31日 14时 46分";

const times = parseBossTimesFromOcr(sample);
assert.equal(times.length, 2);
assert.equal(times[0].iso, new Date("2026-08-31T10:46:00+08:00").toISOString());
assert.equal(times[1].iso, new Date("2026-08-31T14:46:00+08:00").toISOString());

const compact = parseBossTimesFromOcr("2026年08月31日10时46分");
assert.equal(compact.length, 1);
assert.equal(
  compact[0].iso,
  new Date("2026-08-31T10:46:00+08:00").toISOString(),
);

const noonFix = normalizeBossTimeOcr("2026午08月31日10吋46分");
assert.match(noonFix, /年/);
assert.match(noonFix, /时/);
assert.equal(parseBossTimesFromOcr(noonFix).length, 1);

const split = splitKillAndAppearance(times);
assert.equal(split.kill?.hour, 10);
assert.equal(split.kill?.minute, 46);
assert.equal(split.appearance?.hour, 14);

const bosses = [
  { id: 1, name: "巴实那" },
  { id: 2, name: "卡坦" },
  { id: 3, name: "被污染的克鲁玛" },
  { id: 4, name: "瓦柏" },
  { id: 5, name: "沙勒卡" },
];
assert.equal(matchBossFromOcr("巴实那", bosses)?.boss.id, 1);
assert.equal(matchBossFromOcr("  卡 坦  ", bosses)?.boss.id, 2);
assert.equal(matchBossFromOcr("被污染的克鲁玛", bosses)?.boss.id, 3);
assert.equal(matchBossFromOcr("克鲁玛", bosses)?.boss.id, 3);
assert.equal(matchBossFromOcr("参与(22)", bosses), null);

const now = new Date("2026-08-31T11:00:00+08:00").getTime();
const planned = buildOcrTimerDraft({
  killIso: split.kill!.iso,
  appearanceIso: split.appearance!.iso,
  intervalHours: 4,
  nowMs: now,
});
assert.equal(planned.ok, true);
if (planned.ok) {
  assert.equal(planned.source, "appearance");
  assert.equal(planned.overdue, false);
  assert.equal(
    planned.nextSpawnAt,
    new Date("2026-08-31T14:46:00+08:00").toISOString(),
  );
}

const noAppear = planTimerFromOcrKill(
  new Date("2026-08-31T10:46:00+08:00").toISOString(),
  4,
  null,
  now,
);
assert.equal(noAppear.ok, true);
if (noAppear.ok) {
  assert.equal(noAppear.source, "interval");
  assert.equal(
    noAppear.nextSpawnAt,
    new Date("2026-08-31T14:46:00+08:00").toISOString(),
  );
}

const overdue = planTimerFromOcrKill(
  new Date("2026-08-31T01:00:00+08:00").toISOString(),
  4,
  null,
  now,
);
assert.equal(overdue.ok, true);
if (overdue.ok) {
  assert.equal(overdue.overdue, true);
  assert.equal(
    overdue.nextSpawnAt,
    new Date("2026-08-31T05:00:00+08:00").toISOString(),
  );
}

console.log("boss timer ocr parse checks passed");
