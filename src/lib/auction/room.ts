import {
  getAuctionSettings,
  getDividendReport,
  getPublicAuctionSession,
  getSessionById,
  isDividendsCalculated,
  listBids,
  listDividends,
  listEvents,
  listItems,
  mapLeadingBidders,
  mapPriceStatsByNames,
  maybeAutoProgress,
  normalizeItemNameKey,
} from "@/lib/db";
import type { AuctionItem, AuctionRoomState } from "@/lib/types";

export type BuildRoomOptions = {
  /**
   * When true, omit base64 item images and dividend roster details.
   * Used for bid responses and live polling so updates stay fast.
   */
  lite?: boolean;
  /** Override roster loading (bootstrap needs rosters without images). */
  includeDividends?: boolean;
  /** Override historical price-stat loading. */
  includePriceStats?: boolean;
};

function withLeadingBidders(
  items: AuctionItem[],
  leaders: Map<
    number,
    { memberId: number; memberName: string; amount: number }
  >,
): AuctionItem[] {
  return items.map((item) => {
    const lead = leaders.get(item.id);
    return {
      ...item,
      leadingBidderId: lead?.memberId ?? null,
      leadingBidderName: lead?.memberName ?? null,
    };
  });
}

function withPriceStats(items: AuctionItem[]): AuctionItem[] {
  const statsMap = mapPriceStatsByNames(items.map((i) => i.name));
  return items.map((item) => ({
    ...item,
    priceStats: statsMap.get(normalizeItemNameKey(item.name)) ?? null,
  }));
}

export function buildRoomState(
  sessionId?: number,
  options: BuildRoomOptions = {},
): AuctionRoomState {
  const lite = Boolean(options.lite);
  const settings = getAuctionSettings();
  let session = sessionId
    ? getSessionById(sessionId)
    : getPublicAuctionSession();

  if (session) {
    session = maybeAutoProgress(session.id) ?? session;
  }

  const ended = session?.status === "ended";
  const includeDividends = options.includeDividends ?? !lite;
  const includePriceStats = options.includePriceStats ?? !lite;

  const itemsRaw = session
    ? listItems(session.id, {
        includeImages: !lite,
        includeDividends,
      })
    : [];

  const leaders = session ? mapLeadingBidders(session.id) : new Map();
  const bidderItems = withLeadingBidders(itemsRaw, leaders);
  const items = includePriceStats ? withPriceStats(bidderItems) : bidderItems;
  const activeItems = items.filter((i) => i.status === "active");
  const activeItem = activeItems[0] ?? null;

  const minNextBids: Record<number, number> = {};
  for (const item of activeItems) {
    const hasBids = leaders.has(item.id);
    minNextBids[item.id] = hasBids
      ? item.currentPrice + item.bidIncrement
      : item.startPrice;
  }

  let remainingSeconds: number | null = null;
  if (session?.status === "live" && session.endsAt) {
    remainingSeconds = Math.max(
      0,
      Math.floor((new Date(session.endsAt).getTime() - Date.now()) / 1000),
    );
  } else if (session?.status === "scheduled" && session.scheduledStart) {
    remainingSeconds = Math.max(
      0,
      Math.floor(
        (new Date(session.scheduledStart).getTime() - Date.now()) / 1000,
      ),
    );
  }

  const dividendsCalculated = session
    ? isDividendsCalculated(session.id)
    : false;

  return {
    settings,
    session,
    items,
    activeItems,
    activeItem,
    minNextBids,
    minNextBid: activeItem ? (minNextBids[activeItem.id] ?? null) : null,
    recentEvents: session ? listEvents(session.id, 120) : [],
    recentBids: session ? listBids(session.id, 20) : [],
    serverNow: new Date().toISOString(),
    remainingSeconds,
    dividends: ended && session ? listDividends(session.id) : [],
    dividendsCalculated,
    dividendReport: session && ended ? getDividendReport(session.id) : null,
  };
}
