import assert from "node:assert/strict";
import type { AuctionItem } from "../src/lib/types";
import {
  formatAuctionYuan,
  groupAuctionResultsByWinner,
} from "../src/lib/auction/resultGroups";

function item(
  partial: Partial<AuctionItem> & Pick<AuctionItem, "id" | "name">,
): AuctionItem {
  return {
    sessionId: 1,
    quality: "purple",
    startPrice: 1,
    bidIncrement: 1,
    imageData: null,
    sortOrder: partial.id,
    status: "sold",
    currentPrice: partial.soldPrice ?? 0,
    winnerMemberId: null,
    winnerName: null,
    soldPrice: null,
    activatedAt: null,
    endsAt: null,
    closedAt: null,
    dividendMemberIds: [],
    dividendMemberNames: [],
    bidMin: null,
    bidMax: null,
    voteEndsAt: null,
    rollEndsAt: null,
    ...partial,
  };
}

function main() {
  assert.equal(formatAuctionYuan(15), "¥15");
  assert.equal(formatAuctionYuan(15.5), "¥15.50");

  const grouped = groupAuctionResultsByWinner([
    item({
      id: 1,
      name: "稀有制作卷轴",
      soldPrice: 15,
      winnerMemberId: 10,
      winnerName: "云端的琴声",
    }),
    item({
      id: 2,
      name: "枪术书（格挡状态）",
      soldPrice: 1,
      winnerMemberId: 11,
      winnerName: "红唇猎客",
    }),
    item({
      id: 3,
      name: "稀有制作卷轴",
      soldPrice: 15,
      winnerMemberId: 10,
      winnerName: "云端的琴声",
    }),
    item({
      id: 4,
      name: "祝福的防具强化卷轴",
      soldPrice: 6,
      winnerMemberId: 12,
      winnerName: "惊灵",
      quality: "green",
    }),
    item({
      id: 5,
      name: "魔道书（回音魔力催化）",
      soldPrice: 5,
      winnerMemberId: 11,
      winnerName: "红唇猎客",
    }),
    item({
      id: 6,
      name: "二刀流秘传术（双击破）",
      soldPrice: 3,
      winnerMemberId: 11,
      winnerName: "红唇猎客",
    }),
    item({
      id: 7,
      name: "稀有制作卷轴",
      soldPrice: 13,
      winnerMemberId: 10,
      winnerName: "云端的琴声",
    }),
    item({
      id: 8,
      name: "流拍装",
      status: "unsold",
      soldPrice: null,
      winnerMemberId: null,
      winnerName: null,
    }),
  ]);

  assert.equal(grouped.winners.length, 3);
  assert.equal(grouped.winners[0].winnerName, "云端的琴声");
  assert.equal(grouped.winners[0].total, 43);
  assert.deepEqual(
    grouped.winners[0].items.map((i) => i.soldPrice),
    [15, 15, 13],
  );
  assert.equal(grouped.winners[1].winnerName, "红唇猎客");
  assert.equal(grouped.winners[1].total, 9);
  assert.equal(grouped.winners[1].items.length, 3);
  assert.equal(grouped.winners[2].winnerName, "惊灵");
  assert.equal(grouped.winners[2].total, 6);
  assert.equal(grouped.unsold.length, 1);
  assert.equal(grouped.unsold[0].name, "流拍装");

  console.log("auction result grouping checks passed");
}

main();
