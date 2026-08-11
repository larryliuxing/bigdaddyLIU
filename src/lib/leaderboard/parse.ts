/**
 * Parse combat-power screenshots (e.g. name above character + 战斗力 value).
 */

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
    /战斗力[^\d]{0,12}([0-9]{3,7})/,
    /战力\s*[:\-]?\s*([0-9]{3,7})/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (value >= 100 && value <= 9_999_999) return value;
    }
  }

  // Fallback: number on the same line as 战斗力
  const lines = normalized.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("战斗力") && !line.includes("战力")) continue;
    const nums = [...line.matchAll(/([0-9]{3,7})/g)].map((m) => Number(m[1]));
    const candidate = nums.find((n) => n >= 100);
    if (candidate) return candidate;
  }

  return null;
}

export function extractDetectedName(
  text: string,
  expectedName: string,
): { matched: boolean; detectedName: string | null } {
  const normalized = normalizeOcrText(text);
  const compact = normalized.replace(/\s+/g, "");
  const expected = expectedName.trim();

  if (!expected) {
    return { matched: false, detectedName: null };
  }

  // Primary rule: screenshot must contain the logged-in account name
  if (compact.includes(expected.replace(/\s+/g, "")) || normalized.includes(expected)) {
    return { matched: true, detectedName: expected };
  }

  // Soft OCR variants: allow 1-char noise around expected name tokens
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const loose = new RegExp(escaped.split("").join("\\s*"));
  if (loose.test(normalized) || loose.test(compact)) {
    return { matched: true, detectedName: expected };
  }

  // Try to surface a conflicting name for the error message
  const tokens = normalized
    .split(/[\s,，、|/\\;；\n\r\t:：]+/)
    .map((t) => t.trim())
    .filter((t) => /^[\u4e00-\u9fffA-Za-z0-9_·]{2,12}$/.test(t));

  const skip = /战斗力|能力值|力量|体质|灵巧|敏捷|智力|智慧|攻击|移动|施法|侍卫|战盟|普通|守护/;
  const candidate = tokens.find((t) => !skip.test(t) && t !== expected) ?? null;

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
