import assert from "node:assert/strict";
import {
  cleanOcrNameToken,
  findBestMemberForOcrName,
  isNearName,
  pairOcrNamesToMembers,
  scoreNameMatch,
} from "../src/lib/auction/nameMatch";
import { parseParticipantRowName } from "../src/lib/auction/participantOcr";

assert.equal(parseParticipantRowName("黄岳民之父 普通 千帆舞"), "黄岳民之父");
assert.equal(parseParticipantRowName("洛、洛 普通 千帆舞"), "洛洛");
assert.equal(parseParticipantRowName("名称 品级 战盟"), null);

assert.equal(cleanOcrNameToken("洛、洛"), "洛洛");
assert.equal(cleanOcrNameToken("花妖"), "花妖");
assert.equal(cleanOcrNameToken("普通"), null);

const roster = [
  { id: 1, name: "唐小龙" },
  { id: 2, name: "灰豆" },
  { id: 3, name: "花妖" },
  { id: 4, name: "洛、洛" },
  { id: 5, name: "红唇猎客" },
];

assert.equal(findBestMemberForOcrName("唐小龙", roster)?.id, 1);
assert.equal(findBestMemberForOcrName("灰豆", roster)?.id, 2);
assert.equal(findBestMemberForOcrName("花夭", roster)?.id, 3);
assert.equal(findBestMemberForOcrName("洛洛", roster)?.id, 4);
assert.equal(findBestMemberForOcrName("不存在的人", roster), null);

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

console.log("check-participant-ocr: ok");
