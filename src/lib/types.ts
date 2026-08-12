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
  /** Fraction of sold price taken as tax, e.g. 0.05 = 5%. */
  taxRate: number;
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

export interface AuctionSessionSummary extends AuctionSession {
  itemCount: number;
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
  belowThreshold?: boolean;
}

/** Per-item per-person dividend share (persisted, public). */
export interface ItemDividendLine {
  id: number;
  sessionId: number;
  itemId: number;
  itemName: string;
  memberId: number | null;
  memberName: string;
  soldPrice: number;
  taxRate: number;
  taxAmount: number;
  poolAmount: number;
  shareAmount: number;
  isTemporary: boolean;
  belowThreshold?: boolean;
}

export interface ItemDividendGroup {
  itemId: number;
  itemName: string;
  soldPrice: number;
  taxRate: number;
  taxAmount: number;
  poolAmount: number;
  lines: ItemDividendLine[];
}

export interface DividendSummary {
  soldCount: number;
  grossSales: number;
  taxRate: number;
  taxTotal: number;
  dividendPool: number;
  payoutTotal: number;
  temporaryTotal: number;
}

export interface DividendReport {
  session: AuctionSession | null;
  calculated: boolean;
  taxRate: number;
  itemGroups: ItemDividendGroup[];
  totals: DividendEntry[];
  summary: DividendSummary;
  belowThresholdMemberIds: number[];
}

export interface AuctionRoomState {
  settings: AuctionSettings;
  session: AuctionSession | null;
  items: AuctionItem[];
  /** All items currently open for bidding. */
  activeItems: AuctionItem[];
  /** @deprecated use activeItems; kept as first active for compatibility */
  activeItem: AuctionItem | null;
  /** Minimum next bid keyed by item id */
  minNextBids: Record<number, number>;
  /** @deprecated use minNextBids */
  minNextBid: number | null;
  recentEvents: AuctionEvent[];
  recentBids: AuctionBid[];
  serverNow: string;
  remainingSeconds: number | null;
  dividends: DividendEntry[];
  dividendsCalculated: boolean;
  dividendReport?: DividendReport | null;
}

export interface LeaderboardEntry {
  id: number;
  memberId: number;
  memberName: string;
  combatPower: number;
  ocrName: string;
  /** Whether a verification screenshot is stored (full image fetched on demand). */
  hasImage: boolean;
  role: MemberRole;
  updatedAt: string;
  rank: number;
  belowThreshold: boolean;
}

export interface LeaderboardStats {
  count: number;
  average: number;
  threshold: number; // average * 0.85
  thresholdRatio: number;
}

export type BossVoteType = "killed" | "not_spawned";
export type BossVoteRoundStatus = "open" | "passed" | "expired";

export interface Boss {
  id: number;
  name: string;
  color: string;
  spawnRate: number;
  intervalHours: number;
  lastKillAt: string | null;
  nextSpawnAt: string | null;
  dropsNote: string | null;
  sortOrder: number;
  enabled: boolean;
  remainingSeconds: number | null;
  activeRound: BossVoteRound | null;
}

export interface BossVoteRound {
  id: number;
  bossId: number;
  voteType: BossVoteType;
  status: BossVoteRoundStatus;
  startedAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  votes: Array<{ memberId: number; memberName: string; createdAt: string }>;
  voteCount: number;
  remainingSeconds: number;
}

export interface BossChatMessage {
  id: number;
  memberId: number | null;
  memberName: string;
  message: string;
  createdAt: string;
}

export interface BossRoomState {
  bosses: Boss[];
  onlineCount: number;
  chat: BossChatMessage[];
  serverNow: string;
  voteNeed: number;
  voteWindowSeconds: number;
}
