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

// Real screenshot samples: charcoal bg vs light-gray names.
assert.equal(isParticipantNameInk(11, 15, 19), false);
assert.equal(isParticipantNameInk(7, 11, 15), false);
assert.equal(isParticipantNameInk(131, 135, 139), true);
assert.equal(isParticipantNameInk(102, 106, 110), true);
assert.equal(isParticipantNameInk(90, 94, 98), true);
// Saturated guild badge should not count as name ink.
assert.equal(isParticipantNameInk(160, 40, 200), false);
assert.equal(participantNameInkCut(98) < 110, true);
assert.equal(participantNameInkCut(98) < 82, true);

console.log("check-participant-ocr: ok");
