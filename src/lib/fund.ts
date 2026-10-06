import type { GuildFund, GuildFundEntry } from "./types";

export const MAX_GUILD_FUND_AMOUNT = 1_000_000_000_000;

const EMPTY_FUND: GuildFund = {
  amount: null,
  updatedAt: null,
  updatedBy: null,
  entries: [],
};

export function emptyGuildFund(): GuildFund {
  return { ...EMPTY_FUND, entries: [] };
}

export function sumFundEntries(entries: GuildFundEntry[]): GuildFund {
  if (entries.length === 0) return emptyGuildFund();
  const ordered = [...entries].sort((a, b) => {
    if (a.transferredAt !== b.transferredAt) {
      return a.transferredAt < b.transferredAt ? 1 : -1;
    }
    return b.id - a.id;
  });
  const amount = ordered.reduce((sum, entry) => sum + entry.amount, 0);
  const latest = ordered[0];
  return {
    amount,
    updatedAt: latest.transferredAt,
    updatedBy: latest.createdBy,
    entries: ordered,
  };
}

/** Beijing wall clock for the deposit form. */
export function beijingNowDateAndTime(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Interpret a Beijing date + HH:MM as an ISO timestamp. */
export function fundTransferredAtIso(
  dateYmd: string,
  hhmm: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const date = new Date(`${dateYmd}T${hhmm}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
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

/** A deposit must be at least 1. */
export function parseFundDeposit(raw: unknown): number | null {
  const amount = parseFundAmount(raw);
  if (amount == null || amount < 1) return null;
  return amount;
}

export function parseFundTransferredAt(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw.trim());
  if (Number.isNaN(date.getTime())) return null;
  const time = date.getTime();
  if (time < Date.parse("2020-01-01T00:00:00Z")) return null;
  if (time > Date.now() + 36 * 60 * 60 * 1000) return null;
  return date.toISOString();
}
