import {
  countBidsForItem,
  getAuctionSettings,
  getPublicAuctionSession,
  getSessionById,
  isDividendsCalculated,
  listBids,
  listDividends,
  listEvents,
  listItems,
  maybeAutoProgress,
} from "@/lib/db";
import type { AuctionRoomState } from "@/lib/types";

export function buildRoomState(sessionId?: number): AuctionRoomState {
  const settings = getAuctionSettings();
  let session = sessionId
    ? getSessionById(sessionId)
    : getPublicAuctionSession();

  if (session) {
    session = maybeAutoProgress(session.id) ?? session;
  }

  const items = session ? listItems(session.id) : [];
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
    dividends: session ? listDividends(session.id) : [],
    dividendsCalculated: session
      ? isDividendsCalculated(session.id)
      : false,
  };
}
