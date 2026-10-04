/**
 * Pair OCR participant-name tokens with guild roster members.
 * Used by the admin add-item form (client) and /api/auction/ocr-match.
 */

export type Named = { id: number; name: string };

export type OcrNameHit<T extends Named = Named> = {
  ocrName: string;
  member: T | null;
};

const SKIP_EXACT =
  /^(贡献|贡献度|获得|品级|战盟|名称|普通|守护|参与|参与者|战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|洪门|千帆|千帆舞)$/;

const NAME_SEP = /[-－—–﹣_]/;
const NAME_SEP_ALL = /[-－—–﹣_]/g;

export function compactName(s: string) {
  return s
    .replace(/\s+/g, "")
    .replace(/[、·•.,，。:：;；'"“”‘’|｜]/g, "");
}

/** Roster names are often `花体六字-昵称`. Matching uses the prefix. */
export function splitRosterName(name: string): {
  prefix: string;
  nickname: string;
  compact: string;
} {
  const compact = compactName(name);
  const parts = compact.split(NAME_SEP).filter(Boolean);
  return {
    prefix: parts[0] || compact,
    nickname: parts.slice(1).join(""),
    compact: parts.join(""),
  };
}

export function cleanOcrNameToken(raw: string): string | null {
  const cleaned = compactName(raw)
    .replace(NAME_SEP_ALL, "")
    .replace(/[0-9A-Za-z]/g, "");
  if (cleaned.length < 2 || cleaned.length > 16) return null;
  if (!/^[\u4e00-\u9fff]+$/.test(cleaned)) return null;
  if (SKIP_EXACT.test(cleaned)) return null;
  return cleaned;
}

export function charOverlapRatio(a: string, b: string) {
  if (!a || !b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 0;
  const setA = new Set(a);
  let shared = 0;
  for (const ch of b) {
    if (setA.has(ch)) shared += 1;
  }
  return shared / Math.max(a.length, b.length);
}

/** Tolerate minor OCR glyph mistakes against roster names. */
export function isNearName(token: string, name: string) {
  if (!token || !name) return false;
  if (Math.abs(token.length - name.length) > 1) return false;
  const ratio = charOverlapRatio(token, name);
  if (token.length <= 3) return token.length === name.length && ratio >= 0.5;
  return ratio >= 0.6;
}

export function scoreNameMatch(ocrName: string, memberName: string): number {
  const token = compactName(ocrName).replace(NAME_SEP_ALL, "");
  const { prefix, nickname, compact } = splitRosterName(memberName);
  if (!token || !compact) return 0;
  if (token === compact) return 100;
  if (token.toLowerCase() === compact.toLowerCase()) return 99;
  // Game screenshots only show the ornate 6-glyph prefix.
  if (token === prefix && prefix.length >= 2) return 94;
  if (token === nickname && nickname.length >= 2) return 88;
  if (
    prefix.length >= 4 &&
    token.length >= 4 &&
    (prefix.startsWith(token) || token.startsWith(prefix))
  ) {
    return 82 + (Math.min(token.length, prefix.length) / Math.max(token.length, prefix.length)) * 10;
  }
  if (token.length >= 2 && compact.includes(token)) {
    return 80 + (token.length / compact.length) * 10;
  }
  if (compact.length >= 2 && token.includes(compact)) {
    return 78 + (compact.length / token.length) * 10;
  }
  if (prefix.length >= 4 && isNearName(token, prefix)) {
    return 60 + charOverlapRatio(token, prefix) * 25;
  }
  if (isNearName(token, compact)) {
    return 50 + charOverlapRatio(token, compact) * 20;
  }
  return 0;
}

export function findBestMemberForOcrName<T extends Named>(
  ocrName: string,
  members: T[],
): T | null {
  const token = cleanOcrNameToken(ocrName) ?? compactName(ocrName);
  if (token.length < 2) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const member of members) {
    const score = scoreNameMatch(token, member.name);
    if (score > bestScore) {
      bestScore = score;
      best = member;
    }
  }
  return bestScore > 0 ? best : null;
}

export function pairOcrNamesToMembers<T extends Named>(
  names: string[],
  members: T[],
): {
  hits: OcrNameHit<T>[];
  matched: T[];
  unrecognized: string[];
} {
  const unique: string[] = [];
  for (const raw of names) {
    const token = cleanOcrNameToken(raw);
    if (!token) continue;
    if (!unique.includes(token)) unique.push(token);
  }

  const hits: OcrNameHit<T>[] = unique.map((ocrName) => ({
    ocrName,
    member: findBestMemberForOcrName(ocrName, members),
  }));

  const matchedIds = new Set<number>();
  const matched: T[] = [];
  for (const hit of hits) {
    if (!hit.member || matchedIds.has(hit.member.id)) continue;
    matchedIds.add(hit.member.id);
    matched.push(hit.member);
  }

  const unrecognized = hits
    .filter((hit) => !hit.member)
    .map((hit) => hit.ocrName);

  return { hits, matched, unrecognized };
}
