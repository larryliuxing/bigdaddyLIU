import type { ItemQuality } from "../types";

/** Last-minute anti-snipe window for purple / pink lots. */
export const ANTI_SNIPE_WINDOW_MS = 60_000;
export const PURPLE_EXTEND_MS = 30_000;
export const PINK_EXTEND_MS = 60_000;

const QUALITY_EXTEND_MS: Partial<Record<ItemQuality, number>> = {
  purple: PURPLE_EXTEND_MS,
  pink: PINK_EXTEND_MS,
};

export function bidExtendMsForQuality(quality: ItemQuality): number {
  return QUALITY_EXTEND_MS[quality] ?? 0;
}

/**
 * Extra milliseconds to add onto the session end time when this quality
 * receives a bid. Returns 0 outside the last minute, or for other colors.
 */
export function extraMsForQualityBid(
  quality: ItemQuality,
  remainingMs: number,
): number {
  if (!(remainingMs > 0) || remainingMs > ANTI_SNIPE_WINDOW_MS) return 0;
  return bidExtendMsForQuality(quality);
}

export function qualityExtendHint(quality: ItemQuality): string | null {
  if (quality === "pink") return "最后一分钟内出价，本场加时 1 分钟";
  if (quality === "purple") return "最后一分钟内出价，本场加时 30 秒";
  return null;
}

export function formatExtendLabel(extraMs: number): string {
  if (extraMs >= 60_000 && extraMs % 60_000 === 0) {
    const minutes = extraMs / 60_000;
    return minutes === 1 ? "1 分钟" : `${minutes} 分钟`;
  }
  return `${Math.round(extraMs / 1000)} 秒`;
}
