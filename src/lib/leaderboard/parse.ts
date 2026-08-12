/**
 * Parse combat-power screenshots.
 * Name identity MUST come from blue name-region OCR, not full-frame white UI.
 */

const UI_SKIP =
  /战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|攻击|移动|施法|侍卫|战盟|普通|守护|贡献|获得|品级|名称|参与|铠卫|复活|支配|骑士|经验|等级|装备|背包|技能|任务|日程|自动|进行中|进行|日程自动/;

function isUiPhrase(token: string) {
  if (UI_SKIP.test(token)) return true;
  if (token.includes("日程") || token.includes("自动") || token.includes("进行")) {
    return true;
  }
  if (token.includes("战斗力") || token.includes("经验")) return true;
  // Long status lines are not character names
  if (token.length >= 6 && /[\u4e00-\u9fff]{6,}/.test(token)) {
    // Allow long member names only if they look like names (no verb-ish UI)
    if (/自动|进行|日程|系统|提示|已完成|已击杀/.test(token)) return true;
  }
  return false;
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

export function extractCombatPower(text: string): number | null {
  const normalized = normalizeOcrText(text);

  const patterns = [
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
    if (!line.includes("战斗力") && !line.includes("战力")) continue;
    const nums = [...line.matchAll(/([0-9]{3,7})/g)].map((m) => Number(m[1]));
    const candidates = nums.filter((n) => n >= 100 && n <= 9_999_999);
    if (candidates.length) return Math.max(...candidates);
  }

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

function fuzzyMatchExpected(text: string, expected: string): boolean {
  if (!expected) return false;
  const compact = collapseCjk(normalizeOcrText(text));
  const exp = collapseCjk(expected);
  if (!exp) return false;

  if (compact.includes(exp)) return true;

  if (exp.length >= 2 && charsInOrder(compact, exp)) return true;

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

/**
 * Extract / match character name from BLUE name-region OCR only.
 */
export function extractDetectedName(
  nameText: string,
  expectedName: string,
): { matched: boolean; detectedName: string | null } {
  const normalized = normalizeOcrText(nameText);
  const expected = expectedName.trim();

  if (!expected) {
    return { matched: false, detectedName: null };
  }

  // Ignore empty blue crops
  if (!collapseCjk(normalized)) {
    return { matched: false, detectedName: null };
  }

  const tokens = tokenize(normalized).filter((t) => !isUiPhrase(t));
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
    if (loose.test(normalized)) {
      return { matched: true, detectedName: expected };
    }
  }

  if (fuzzyMatchExpected(normalized, expected)) {
    return { matched: true, detectedName: expected };
  }

  // Candidate for error UI: prefer short name-like tokens, never status lines
  const candidate =
    tokens.find(
      (t) =>
        t.length >= 2 &&
        t.length <= 8 &&
        /^[\u4e00-\u9fffA-Za-z0-9_·]+$/.test(t) &&
        !isUiPhrase(t) &&
        t.toLowerCase() !== expectedLower,
    ) ?? null;

  return { matched: false, detectedName: candidate };
}

export function parseCombatPowerScreenshot(
  input:
    | string
    | {
        nameText?: string;
        powerText?: string;
        text?: string;
      },
  expectedName: string,
): {
  ok: boolean;
  combatPower: number | null;
  detectedName: string | null;
  error?: string;
} {
  const nameText =
    typeof input === "string" ? input : (input.nameText ?? input.text ?? "");
  const powerText =
    typeof input === "string"
      ? input
      : [input.powerText, input.text].filter(Boolean).join("\n");

  const nameResult = extractDetectedName(nameText, expectedName);
  const combatPower = extractCombatPower(powerText);

  if (!nameResult.matched) {
    return {
      ok: false,
      combatPower,
      detectedName: nameResult.detectedName,
      error: nameResult.detectedName
        ? `截图角色名「${nameResult.detectedName}」与当前账号「${expectedName}」不一致，无法上榜`
        : `截图蓝色角色名中未识别到「${expectedName}」，请截取本人角色界面（顶部蓝色名字）`,
    };
  }

  if (combatPower == null) {
    return {
      ok: false,
      combatPower: null,
      detectedName: nameResult.detectedName,
      error: "未能识别战斗力数值，请确保截图包含「战斗力」及数字",
    };
  }

  return {
    ok: true,
    combatPower,
    detectedName: nameResult.detectedName,
  };
}
