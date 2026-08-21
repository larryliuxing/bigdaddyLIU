/**
 * Validate OCR texts for leaderboard upload.
 * Name comes from a user click crop; combat power from top-left OCR.
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
  return false;
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

function collapseForMatch(text: string, expected: string) {
  const normalized = normalizeOcrText(text);
  if (expectedIsChinese(expected)) {
    return normalized.replace(/[^\u4e00-\u9fff·]/g, "");
  }
  return normalized.replace(/[^\u4e00-\u9fffA-Za-z0-9_·]/g, "");
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
    : expected.replace(/[^\u4e00-\u9fffA-Za-z0-9_·]/g, "");
  if (!exp || !compact) return false;

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
  const powerTop =
    input.powerTop ??
    (input.powerTopText ? extractCombatPower(input.powerTopText) : null);

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
      error: "未识别到左上角战力，请截取包含左上战力的界面",
    };
  }

  return {
    ok: true,
    combatPower: powerTop,
    powerTop,
    detectedName: nameResult.detectedName,
  };
}
