import assert from "node:assert/strict";
import {
  cleanOcrNameToken,
  findBestMemberForOcrName,
  isNearName,
  pairOcrNamesToMembers,
  scoreNameMatch,
} from "../src/lib/auction/nameMatch";
import {
  isParticipantNameInk,
  namesFromOcrResult,
  parseParticipantRowName,
  participantNameInkCut,
} from "../src/lib/auction/participantOcr";

assert.equal(parseParticipantRowName("黄岳民之父 普通 千帆舞"), "黄岳民之父");
assert.equal(parseParticipantRowName("洛、洛 普通 千帆舞"), "洛洛");
assert.equal(parseParticipantRowName("名称 品级 战盟"), null);
assert.equal(parseParticipantRowName("奥秘盾 普通 洪门"), "奥秘盾");
assert.equal(parseParticipantRowName("小平安 普通 洪门"), "小平安");
assert.equal(parseParticipantRowName("奶牛大王 普通 大兄弟"), "奶牛大王");
assert.equal(parseParticipantRowName("苏北熙 普通 洪门致公堂"), "苏北熙");

assert.equal(cleanOcrNameToken("洛、洛"), "洛洛");
assert.equal(cleanOcrNameToken("花妖"), "花妖");
assert.equal(cleanOcrNameToken("普通"), null);
assert.equal(cleanOcrNameToken("洪门"), null);
assert.equal(cleanOcrNameToken("奥秘盾普通洪门"), "奥秘盾普通洪门");

const roster = [
  { id: 1, name: "唐小龙" },
  { id: 2, name: "灰豆" },
  { id: 3, name: "花妖" },
  { id: 4, name: "洛、洛" },
  { id: 5, name: "红唇猎客" },
  { id: 6, name: "奥秘盾" },
  { id: 7, name: "小平安" },
  { id: 8, name: "沙特" },
  { id: 9, name: "杰瑞" },
  { id: 10, name: "奶牛大王" },
  { id: 11, name: "苏北熙" },
];

assert.equal(findBestMemberForOcrName("唐小龙", roster)?.id, 1);
assert.equal(findBestMemberForOcrName("灰豆", roster)?.id, 2);
assert.equal(findBestMemberForOcrName("花夭", roster)?.id, 3);
assert.equal(findBestMemberForOcrName("洛洛", roster)?.id, 4);
assert.equal(findBestMemberForOcrName("不存在的人", roster), null);
assert.equal(findBestMemberForOcrName("奥秘盾普通洪门", roster)?.id, 6);
assert.equal(findBestMemberForOcrName("奶牛大王", roster)?.id, 10);

assert.equal(isNearName("花夭", "花妖"), true);
assert.ok(scoreNameMatch("唐小龙", "唐小龙") > scoreNameMatch("唐小", "唐小龙"));

const paired = pairOcrNamesToMembers(
  ["唐小龙", "灰豆", "花夭", "随便谁", "红唇猎客"],
  roster,
);
assert.equal(paired.hits.length, 5);
assert.equal(paired.hits[0].member?.id, 1);
assert.equal(paired.hits[1].member?.id, 2);
assert.equal(paired.hits[2].member?.id, 3);
assert.equal(paired.hits[3].member, null);
assert.equal(paired.hits[4].member?.id, 5);
assert.equal(paired.matched.length, 4);
assert.deepEqual(paired.unrecognized, ["随便谁"]);

const name1 = "\u9468\u9f93\u5dc4\u9f93\u5dc3\u9468";
const name7 = "\u9468\u9f93\u5fbf\u8d1a\u8d1a\u9468";
const name8 = "\u5131\u5131\u5131\u6f0b\u6f0b\u6f0b";
const hyphenRoster = [
  { id: 21, name: `${name1}-\u7070\u8c46` },
  { id: 22, name: `${name8}-\u67aa\u52b2\u597d\u91ce` },
  { id: 23, name: `${name7}-\u60ca\u7075` },
  { id: 24, name: "\u82b1\u5996" },
  { id: 2, name: "\u7070\u8c46" },
];
assert.equal(findBestMemberForOcrName(name1, hyphenRoster)?.id, 21);
assert.equal(findBestMemberForOcrName(name8, hyphenRoster)?.id, 22);
assert.equal(findBestMemberForOcrName(name7, hyphenRoster)?.id, 23);
assert.equal(findBestMemberForOcrName("\u7070\u8c46", hyphenRoster)?.id, 2);
assert.ok(
  scoreNameMatch(name1, `${name1}-\u7070\u8c46`) >
    scoreNameMatch("\u7070\u8c46", `${name1}-\u7070\u8c46`),
);
assert.ok(
  scoreNameMatch(name1, `${name1}-\u7070\u8c46`) >
    scoreNameMatch(name1, `${name7}-\u60ca\u7075`),
);

const hyphenPaired = pairOcrNamesToMembers(
  [name1, name8, "\u82b1\u5996"],
  hyphenRoster,
);
assert.equal(hyphenPaired.hits[0].member?.id, 21);
assert.equal(hyphenPaired.hits[1].member?.id, 22);
assert.equal(hyphenPaired.hits[2].member?.id, 24);
assert.deepEqual(hyphenPaired.unrecognized, []);

const name4 = "\u9468\u8d1a\u8d1a\u8c45\u7216\u5dc3";
const name2 = "\u9468\u8c45\u8d1a\u9468\u8d1a\u5dc4";
assert.equal(scoreNameMatch(name4, `${name4}-\u7070\u8c46`) > 90, true);
assert.equal(scoreNameMatch(name4, `${name2}-\u60ca\u7075`), 0);
assert.equal(findBestMemberForOcrName(name4, [{ id: 41, name: `${name2}-\u60ca\u7075` }]), null);
assert.equal(
  findBestMemberForOcrName(name4, [{ id: 42, name: `${name4}-\u59d0\u59d0` }])?.id,
  42,
);
const sameOrnatePrefix = [
  { id: 43, name: `${name4}-\u7070\u8c46` },
  { id: 44, name: `${name4}-\u8001\u5b50` },
];
assert.equal(findBestMemberForOcrName(name4, sameOrnatePrefix), null);

const nameMix = "\u9468\u9f93\u9468\u9f93\u8d1a\u7216";
const nameOther = "\u8d1a\u9468\u7216\u9468\u9f93\u7216";
const grayBean = `${nameMix}-\u7070\u8c46`;
assert.equal(scoreNameMatch(nameOther, grayBean), 0);
assert.equal(findBestMemberForOcrName(nameOther, [{ id: 31, name: grayBean }]), null);

const pasteLines = [
  name1,
  name7,
  "\u6ca7\u7b19\u8e0f\u6b4c",
  "\u5168\u6027\u3001\u79d2\u6740",
];
const fromService = namesFromOcrResult(pasteLines.join("\n"), pasteLines);
assert.ok(fromService.includes(name1));
assert.ok(fromService.includes(name7));
assert.ok(fromService.includes("\u6ca7\u7b19\u8e0f\u6b4c"));
assert.ok(fromService.includes("\u5168\u6027\u79d2\u6740"));

// Real screenshot samples: charcoal bg vs light-gray names.
assert.equal(isParticipantNameInk(11, 15, 19), false);
assert.equal(isParticipantNameInk(7, 11, 15), false);
assert.equal(isParticipantNameInk(131, 135, 139), true);
assert.equal(isParticipantNameInk(102, 106, 110), true);
assert.equal(isParticipantNameInk(90, 94, 98), true);
// Saturated guild badge should not count as name ink.
assert.equal(isParticipantNameInk(160, 40, 200), false);
assert.equal(cleanOcrNameToken("job"), "job");
assert.equal(cleanOcrNameToken("JOB"), "JOB");
assert.equal(cleanOcrNameToken("bob1"), "bob1");
assert.equal(parseParticipantRowName("job"), "job");
assert.ok(namesFromOcrResult("job\n天刀", ["job", "天刀"]).includes("job"));
assert.ok(namesFromOcrResult("job\n天刀", ["job", "天刀"]).includes("天刀"));

const aliasRoster = [
  { id: 31, name: "job-bob1-carry" },
  { id: 32, name: "天刀" },
];
assert.equal(findBestMemberForOcrName("job", aliasRoster)?.id, 31);
assert.equal(findBestMemberForOcrName("bob1", aliasRoster)?.id, 31);
assert.equal(findBestMemberForOcrName("carry", aliasRoster)?.id, 31);
assert.equal(findBestMemberForOcrName("JOB", aliasRoster)?.id, 31);
assert.equal(findBestMemberForOcrName("天刀", aliasRoster)?.id, 32);

const aliasPaired = pairOcrNamesToMembers(
  ["job", "天刀", "carry"],
  aliasRoster,
);
assert.equal(aliasPaired.hits.find((h) => h.ocrName === "job")?.member?.id, 31);
assert.equal(aliasPaired.hits.find((h) => h.ocrName === "carry")?.member?.id, 31);
assert.equal(aliasPaired.hits.find((h) => h.ocrName === "天刀")?.member?.id, 32);
assert.equal(aliasPaired.matched.length, 2);
assert.deepEqual(aliasPaired.unrecognized, []);

assert.equal(participantNameInkCut(98) < 110, true);
assert.equal(participantNameInkCut(98) < 82, true);

console.log("check-participant-ocr: ok");
