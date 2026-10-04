import {
  attachPinkRoomFields,
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
import {
  itemClockIso,
  parseEndMs,
  remainingSeconds as remainingFromEndMs,
  roomRemainingFromItems,
} from "./itemClock";
import { isPinkAuction } from "./pink";

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
  /** Include persisted dividend report. Default: skip on lite polls. */
  includeDividendReport?: boolean;
  /** Member viewing the room (for myVote / myRoll). */
  viewerMemberId?: number;
  /** Include base64 screenshots. Default false — use /api/auction/item-image. */
  includeImages?: boolean;
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
  const includeDividendReport = options.includeDividendReport ?? !lite;

  const itemsRaw = session
    ? listItems(session.id, {
        includeImages: Boolean(options.includeImages),
        includeDividends,
      })
    : [];

  const leaders = session ? mapLeadingBidders(session.id) : new Map();
  const bidderItems = withLeadingBidders(itemsRaw, leaders).map((item) =>
    attachPinkRoomFields(item, options.viewerMemberId),
  );
  const items = includePriceStats ? withPriceStats(bidderItems) : bidderItems;
  const nowMs = Date.now();
  const clockedItems = items.map((item) => ({
    ...item,
    remainingSeconds: remainingFromEndMs(
      parseEndMs(itemClockIso(item, session?.endsAt)),
      nowMs,
    ),
  }));
  const activeItems = clockedItems.filter(
    (i) =>
      i.status === "active" ||
      i.status === "voting" ||
      i.status === "rolling",
  );
  const activeItem = activeItems[0] ?? null;

  const minNextBids: Record<number, number> = {};
  for (const item of items.filter((i) => i.status === "active")) {
    if (isPinkAuction(item.quality)) {
      minNextBids[item.id] = item.bidMin ?? item.startPrice;
      continue;
    }
    const hasBids = leaders.has(item.id);
    minNextBids[item.id] = hasBids
      ? item.currentPrice + item.bidIncrement
      : item.startPrice;
  }

  let remainingSeconds: number | null = null;
  let remainingLabel = "本场剩余";
  if (session?.status === "live") {
    const roomClock = roomRemainingFromItems(
      clockedItems,
      session.endsAt,
      nowMs,
    );
    remainingSeconds = roomClock.remainingSeconds;
    remainingLabel = roomClock.remainingLabel;
  } else if (session?.status === "scheduled" && session.scheduledStart) {
    remainingLabel = "距开始";
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
    items: clockedItems,
    activeItems,
    activeItem,
    minNextBids,
    minNextBid: activeItem ? (minNextBids[activeItem.id] ?? null) : null,
    recentEvents: session ? listEvents(session.id, 120) : [],
    recentBids: session ? listBids(session.id, 20) : [],
    serverNow: new Date().toISOString(),
    remainingSeconds,
    remainingLabel,
    dividends: ended && session && includeDividendReport
      ? listDividends(session.id)
      : [],
    dividendsCalculated,
    dividendReport:
      session && ended && includeDividendReport
        ? getDividendReport(session.id)
        : null,
  };
}
