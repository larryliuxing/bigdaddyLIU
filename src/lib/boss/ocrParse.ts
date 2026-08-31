/**
 * Parse guild-boss screenshot OCR (click name, then click 击退时间).
 * Times look like: 2026年 08月 31日 10时 46分
 */

import { extractDetectedName } from "@/lib/leaderboard/parse";
import { planTimerFromOcrKill } from "./timer";

const UI_NOISE =
  /首领|道具|参与者|参与|击退时间|出没时间|通知|战盟|分配|结算|内容|成员|信息/;

function fromBeijingDateAndTime(dateYmd: string, hhmm: string) {
  const parts = hhmm.split(":").map(Number);
  const hh = Number.isFinite(parts[0]) ? parts[0] : 0;
  const mm = Number.isFinite(parts[1]) ? parts[1] : 0;
  const local = `${dateYmd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type ParsedBeijingTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  iso: string;
  raw: string;
};

function fullwidthDigits(text: string) {
  return text.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
}

export function normalizeBossTimeOcr(text: string) {
  return fullwidthDigits(text)
    .replace(/\u00a0/g, " ")
    .replace(/[OoΟо〇]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/(\d)\s*午\s*(\d)/g, "$1年$2")
    .replace(/吋|詩|诗/g, "时")
    .replace(/曰/g, "日")
    .replace(/[：:]/g, "时")
    .replace(/\s+/g, " ")
    .trim();
}

const TIME_RE =
  /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*时\s*(\d{1,2})\s*分/g;

const TIME_RE_NO_YEAR =
  /(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(\d{1,2})\s*时\s*(\d{1,2})\s*分/g;

function toParsed(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  raw: string,
): ParsedBeijingTime | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const iso = fromBeijingDateAndTime(ymd, hm);
  if (!iso) return null;
  return {
    year,
    month,
    day,
    hour,
    minute,
    iso,
    raw,
  };
}

export function parseBossTimesFromOcr(
  text: string,
  now: Date = new Date(),
): ParsedBeijingTime[] {
  const normalized = normalizeBossTimeOcr(text);
  const found: ParsedBeijingTime[] = [];
  const seen = new Set<string>();

  TIME_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TIME_RE.exec(normalized))) {
    const parsed = toParsed(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      match[0],
    );
    if (parsed && !seen.has(parsed.iso)) {
      seen.add(parsed.iso);
      found.push(parsed);
    }
  }

  if (found.length) return found;

  const beijingYear = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
    }).format(now),
  );
  TIME_RE_NO_YEAR.lastIndex = 0;
  while ((match = TIME_RE_NO_YEAR.exec(normalized))) {
    const parsed = toParsed(
      beijingYear,
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      match[0],
    );
    if (parsed && !seen.has(parsed.iso)) {
      seen.add(parsed.iso);
      found.push(parsed);
    }
  }
  return found;
}

export function splitKillAndAppearance(times: ParsedBeijingTime[]): {
  kill: ParsedBeijingTime | null;
  appearance: ParsedBeijingTime | null;
} {
  if (!times.length) return { kill: null, appearance: null };
  const sorted = [...times].sort(
    (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime(),
  );
  // Screenshot lists 击退时间 above 出没时间; OCR order usually matches.
  // If two times, earlier = kill, later = next spawn.
  if (sorted.length === 1) return { kill: sorted[0], appearance: null };
  return { kill: sorted[0], appearance: sorted[sorted.length - 1] };
}

function compactCjk(text: string) {
  return text.replace(/[^\u4e00-\u9fff·]/g, "");
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

export function cleanBossNameOcr(text: string) {
  return text
    .replace(UI_NOISE, " ")
    .replace(/[0-9()（）\[\]【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchBossFromOcr<T extends { id: number; name: string }>(
  ocrText: string,
  bosses: T[],
): { boss: T; score: number; raw: string } | null {
  const cleaned = cleanBossNameOcr(ocrText);
  const compact = compactCjk(cleaned);
  if (!cleaned && !compact) return null;

  let best: { boss: T; score: number } | null = null;
  for (const boss of bosses) {
    const name = boss.name.trim();
    if (!name) continue;
    const nameCjk = compactCjk(name) || name;
    let score = 0;
    if (compact === nameCjk || cleaned === name) score = 120;
    else if (compact.includes(nameCjk) && nameCjk.length >= 2) {
      score = 90 + Math.min(20, nameCjk.length);
    } else if (nameCjk.includes(compact) && compact.length >= 2) {
      score = 70 + compact.length;
    } else if (extractDetectedName(cleaned || compact, name).matched) {
      score = 80;
    } else if (nameCjk.length >= 2) {
      const dist = levenshtein(compact, nameCjk);
      if (dist <= 1 && nameCjk.length >= 3) score = 60;
      else if (dist <= 2 && nameCjk.length >= 5) score = 50;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { boss, score };
    }
  }
  if (!best || best.score < 50) return null;
  return { boss: best.boss, score: best.score, raw: cleaned || compact };
}

export function buildOcrTimerDraft(input: {
  killIso: string;
  appearanceIso?: string | null;
  intervalHours: number;
  nowMs?: number;
}) {
  return planTimerFromOcrKill(
    input.killIso,
    input.intervalHours,
    input.appearanceIso ?? null,
    input.nowMs,
  );
}
