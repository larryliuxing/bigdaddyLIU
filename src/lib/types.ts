export type MemberRole = "normal" | "officer" | "leader";

export interface Member {
  id: number;
  name: string;
  role: MemberRole;
  hasPassword: boolean;
  createdAt: string;
}

export interface MemberRow {
  id: number;
  name: string;
  role: MemberRole;
  password_hash: string | null;
  created_at: string;
}

export type SessionUser =
  | { type: "member"; id: number; name: string; role: MemberRole }
  | { type: "admin"; username: string };

export type ItemQuality =
  | "white"
  | "green"
  | "blue"
  | "purple"
  | "orange"
  | "pink";

export type AuctionSessionStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "ended";

export type AuctionItemStatus =
  | "pending"
  | "active"
  | "sold"
  | "unsold"
  | "cancelled";

export interface AuctionSettings {
  id: number;
  defaultStartTime: string; // HH:MM
  durationMinutes: number;
  bidExtensionSeconds: number;
  soundEnabledDefault: boolean;
}

export interface AuctionSession {
  id: number;
  status: AuctionSessionStatus;
  scheduledStart: string | null;
  startedAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  currentItemId: number | null;
  note: string | null;
  createdAt: string;
}

export interface AuctionItem {
  id: number;
  sessionId: number;
  name: string;
  quality: ItemQuality;
  startPrice: number;
  bidIncrement: number;
  imageData: string | null;
  sortOrder: number;
  status: AuctionItemStatus;
  currentPrice: number;
  winnerMemberId: number | null;
  winnerName: string | null;
  soldPrice: number | null;
  activatedAt: string | null;
  closedAt: string | null;
  dividendMemberIds: number[];
  dividendMemberNames: string[];
}

export interface AuctionBid {
  id: number;
  sessionId: number;
  itemId: number;
  memberId: number;
  memberName: string;
  amount: number;
  isAnonymous: boolean;
  createdAt: string;
}

export interface AuctionEvent {
  id: number;
  sessionId: number;
  kind: string;
  message: string;
  createdAt: string;
}

export interface DividendEntry {
  id: number;
  sessionId: number;
  memberId: number | null;
  memberName: string;
  amount: number;
  isTemporary: boolean;
  note: string | null;
}

export interface AuctionRoomState {
  settings: AuctionSettings;
  session: AuctionSession | null;
  items: AuctionItem[];
  activeItem: AuctionItem | null;
  recentEvents: AuctionEvent[];
  recentBids: AuctionBid[];
  serverNow: string;
  remainingSeconds: number | null;
  dividends: DividendEntry[];
  dividendsCalculated: boolean;
}
