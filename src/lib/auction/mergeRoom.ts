import type { AuctionItem, AuctionRoomState } from "@/lib/types";

/** Keep previously loaded fields when applying a lite room payload. */
export function mergeAuctionRoom(
  prev: AuctionRoomState | null,
  next: AuctionRoomState,
): AuctionRoomState {
  if (!prev) return next;
  const previousMap = new Map(prev.items.map((item) => [item.id, item]));
  const patch = (items: AuctionItem[]) =>
    items.map((item) => {
      const previous = previousMap.get(item.id);
      return {
        ...item,
        imageData: item.imageData ?? previous?.imageData ?? null,
        hasImage: item.hasImage ?? previous?.hasImage,
        dividendMemberIds:
          item.dividendMemberIds.length > 0
            ? item.dividendMemberIds
            : (previous?.dividendMemberIds ?? []),
        dividendMemberNames:
          item.dividendMemberNames.length > 0
            ? item.dividendMemberNames
            : (previous?.dividendMemberNames ?? []),
        priceStats: item.priceStats ?? previous?.priceStats ?? null,
      };
    });
  return {
    ...next,
    items: patch(next.items),
    activeItems: patch(next.activeItems),
    activeItem: next.activeItem ? patch([next.activeItem])[0] : null,
    dividends:
      next.dividends.length > 0 ? next.dividends : prev.dividends,
    dividendReport: next.dividendReport ?? prev.dividendReport ?? null,
  };
}
