/**
 * Parse HUD combat-power screenshots using ratio-region OCR texts.
 * Requires: blue name match + top-left power == center-bottom power.
 */

const UI_SKIP =
  /战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|攻击|移动|施法|侍卫|战盟|普通|守护|贡献|获得|品级|名称|参与|铠卫|师卫|复活|支配|骑士|经验|等级|装备|背包|技能|任务|日程|自动|进行中|进行|日程自动|金币|银币/;

function isUiPhrase(token: string) {
  if (UI_SKIP.test(token)) return true;
  if (token.includes("日程") || token.includes("自动") || token.includes("进行")) {
    return true;
  }
  if (token.includes("战斗力") || token.includes("能力值") || token.includes("经验")) {
    return true;
  }
  if (token.length >= 6 && /[\u4e00-\u9fff]{6,}/.test(token)) {
    if (/自动|进行|日程|系统|提示|已完成|已击杀/.test(token)) return true;
  }
  return false;
}

function isMostlyLatin(token: string) {
  const latin = token.match(/[A-Za-z]/g)?.length ?? 0;
  const cjk = token.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return latin > 0 && cjk === 0;
}

function expectedIsChinese(expected: string) {
  return /[\u4e00-\u9fff]/.test(expected);
}

export function isPlausibleNameCandidate(token: string, expected: string) {
  if (!token || isUiPhrase(token)) return false;
  if (token.length < 2 || token.length > 10) return false;
  if (!/^[\u4e00-\u9fffA-Za-z0-9_·]+$/.test(token)) return false;
  if (expectedIsChinese(expected)) {
    const cjk = token.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    if (cjk < 2) return false;
    if (isMostlyLatin(token)) return false;
  }
  return true;
}

export function normalizeOcrText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[，]/g, ",")
    .replace(/战\s*斗\s*力/g, "战斗力")
    .replace(/能\s*力\s*值/g, "能力值")
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
    );
}

/** Prefer labeled 能力值/战斗力; else largest plausible number in the crop. */
export function extractCombatPower(text: string): number | null {
  const normalized = normalizeOcrText(text);

  const patterns = [
    /能力值\s*[:\-]?\s*([0-9]{3,7})/,
    /能力值[^\d]{0,10}([0-9]{3,7})/,
    /战斗力\s*[:\-]?\s*([0-9]{3,7})/,
    /战斗力[^\d]{0,8}([0-9]{3,7})/,
    /战力\s*[:\-]?\s*([0-9]{3,7})/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (value >= 100 && value <= 9_999_999) return value;
    }
  }

  const lines = normalized.split(/\r?\n/);
  for (const line of lines) {
    if (
      !line.includes("战斗力") &&
      !line.includes("战力") &&
      !line.includes("能力值")
    ) {
      continue;
    }
    const nums = [...line.matchAll(/([0-9]{3,7})/g)].map((m) => Number(m[1]));
    const candidates = nums.filter((n) => n >= 100 && n <= 9_999_999);
    if (candidates.length) return Math.max(...candidates);
  }

  // Bottom crop often has a lone large number next to the sword icon
  const all = [...normalized.matchAll(/([0-9]{3,7})/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 100 && n <= 9_999_999);
  if (all.length) return Math.max(...all);

  return null;
}

function tokenize(text: string) {
  return text
    .split(/[\s,，、|/\\;；\n\r\t:：\[\]【】()（）<>《》]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function collapseCjk(text: string) {
  return text.replace(/[^\u4e00-\u9fffA-Za-z0-9_·]/g, "");
}

function collapseForMatch(text: string, expected: string) {
  const normalized = normalizeOcrText(text);
  if (expectedIsChinese(expected)) {
    return normalized.replace(/[^\u4e00-\u9fff·]/g, "");
  }
  return collapseCjk(normalized);
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
  const exp = expectedIsChinese(expected)
    ? expected.replace(/[^\u4e00-\u9fff·]/g, "")
    : collapseCjk(expected);
  if (!exp) return false;

  if (compact.includes(exp)) return true;
  if (exp.length >= 2 && charsInOrder(compact, exp)) return true;

  if (exp.length >= 3 && charCoverage(compact, exp) >= (exp.length - 1) / exp.length) {
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
        const slice = compact.slice(i, i + len);
        if (levenshtein(slice, exp) <= 1) return true;
      }
    }
  }

  if (exp.length === 2) {
    const [a, b] = exp;
    if (compact.includes(a) && compact.includes(b) && charsInOrder(compact, exp)) {
      return true;
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

  if (!expected) {
    return { matched: false, detectedName: null };
  }

  const compact = collapseForMatch(normalized, expected);
  if (!compact) {
    return { matched: false, detectedName: null };
  }

  const tokens = tokenize(normalized).filter((t) =>
    isPlausibleNameCandidate(t, expected),
  );
  const expectedLower = expected.toLowerCase();

  const exact = tokens.find(
    (t) => t === expected || t.toLowerCase() === expectedLower,
  );
  if (exact) {
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
    tokens.find((t) => t.toLowerCase() !== expectedLower) ?? null;

  return { matched: false, detectedName: candidate };
}

export type ParseCombatPowerInput =
  | string
  | {
      nameText?: string;
      powerTopText?: string;
      powerBottomText?: string;
      powerText?: string;
      text?: string;
    };

export function parseCombatPowerScreenshot(
  input: ParseCombatPowerInput,
  expectedName: string,
): {
  ok: boolean;
  combatPower: number | null;
  powerTop: number | null;
  powerBottom: number | null;
  detectedName: string | null;
  error?: string;
} {
  const nameText =
    typeof input === "string" ? input : (input.nameText ?? input.text ?? "");
  const powerTopText =
    typeof input === "string"
      ? input
      : (input.powerTopText ?? input.powerText ?? input.text ?? "");
  const powerBottomText =
    typeof input === "string"
      ? input
      : (input.powerBottomText ?? input.powerText ?? input.text ?? "");

  const nameResult = extractDetectedName(nameText, expectedName);
  const powerTop = extractCombatPower(powerTopText);
  const powerBottom = extractCombatPower(powerBottomText);

  if (!nameResult.matched) {
    return {
      ok: false,
      combatPower: powerTop ?? powerBottom,
      powerTop,
      powerBottom,
      detectedName: nameResult.detectedName,
      error: nameResult.detectedName
        ? `截图角色名「${nameResult.detectedName}」与当前账号「${expectedName}」不一致，无法上榜（请上传本人截图）`
        : `左上角蓝色角色名未识别到「${expectedName}」，请按示例图截取完整界面`,
    };
  }

  if (powerTop == null) {
    return {
      ok: false,
      combatPower: null,
      powerTop,
      powerBottom,
      detectedName: nameResult.detectedName,
      error: "未识别到左上角能力值/战力，请按示例图截取",
    };
  }

  if (powerBottom == null) {
    return {
      ok: false,
      combatPower: null,
      powerTop,
      powerBottom,
      detectedName: nameResult.detectedName,
      error: "未识别到中下方战力数字，请按示例图截取",
    };
  }

  if (powerTop !== powerBottom) {
    return {
      ok: false,
      combatPower: null,
      powerTop,
      powerBottom,
      detectedName: nameResult.detectedName,
      error: `左上角战力（${powerTop}）与中下战力（${powerBottom}）不一致，请重新截图`,
    };
  }

  return {
    ok: true,
    combatPower: powerTop,
    powerTop,
    powerBottom,
    detectedName: nameResult.detectedName,
  };
}
