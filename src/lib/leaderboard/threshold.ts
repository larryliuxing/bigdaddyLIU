export const DEFAULT_LEADERBOARD_THRESHOLD_PERCENT = 85;
export const MIN_LEADERBOARD_THRESHOLD_PERCENT = 1;
export const MAX_LEADERBOARD_THRESHOLD_PERCENT = 100;

export function parseLeaderboardThresholdPercent(
  value: unknown,
): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (
    n < MIN_LEADERBOARD_THRESHOLD_PERCENT ||
    n > MAX_LEADERBOARD_THRESHOLD_PERCENT
  ) {
    return null;
  }
  return Math.round(n * 10) / 10;
}

export function normalizeLeaderboardThresholdPercent(
  value: unknown,
  fallback = DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
) {
  return parseLeaderboardThresholdPercent(value) ?? fallback;
}

export function percentToRatio(percent: number) {
  return normalizeLeaderboardThresholdPercent(percent) / 100;
}

export function ratioToPercent(ratio: number) {
  return normalizeLeaderboardThresholdPercent(Number(ratio) * 100);
}

export function formatThresholdPercentLabel(percent: number) {
  const n = normalizeLeaderboardThresholdPercent(percent);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
