export type MemberRole = "normal" | "officer" | "leader";
export type MemberStatus = "active" | "exited";

export interface Member {
  id: number;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  hasPassword: boolean;
  createdAt: string;
  exitedAt: string | null;
}

export interface MemberRow {
  id: number;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  password_hash: string | null;
  created_at: string;
  exited_at: string | null;
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
  | "pink"
  | "special_pink";

export type AuctionSessionStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "ended";

export type AuctionItemStatus =
  | "pending"
  | "active"
  | "voting"
  | "rolling"
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
  /** Fraction of sold price taken as tax for this session (0–0.1). */
  taxRate: number;
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
  /** Pink items: bid floor / ceiling. Null for normal items. */
  bidMin: number | null;
  bidMax: number | null;
  voteEndsAt: string | null;
  rollEndsAt: string | null;
  /** Latest bid per participant (pink), visible to the room. */
  standingBids?: Array<{
    memberId: number;
    memberName: string;
    amount: number;
  }>;
  voteCastCount?: number;
  voteNeed?: number;
  myVoteCandidateId?: number | null;
  myRollPoints?: number | null;
  tiedMemberIds?: number[];
  rolls?: Array<{ memberId: number; memberName: string; points: number }>;
  /** Current high bidder (live); always real name, never anonymous. */
  leadingBidderId?: number | null;
  leadingBidderName?: string | null;
  /** Historical sold prices for the same item name. */
  priceStats?: ItemPriceStats | null;
  /** True when a screenshot is stored; fetch via /api/auction/item-image. */
  hasImage?: boolean;
}

/** Aggregated sale history for identical item names. */
export interface ItemPriceStats {
  name: string;
  count: number;
  high: number;
  low: number;
  avg: number;
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
  /** Countdown caption: 本场剩余 / 投票剩余 / 掷点剩余 / 距开始 */
  remainingLabel?: string;
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
  /** Base64 data-URL screenshot of drop table; members can enlarge. */
  dropsImage: string | null;
  /** True when a drops image exists even if omitted from lite payloads. */
  hasDropsImage?: boolean;
  sortOrder: number;
  enabled: boolean;
  remainingSeconds: number | null;
  activeRound: BossVoteRound | null;
  lastMark: BossLastMark | null;
}

export interface BossLastMark {
  voteType: BossVoteType;
  at: string;
  members: Array<{ memberId: number; memberName: string }>;
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
