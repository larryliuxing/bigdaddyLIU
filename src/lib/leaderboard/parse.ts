/**
 * Validate OCR texts for leaderboard upload.
 * Name comes from a user click crop; combat power from top-left OCR.
 */

const UI_SKIP =
  /战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|攻击|移动|施法|侍卫|战盟|普通|守护|贡献|获得|品级|名称|参与|铠卫|师卫|复活|支配|骑士|经验|等级|装备|背包|技能|任务|日程|自动|进行中|进行|日程自动|金币|银币/;

/** HUD names often use 丶 / · / 、 between glyphs. OCR may emit any of these. */
const NAME_PUNCT_RE = /[丶、·•．.･]/g;

function isNamePunct(ch: string) {
  return /[丶、·•．.･]/.test(ch);
}

function normalizeNamePunct(text: string) {
  return text.replace(NAME_PUNCT_RE, "丶").replace(/丶{2,}/g, "丶");
}

function stripNamePunct(text: string) {
  return text.replace(/丶/g, "");
}

/**
 * Stylized HUD fonts confuse Tesseract into nearby CJK.
 * Keys are expected glyphs; values are OCR lookalikes.
 */
const NAME_CONFUSABLE: Record<string, string[]> = {
  飞: ["习", "乙", "气", "凡", "弋", "風"],
  抖: ["封", "持", "村", "对", "拌", "料", "肘"],
  音: ["意", "商", "晋", "言", "普", "音"],
  绵: ["碑", "棉", "锦", "理", "编", "再", "型", "礁"],
  羊: ["年", "幸", "午", "苇", "半", "辛", "革", "苹", "羊"],
  洛: ["和", "络", "珞"],
};

/** OCR of 洛 is often 和 / 络 on this HUD font. */
function charsAlign(ocrCh: string, expCh: string) {
  if (ocrCh === expCh) return true;
  if (isNamePunct(ocrCh) && isNamePunct(expCh)) return true;
  const alts = NAME_CONFUSABLE[expCh];
  if (alts && alts.includes(ocrCh)) return true;
  return false;
}

function isUiPhrase(token: string) {
  if (UI_SKIP.test(token)) return true;
  if (token.includes("日程") || token.includes("自动") || token.includes("进行")) {
    return true;
  }
  if (token.includes("战斗力") || token.includes("能力值") || token.includes("经验")) {
    return true;
  }
  return false;
}

function expectedIsChinese(expected: string) {
  return /[\u4e00-\u9fff]/.test(expected);
}

export function isPlausibleNameCandidate(token: string, expected: string) {
  if (!token || isUiPhrase(token)) return false;
  const compact = normalizeNamePunct(token).replace(/[^\u4e00-\u9fffA-Za-z0-9_丶]/g, "");
  if (compact.length < 2 || compact.length > 12) return false;
  if (!/^[\u4e00-\u9fffA-Za-z0-9_丶]+$/.test(compact)) return false;
  if (expectedIsChinese(expected)) {
    const cjk = compact.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    if (cjk < 2) return false;
  }
  return true;
}

/** Soft ceiling for OCR digits — click path only accepts 4–6 digit values. */
const POWER_MIN = 1000;
const POWER_MAX_LABELED = 999_999;
const POWER_MAX_UNLABELED = 999_999;

export function normalizeOcrText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[，]/g, ",")
    .replace(/总\s*战\s*斗\s*力/g, "战斗力")
    .replace(/战\s*斗\s*力/g, "战斗力")
    .replace(/能\s*力\s*值/g, "能力值")
    .replace(/[OoΟо〇]/g, "0")
    .replace(/[Il|！]/g, "1")
    .replace(/[ＳS]/g, "5")
    .replace(/[Ｂ]/g, "8")
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
    )
    // OCR sometimes prefixes HUD zeros: 0013293 → 13293
    .replace(/\b0+(\d{4,6})\b/g, "$1");
}

function isPlausiblePower(value: number, labeled: boolean) {
  if (!Number.isFinite(value)) return false;
  if (value < POWER_MIN) return false;
  if (labeled) return value <= POWER_MAX_LABELED;
  return value <= POWER_MAX_UNLABELED;
}

/** Prefer typical 4–6 digit combat powers over OCR-concatenated junk. */
function scorePowerCandidate(value: number, labeled: boolean) {
  const digits = String(value).length;
  let score = labeled ? 1000 : 0;
  if (digits === 4 || digits === 5) score += 80;
  else if (digits === 6) score += 50;
  else score -= 40;
  if (value >= 2000 && value <= 200_000) score += 20;
  return score;
}

function pickBestPower(values: number[], labeled: boolean): number | null {
  const filtered = values.filter((v) => isPlausiblePower(v, labeled));
  if (!filtered.length) return null;
  filtered.sort(
    (a, b) =>
      scorePowerCandidate(b, labeled) - scorePowerCandidate(a, labeled) ||
      a - b,
  );
  return filtered[0];
}

/**
 * Prefer labeled 能力值/战斗力 when present.
 * Clicked-power path should use extractClickedCombatPower (4–6 digits only).
 */
export function extractCombatPower(text: string): number | null {
  return extractClickedCombatPower(text);
}

/** Combat power from a user click: only accept 4–6 digit values. */
export function extractClickedCombatPower(text: string): number | null {
  const normalized = normalizeOcrText(text);

  const patterns = [
    /战斗力\D{0,20}([0-9]{4,6})/,
    /战力\D{0,12}([0-9]{4,6})/,
    /能力值\D{0,12}([0-9]{4,6})/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (value >= 1000 && value <= 999_999) return value;
    }
  }

  const labeledLineNums: number[] = [];
  for (const line of normalized.split(/\r?\n/)) {
    if (
      !line.includes("战斗力") &&
      !line.includes("战力") &&
      !line.includes("能力值")
    ) {
      continue;
    }
    const after = line.split(/战斗力|能力值|战力/)[1] ?? line;
    const m = after.match(/([0-9]{4,6})/);
    if (m) labeledLineNums.push(Number(m[1]));
  }
  const labeledPick = pickBestPower(
    labeledLineNums.filter((n) => n >= 1000 && n <= 999_999),
    true,
  );
  if (labeledPick != null) return labeledPick;

  const all = [...normalized.matchAll(/([0-9]{4,6})/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 1000 && n <= 999_999);
  return pickBestPower(all, false);
}

function isFourToSixDigitPower(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 1000 &&
    value <= 999_999 &&
    String(Math.trunc(value)).length >= 4 &&
    String(Math.trunc(value)).length <= 6
  );
}

function tokenize(text: string) {
  return text
    .split(/[\s,，|/\\;；\n\r\t:：\[\]【】()（）<>《》]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function collapseForMatch(text: string, expected: string) {
  const normalized = normalizeNamePunct(normalizeOcrText(text));
  if (expectedIsChinese(expected)) {
    return normalized.replace(/[^\u4e00-\u9fff丶]/g, "");
  }
  return normalized.replace(/[^\u4e00-\u9fffA-Za-z0-9_丶]/g, "");
}

function charsInOrder(haystack: string, needle: string) {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) {
      i += 1;
      if (i >= needle.length) return true;
    }
  }
  return false;
}

function charsInOrderAlign(haystack: string, needle: string) {
  let i = 0;
  for (const ch of haystack) {
    if (charsAlign(ch, needle[i])) {
      i += 1;
      if (i >= needle.length) return true;
    }
  }
  return false;
}

function alignWindow(
  ocr: string,
  exp: string,
): { exact: number; aligned: number } | null {
  if (!ocr || !exp) return null;
  if (ocr.length !== exp.length) return null;
  let exact = 0;
  let aligned = 0;
  for (let i = 0; i < exp.length; i += 1) {
    if (ocr[i] === exp[i]) {
      exact += 1;
      aligned += 1;
    } else if (charsAlign(ocr[i], exp[i])) {
      aligned += 1;
    }
  }
  return { exact, aligned };
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

function charCoverage(haystack: string, needle: string) {
  if (!needle) return 0;
  let hit = 0;
  const pool = haystack.split("");
  for (const ch of needle) {
    const idx = pool.indexOf(ch);
    if (idx >= 0) {
      hit += 1;
      pool.splice(idx, 1);
    }
  }
  return hit / needle.length;
}

function fuzzyMatchExpected(text: string, expected: string): boolean {
  if (!expected) return false;
  const compact = collapseForMatch(text, expected);
  const expRaw = expectedIsChinese(expected)
    ? expected.replace(/[^\u4e00-\u9fff丶·、•．.･]/g, "")
    : expected.replace(/[^\u4e00-\u9fffA-Za-z0-9_丶·]/g, "");
  const exp = normalizeNamePunct(expRaw);
  if (!exp || !compact) return false;

  if (compact.includes(exp)) return true;
  if (stripNamePunct(compact) === stripNamePunct(exp) && stripNamePunct(exp).length >= 2) {
    return true;
  }
  if (exp.includes("丶") && stripNamePunct(exp).length >= 2) {
    const a = stripNamePunct(compact);
    const b = stripNamePunct(exp);
    if (a.length === b.length && a.length >= 2) {
      let same = 0;
      let aligned = 0;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] === b[i]) same += 1;
        if (charsAlign(a[i], b[i])) aligned += 1;
      }
      if (aligned === b.length && same >= 1) return true;
    }
  }
  if (exp.length >= 2 && charsInOrder(compact, exp)) return true;
  if (exp.length >= 2 && charsInOrderAlign(compact, exp)) return true;

  const expBare = stripNamePunct(exp);
  const ocrBare = stripNamePunct(compact);

  // Same-length confusable alignment: 封音碑羊 ≈ 抖音绵羊, 习习 ≈ 飞飞
  if (ocrBare.length === expBare.length && expBare.length >= 2) {
    const hit = alignWindow(ocrBare, expBare);
    if (hit) {
      const dup = expBare.length === 2 && expBare[0] === expBare[1];
      if (hit.aligned === expBare.length && (hit.exact >= 1 || dup)) return true;
      if (expBare.length >= 4 && hit.aligned >= expBare.length - 1 && hit.exact >= 1) {
        return true;
      }
    }
  }

  // Sliding same-length windows inside longer OCR dumps
  if (expBare.length >= 2 && ocrBare.length > expBare.length) {
    for (let i = 0; i <= ocrBare.length - expBare.length; i += 1) {
      const hit = alignWindow(ocrBare.slice(i, i + expBare.length), expBare);
      if (!hit) continue;
      const dup = expBare.length === 2 && expBare[0] === expBare[1];
      if (hit.aligned === expBare.length && (hit.exact >= 1 || dup)) return true;
      if (expBare.length >= 4 && hit.aligned >= 3 && hit.exact >= 1) return true;
    }
  }

  // Duplicate 2-char names (飞飞): a single 飞 / 习 is enough
  if (expBare.length === 2 && expBare[0] === expBare[1] && ocrBare.length >= 1 && ocrBare.length <= 3) {
    if ([...ocrBare].every((ch) => charsAlign(ch, expBare[0]))) return true;
  }

  const coverageNeed =
    exp.length >= 4 ? 0.5 : (exp.length - 1) / exp.length;
  if (exp.length >= 3 && charCoverage(compact, exp) >= coverageNeed) {
    if (
      charsInOrder(
        compact,
        [...exp].filter((ch) => compact.includes(ch)).join(""),
      )
    ) {
      return true;
    }
  }

  if (exp.length >= 3) {
    const window = Math.max(exp.length - 1, 2);
    for (let i = 0; i <= compact.length - window; i += 1) {
      for (
        let len = window;
        len <= Math.min(exp.length + 1, compact.length - i);
        len += 1
      ) {
        if (levenshtein(compact.slice(i, i + len), exp) <= 1) return true;
      }
    }
  }

  return false;
}

export function extractDetectedName(
  nameText: string,
  expectedName: string,
): { matched: boolean; detectedName: string | null } {
  const normalized = normalizeOcrText(nameText);
  const expected = expectedName.trim();
  if (!expected) return { matched: false, detectedName: null };

  const compact = collapseForMatch(normalized, expected);
  if (!compact) return { matched: false, detectedName: null };

  const tokens = tokenize(normalized).filter((t) =>
    isPlausibleNameCandidate(t, expected),
  );

  if (tokens.some((t) => t === expected || t.toLowerCase() === expected.toLowerCase())) {
    return { matched: true, detectedName: expected };
  }

  if (expected.length >= 2) {
    const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped.split("").join("\\s*"), "i");
    if (loose.test(normalized) || loose.test(compact)) {
      return { matched: true, detectedName: expected };
    }
  }

  if (fuzzyMatchExpected(normalized, expected)) {
    return { matched: true, detectedName: expected };
  }

  const candidate =
    tokens.find((t) => t.toLowerCase() !== expected.toLowerCase()) ?? null;
  return { matched: false, detectedName: candidate };
}

export function parseCombatPowerScreenshot(
  input: {
    nameText?: string;
    powerTop?: number | null;
    powerTopText?: string;
    nameConfirmed?: boolean;
  },
  expectedName: string,
): {
  ok: boolean;
  combatPower: number | null;
  powerTop: number | null;
  detectedName: string | null;
  error?: string;
} {
  const nameText = input.nameText ?? "";
  const powerTopRaw =
    input.powerTop ??
    (input.powerTopText ? extractClickedCombatPower(input.powerTopText) : null);
  const powerTop =
    powerTopRaw != null && isFourToSixDigitPower(powerTopRaw)
      ? powerTopRaw
      : null;

  const nameResult = extractDetectedName(nameText, expectedName);

  if (!nameText.trim()) {
    return {
      ok: false,
      combatPower: powerTop,
      powerTop,
      detectedName: null,
      error: "请先在截图上点击蓝色角色名",
    };
  }

  if (!nameResult.matched) {
    return {
      ok: false,
      combatPower: powerTop,
      powerTop,
      detectedName: nameResult.detectedName,
      error: nameResult.detectedName
        ? `点击区域识别为「${nameResult.detectedName}」，与账号「${expectedName}」不一致，请点准本人蓝色名字`
        : `点击区域未识别到「${expectedName}」，请对准蓝色角色名再点一次`,
    };
  }

  if (powerTop == null) {
    return {
      ok: false,
      combatPower: null,
      powerTop,
      detectedName: nameResult.detectedName,
      error: "请先点击战斗力数字完成识别（仅接受 4–6 位）",
    };
  }

  return {
    ok: true,
    combatPower: powerTop,
    powerTop,
    detectedName: nameResult.detectedName,
  };
}
