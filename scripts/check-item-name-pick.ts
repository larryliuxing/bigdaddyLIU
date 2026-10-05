import assert from "node:assert/strict";
import { pickAuctionItemName } from "../src/lib/auction/itemName";

function main() {
  assert.equal(
    pickAuctionItemName(["魔道书(回音魔力催化）"]),
    "魔道书 (回音魔力催化)",
  );
  assert.equal(
    pickAuctionItemName(["魔道书 (回音魔力催化)"]),
    "魔道书 (回音魔力催化)",
  );
  assert.equal(pickAuctionItemName(["巨斧", "到巨荐生"]), "巨斧");
  assert.equal(pickAuctionItemName([""]), "");

  console.log("item name pick checks passed");
}

main();
