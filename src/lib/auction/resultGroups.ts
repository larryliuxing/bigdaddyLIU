import type { AuctionItem } from "../types";

export type WinnerResultGroup = {
  key: string;
  winnerMemberId: number | null;
  winnerName: string;
  total: number;
  items: AuctionItem[];
};

export function formatAuctionYuan(n: number): string {
  const rounded = Math.round(Number(n) * 100) / 100;
  if (!Number.isFinite(rounded)) return "¥0";
  return Number.isInteger(rounded) ? `¥${rounded}` : `¥${rounded.toFixed(2)}`;
}

function soldPriceOf(item: AuctionItem): number {
  const n = Number(item.soldPrice);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isSoldAuctionItem(item: AuctionItem): boolean {
  return item.status === "sold" && soldPriceOf(item) > 0;
}

export function groupAuctionResultsByWinner(items: AuctionItem[]): {
  winners: WinnerResultGroup[];
  unsold: AuctionItem[];
} {
  const winners = new Map<string, WinnerResultGroup>();
  const unsold: AuctionItem[] = [];

  for (const item of items) {
    if (!isSoldAuctionItem(item)) {
      unsold.push(item);
      continue;
    }
    const key =
      item.winnerMemberId != null && item.winnerMemberId > 0
        ? `id:${item.winnerMemberId}`
        : `name:${item.winnerName?.trim() || "unknown"}`;
    const existing = winners.get(key);
    const price = soldPriceOf(item);
    if (existing) {
      existing.items.push(item);
      existing.total += price;
      continue;
    }
    winners.set(key, {
      key,
      winnerMemberId: item.winnerMemberId,
      winnerName: item.winnerName?.trim() || "未知得主",
      total: price,
      items: [item],
    });
  }

  const ranked = [...winners.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.winnerName.localeCompare(b.winnerName, "zh");
  });

  return { winners: ranked, unsold };
}
