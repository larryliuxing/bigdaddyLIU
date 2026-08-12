import {
  countBidsForItem,
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
  maybeAutoProgress,
} from "@/lib/db";
import type { AuctionItem, AuctionRoomState } from "@/lib/types";

export type BuildRoomOptions = {
  /**
   * When true, omit base64 item images and dividend roster details.
   * Used for bid responses and live polling so updates stay fast.
   */
  lite?: boolean;
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

  const live = session?.status === "live";
  const ended = session?.status === "ended";

  const itemsRaw = session
    ? listItems(session.id, {
        includeImages: !lite,
        // Dividend member lists are only needed for admin/ended flows.
        includeDividends: !lite && !live,
      })
    : [];

  const leaders = session ? mapLeadingBidders(session.id) : new Map();
  const items = withLeadingBidders(itemsRaw, leaders);
  const activeItems = items.filter((i) => i.status === "active");
  const activeItem = activeItems[0] ?? null;

  const minNextBids: Record<number, number> = {};
  for (const item of activeItems) {
    const hasBids = countBidsForItem(item.id) > 0;
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
    recentEvents: session ? listEvents(session.id, 8) : [],
    recentBids: session ? listBids(session.id, 20) : [],
    serverNow: new Date().toISOString(),
    remainingSeconds,
    dividends: ended && session ? listDividends(session.id) : [],
    dividendsCalculated,
    dividendReport:
      session && ended
        ? getDividendReport(session.id)
        : null,
  };
}
