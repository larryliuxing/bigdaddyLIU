import type { ItemQuality } from "@/lib/types";

export const PINK_VOTE_SECONDS = 90;
export const PINK_ROLL_SECONDS = 90;

/** 特殊粉色：限价出价 + 匿名投票 + 掷点 */
export function isSpecialPinkAuction(
  quality: ItemQuality | string | null | undefined,
) {
  return quality === "special_pink";
}

/** 普通粉色：仅参与者按起拍/加价竞拍 */
export function isOrdinaryPinkAuction(
  quality: ItemQuality | string | null | undefined,
) {
  return quality === "pink";
}

export const ORDINARY_PINK_BID_DENIED = "您未参与此boss战斗，无法出价";

export function isParticipantOnlyAuction(
  quality: ItemQuality | string | null | undefined,
) {
  return isOrdinaryPinkAuction(quality) || isSpecialPinkAuction(quality);
}

/** @deprecated use isSpecialPinkAuction */
export function isPinkAuction(quality: ItemQuality | string | null | undefined) {
  return isSpecialPinkAuction(quality);
}

export type PinkStandingBid = {
  memberId: number;
  amount: number;
};

export type PinkContestResult =
  | { kind: "unsold" }
  | {
      kind: "winner";
      memberId: number;
      amount: number;
      reason: "votes" | "price" | "roll";
    }
  | { kind: "wait_votes" }
  | { kind: "wait_roll"; memberIds: number[] };

function bidMap(bids: PinkStandingBid[]) {
  const map = new Map<number, number>();
  for (const bid of bids) map.set(bid.memberId, bid.amount);
  return map;
}

function pickByPrice(memberIds: number[], amounts: Map<number, number>) {
  let best = -Infinity;
  const top: number[] = [];
  for (const id of memberIds) {
    const amount = amounts.get(id);
    if (amount == null) continue;
    if (amount > best) {
      best = amount;
      top.length = 0;
      top.push(id);
    } else if (amount === best) {
      top.push(id);
    }
  }
  return { top, amount: best };
}

/**
 * Pink item winner: most votes, then higher bid, then unique 1–100 rolls.
 * Votes for non-bidders are ignored. Zero votes falls through to price.
 */
export function resolvePinkContest(input: {
  bids: PinkStandingBid[];
  votes: Array<{ candidateId: number }>;
  rolls: Array<{ memberId: number; points: number }>;
  voteClosed: boolean;
  rollClosed: boolean;
}): PinkContestResult {
  const amounts = bidMap(input.bids);
  const bidderIds = input.bids.map((b) => b.memberId);
  if (!bidderIds.length) return { kind: "unsold" };

  if (!input.voteClosed) return { kind: "wait_votes" };

  const tally = new Map<number, number>();
  for (const id of bidderIds) tally.set(id, 0);
  for (const vote of input.votes) {
    if (!tally.has(vote.candidateId)) continue;
    tally.set(vote.candidateId, (tally.get(vote.candidateId) ?? 0) + 1);
  }

  let maxVotes = 0;
  for (const count of tally.values()) {
    if (count > maxVotes) maxVotes = count;
  }

  const voteLeaders =
    maxVotes <= 0
      ? bidderIds
      : bidderIds.filter((id) => (tally.get(id) ?? 0) === maxVotes);

  if (voteLeaders.length === 1) {
    const memberId = voteLeaders[0]!;
    return {
      kind: "winner",
      memberId,
      amount: amounts.get(memberId) ?? 0,
      reason: maxVotes > 0 ? "votes" : "price",
    };
  }

  const priced = pickByPrice(voteLeaders, amounts);
  if (priced.top.length === 1) {
    return {
      kind: "winner",
      memberId: priced.top[0]!,
      amount: priced.amount,
      reason: "price",
    };
  }

  const tied = priced.top;
  const rollByMember = new Map(
    input.rolls
      .filter((row) => tied.includes(row.memberId))
      .map((row) => [row.memberId, row.points]),
  );
  const allRolled = tied.every((id) => rollByMember.has(id));
  if (!allRolled && !input.rollClosed) {
    return { kind: "wait_roll", memberIds: tied };
  }

  let bestPoints = -1;
  let winnerId: number | null = null;
  for (const id of tied) {
    const points = rollByMember.get(id);
    if (points == null) continue;
    if (points > bestPoints) {
      bestPoints = points;
      winnerId = id;
    }
  }
  if (winnerId != null) {
    return {
      kind: "winner",
      memberId: winnerId,
      amount: amounts.get(winnerId) ?? 0,
      reason: "roll",
    };
  }

  // Nobody rolled before timeout: earliest listed tied bidder.
  const fallback = tied[0]!;
  return {
    kind: "winner",
    memberId: fallback,
    amount: amounts.get(fallback) ?? 0,
    reason: "roll",
  };
}

export function pickUnusedRoll(
  taken: number[],
  random: () => number = Math.random,
): number | null {
  const used = new Set(taken.filter((n) => n >= 1 && n <= 100));
  if (used.size >= 100) return null;
  for (let i = 0; i < 200; i += 1) {
    const n = 1 + Math.floor(random() * 100);
    if (!used.has(n)) return n;
  }
  for (let n = 1; n <= 100; n += 1) {
    if (!used.has(n)) return n;
  }
  return null;
}
