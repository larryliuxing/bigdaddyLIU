import type { GuildFund } from "./types";

export const MAX_GUILD_FUND_AMOUNT = 1_000_000_000_000;

const EMPTY_FUND: GuildFund = {
  amount: null,
  updatedAt: null,
  updatedBy: null,
};

export function emptyGuildFund(): GuildFund {
  return { ...EMPTY_FUND };
}

export function formatFundAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "尚未公示";
  return Math.round(amount).toLocaleString("zh-CN");
}

export function formatFundUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Parse a posted amount. Accepts 1234567, 1,234,567, or 100万. */
export function parseFundAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0 || raw > MAX_GUILD_FUND_AMOUNT) {
      return null;
    }
    const rounded = Math.round(raw);
    return rounded >= 0 ? rounded : null;
  }
  const text = String(raw ?? "")
    .trim()
    .replace(/[\s,，￥$]/g, "");
  if (!text) return null;
  const wan = /[万萬]$/.test(text);
  const numeric = wan ? text.slice(0, -1) : text;
  if (!/^\d+(\.\d+)?$/.test(numeric)) return null;
  const n = Number(numeric);
  if (!Number.isFinite(n) || n < 0) return null;
  const value = wan ? n * 10_000 : n;
  if (value > MAX_GUILD_FUND_AMOUNT) return null;
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 0) return null;
  return rounded;
}
