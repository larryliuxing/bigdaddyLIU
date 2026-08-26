export const DEFAULT_AUCTION_TAX_RATE = 0.05;
export const MAX_AUCTION_TAX_RATE = 0.1;

export function normalizeAuctionTaxRate(
  value: unknown,
  fallback = DEFAULT_AUCTION_TAX_RATE,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_AUCTION_TAX_RATE, Math.max(0, parsed));
}

export function parseAuctionTaxPercent(value: unknown): number | null {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 10) return null;
  return percent / 100;
}

export function formatAuctionTaxPercent(taxRate: number) {
  return Number((normalizeAuctionTaxRate(taxRate) * 100).toFixed(1));
}
