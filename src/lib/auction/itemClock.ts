/**
 * Per-item auction clock.
 *
 * All lots share the session's planned close at the start. If someone bids
 * in the last minute of a lot, only that lot gets +60 seconds from now.
 * Other lots keep their own close time. The session stays live until the
 * last open lot (or pink vote/roll) finishes.
 */

export const ITEM_LAST_MINUTE_MS = 60_000;
export const ITEM_EXTEND_MS = 60_000;

export function parseEndMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Item close time, falling back to the session clock for older rows. */
export function resolveItemEndMs(
  itemEndsAt: string | null | undefined,
  sessionEndsAt: string | null | undefined,
): number | null {
  return parseEndMs(itemEndsAt) ?? parseEndMs(sessionEndsAt);
}

export function remainingSeconds(endMs: number | null, nowMs: number): number | null {
  if (endMs == null) return null;
  return Math.max(0, Math.floor((endMs - nowMs) / 1000));
}

export function itemIsDue(endMs: number | null, nowMs: number): boolean {
  return endMs != null && endMs <= nowMs;
}

export function shouldExtendItemClock(endMs: number | null, nowMs: number): boolean {
  if (endMs == null) return false;
  const remain = endMs - nowMs;
  return remain > 0 && remain <= ITEM_LAST_MINUTE_MS;
}

export function applyLastMinuteExtend(
  endMs: number | null,
  nowMs: number,
): { extended: boolean; endsAtMs: number | null; endsAtIso: string | null } {
  if (!shouldExtendItemClock(endMs, nowMs)) {
    return {
      extended: false,
      endsAtMs: endMs,
      endsAtIso: endMs != null ? new Date(endMs).toISOString() : null,
    };
  }
  const next = nowMs + ITEM_EXTEND_MS;
  return {
    extended: true,
    endsAtMs: next,
    endsAtIso: new Date(next).toISOString(),
  };
}

export function laterIso(currentIso: string | null | undefined, nextIso: string): string {
  const current = parseEndMs(currentIso);
  const next = parseEndMs(nextIso) ?? 0;
  if (current == null || next > current) return nextIso;
  return currentIso as string;
}

export type ItemClockSource = {
  status: string;
  endsAt?: string | null;
  voteEndsAt?: string | null;
  rollEndsAt?: string | null;
};

/** Current clock for a lot: bid close, pink vote, or roll. */
export function itemClockIso(
  item: ItemClockSource,
  sessionEndsAt?: string | null,
): string | null {
  if (item.status === "rolling") return item.rollEndsAt ?? null;
  if (item.status === "voting") return item.voteEndsAt ?? null;
  if (item.status === "active") return item.endsAt ?? sessionEndsAt ?? null;
  return null;
}

export function roomRemainingFromItems(
  items: ItemClockSource[],
  sessionEndsAt: string | null | undefined,
  nowMs: number,
): { remainingSeconds: number | null; remainingLabel: string } {
  const open = items.filter(
    (item) =>
      item.status === "active" ||
      item.status === "voting" ||
      item.status === "rolling",
  );
  if (open.length === 0) {
    return { remainingSeconds: null, remainingLabel: "本场剩余" };
  }

  let maxRemain = 0;
  let hasClock = false;
  let hasActive = false;
  let hasRolling = false;
  for (const item of open) {
    if (item.status === "active") hasActive = true;
    if (item.status === "rolling") hasRolling = true;
    const remain = remainingSeconds(
      parseEndMs(itemClockIso(item, sessionEndsAt)),
      nowMs,
    );
    if (remain == null) continue;
    hasClock = true;
    maxRemain = Math.max(maxRemain, remain);
  }

  return {
    remainingSeconds: hasClock ? maxRemain : null,
    remainingLabel: hasActive
      ? "本场剩余"
      : hasRolling
        ? "掷点剩余"
        : "投票剩余",
  };
}
