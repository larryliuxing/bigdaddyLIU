/**
 * Parse auction item names from OCR text.
 * Skill books look like "魔道书 (回音魔力催化)"; short gear is 2–4 CJK.
 */

const CJK = /[\u4e00-\u9fff]/;
const ITEM_NAME_WITH_EFFECT =
  /([\u4e00-\u9fff]{2,8})[（(]([\u4e00-\u9fffA-Za-z0-9·•]{2,16})[）)]/;

/** All plausible item-name substrings from OCR raw text. */
export function extractNameCandidates(raw: string): string[] {
  const noSpace = raw.replace(/\s+/g, "");
  const stripped = noSpace
    .replace(/[|｜\[\]【】()（）<>《》·•.,，。:：;；'"“”‘’\-_/\\=+]+/g, "")
    .replace(/^[Xx×]+|[Xx×]+$/g, "");

  const out = new Set<string>();
  const runs = stripped.match(/[\u4e00-\u9fff]{2,8}/g) || [];
  for (const run of runs) {
    out.add(run);
    for (let len = 2; len <= Math.min(6, run.length); len++) {
      for (let i = 0; i + len <= run.length; i++) {
        out.add(run.slice(i, i + len));
      }
    }
  }
  return [...out];
}

/** Prefer the most name-like Chinese run (not the longest noisy string). */
export function cleanItemName(raw: string) {
  const candidates = extractNameCandidates(raw);
  if (!candidates.length) return "";
  let best = "";
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCleanedName(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0 ? best : "";
}

/**
 * Gear names in this game are usually 2–4 CJK chars.
 * Longer OCR junk like "到巨荐生" must lose to "巨斧".
 */
function scoreCleanedName(name: string) {
  if (name.length < 2 || name.length > 8) return 0;
  if (![...name].every((ch) => CJK.test(ch))) return 0;

  let score = 20;
  if (name.length === 2) score += 48;
  else if (name.length === 3) score += 42;
  else if (name.length === 4) score += 28;
  else if (name.length === 5) score += 12;
  else score -= (name.length - 5) * 10;

  if (/^[到的地得一不了]/.test(name) && name.length >= 3) score -= 18;
  if (/[生出在了]$/.test(name) && name.length >= 3) score -= 12;

  return score;
}

function scoreNameCandidate(raw: string, votes: Map<string, number>) {
  const cleaned = cleanItemName(raw);
  if (cleaned.length < 2) return 0;
  const voteBonus = (votes.get(cleaned) ?? 0) * 14;
  const latin = ((raw || "").match(/[A-Za-z0-9]/g) || []).length;
  return scoreCleanedName(cleaned) + voteBonus - latin * 6;
}

function pickBestShortName(candidates: string[]) {
  const votes = new Map<string, number>();
  for (const raw of candidates) {
    for (const c of extractNameCandidates(raw)) {
      if (scoreCleanedName(c) > 0) {
        votes.set(c, (votes.get(c) ?? 0) + 1);
      }
    }
    const cleaned = cleanItemName(raw);
    if (cleaned) votes.set(cleaned, (votes.get(cleaned) ?? 0) + 1);
  }

  let best = "";
  let bestScore = 0;
  const pool = new Set<string>();
  for (const raw of candidates) {
    for (const c of extractNameCandidates(raw)) pool.add(c);
    const cleaned = cleanItemName(raw);
    if (cleaned) pool.add(cleaned);
  }

  for (const name of pool) {
    const score = scoreCleanedName(name) + (votes.get(name) ?? 0) * 14;
    if (
      score > bestScore ||
      (score === bestScore && name.length < best.length)
    ) {
      bestScore = score;
      best = name;
    }
  }

  if (!best) {
    for (const raw of candidates) {
      const score = scoreNameCandidate(raw, votes);
      const cleaned = cleanItemName(raw);
      if (score > bestScore) {
        bestScore = score;
        best = cleaned;
      }
    }
  }
  return best;
}

/** Keep "魔道书 (回音魔力催化)" instead of collapsing to "魔道书". */
export function pickAuctionItemName(candidates: string[]): string {
  for (const raw of candidates) {
    const compact = String(raw || "").replace(/\s+/g, "");
    const match = compact.match(ITEM_NAME_WITH_EFFECT);
    if (match) return `${match[1]} (${match[2]})`;
  }
  return pickBestShortName(candidates);
}
