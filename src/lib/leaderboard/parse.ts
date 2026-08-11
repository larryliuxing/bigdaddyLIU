/**
 * Parse combat-power screenshots (e.g. name above character + 战斗力 value).
 */

const UI_SKIP =
  /战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|攻击|移动|施法|侍卫|战盟|普通|守护|贡献|获得|品级|名称|参与/;

export function normalizeOcrText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[，]/g, ",")
    .replace(/战\s*斗\s*力/g, "战斗力")
    .replace(/能\s*力\s*值/g, "能力值");
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

  // Fallback: largest plausible number on the 战斗力 line
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
    .split(/[\s,，、|/\\;；\n\r\t:：]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function extractDetectedName(
  text: string,
  expectedName: string,
): { matched: boolean; detectedName: string | null } {
  const normalized = normalizeOcrText(text);
  const expected = expectedName.trim();

  if (!expected) {
    return { matched: false, detectedName: null };
  }

  const tokens = tokenize(normalized);
  const expectedLower = expected.toLowerCase();

  // Exact token match (case-insensitive for latin)
  const exact = tokens.find(
    (t) => t === expected || t.toLowerCase() === expectedLower,
  );
  if (exact) {
    return { matched: true, detectedName: expected };
  }

  // Soft OCR: spaced characters of expected name as a sequence
  if (expected.length >= 2) {
    const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped.split("").join("\\s*"), "i");
    if (loose.test(normalized)) {
      return { matched: true, detectedName: expected };
    }
  }

  // Short names (1 char): only accept exact token, already failed above
  // Avoid substring false positives like 丹 inside unrelated text

  const candidate =
    tokens.find(
      (t) =>
        t.length >= 2 &&
        t.length <= 12 &&
        /^[\u4e00-\u9fffA-Za-z0-9_·]+$/.test(t) &&
        !UI_SKIP.test(t) &&
        t.toLowerCase() !== expectedLower,
    ) ?? null;

  return { matched: false, detectedName: candidate };
}

export function parseCombatPowerScreenshot(
  text: string,
  expectedName: string,
): {
  ok: boolean;
  combatPower: number | null;
  detectedName: string | null;
  error?: string;
} {
  const nameResult = extractDetectedName(text, expectedName);
  const combatPower = extractCombatPower(text);

  if (!nameResult.matched) {
    return {
      ok: false,
      combatPower,
      detectedName: nameResult.detectedName,
      error: nameResult.detectedName
        ? `截图角色名「${nameResult.detectedName}」与当前账号「${expectedName}」不一致，无法上榜`
        : `截图中未识别到当前账号名「${expectedName}」，请上传本人角色界面截图`,
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
