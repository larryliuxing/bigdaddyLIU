import {
  countBidsForItem,
  getAuctionSettings,
  getLatestSession,
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
    ? maybeAutoProgress(sessionId) ?? getLatestSession()
    : getLatestSession();

  if (session) {
    session = maybeAutoProgress(session.id) ?? session;
  }

  const items = session ? listItems(session.id) : [];
  const activeItem =
    items.find((i) => i.id === session?.currentItemId && i.status === "active") ??
    null;

  let minNextBid: number | null = null;
  if (activeItem) {
    const hasBids = countBidsForItem(activeItem.id) > 0;
    minNextBid = hasBids
      ? activeItem.currentPrice + activeItem.bidIncrement
      : activeItem.startPrice;
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
    activeItem,
    minNextBid,
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
