"use client";

import { prewarmPaddleOcr, recognizeWithPaddle } from "@/lib/ocr/client";
import {
  buildNameClickCrops,
  buildPowerClickCrops,
  buildPowerClickPreview,
} from "./preprocess";
import {
  extractClickedCombatPower,
  extractDetectedName,
} from "./parse";

export type PowerOcrResult = {
  ok: boolean;
  combatPower: number | null;
  powerTop: number | null;
  powerTopText: string;
  text: string;
  previewDataUrl: string;
  error?: string;
};

export type NameOcrResult = {
  nameText: string;
  previewDataUrl: string;
};

/** Warm the local PaddleOCR service when the upload panel opens. */
export function prewarmLeaderboardOcr() {
  prewarmPaddleOcr();
}

function uniqueJoin(chunks: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const chunk of chunks) {
    const key = chunk.replace(/\s+/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(chunk);
  }
  return merged.join("\n");
}

function uniqueJoinName(chunks: string[]) {
  const cleaned = chunks
    .map((c) =>
      c
        .replace(/\+\d+/g, " ")
        .replace(/[0-9]+/g, " ")
        .replace(/[、·•．.･]/g, "丶")
        .replace(/[^\u4e00-\u9fffA-Za-z丶\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  cleaned.sort((a, b) => {
    const ca = (a.match(/[\u4e00-\u9fff]/g) || []).length;
    const cb = (b.match(/[\u4e00-\u9fff]/g) || []).length;
    return cb - ca;
  });

  return uniqueJoin(cleaned);
}

/**
 * OCR combat power from a user click on the number.
 * Only accepts 4–6 digit values.
 */
export async function recognizePowerAtClick(
  image: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<PowerOcrResult> {
  const [crops, previewDataUrl] = await Promise.all([
    buildPowerClickCrops(image, xRatio, yRatio),
    buildPowerClickPreview(image, xRatio, yRatio),
  ]);

  const result = await recognizeWithPaddle(crops, "leaderboard_power");
  const text = uniqueJoin([result.text, ...result.lines]);
  const combatPower = extractClickedCombatPower(text);
  if (combatPower == null) {
    return {
      ok: false,
      combatPower: null,
      powerTop: null,
      powerTopText: text,
      text,
      previewDataUrl,
      error: "未识别到 4–6 位战力数字，请对准战斗力数字再点一次",
    };
  }

  return {
    ok: true,
    combatPower,
    powerTop: combatPower,
    powerTopText: text,
    text,
    previewDataUrl,
  };
}

/**
 * OCR the blue character name from a user click on the screenshot.
 */
export async function recognizeNameAtClick(
  image: File | Blob | string,
  xRatio: number,
  yRatio: number,
  expectedName?: string,
): Promise<NameOcrResult> {
  const bundle = await buildNameClickCrops(image, xRatio, yRatio);
  const result = await recognizeWithPaddle(
    [bundle.colorDataUrl, ...bundle.crops],
    "leaderboard_name",
  );
  const nameText = uniqueJoinName([result.text, ...result.lines]);
  if (
    expectedName &&
    !extractDetectedName(nameText, expectedName).matched &&
    result.text
  ) {
    return {
      nameText: uniqueJoinName([nameText, result.text]),
      previewDataUrl: bundle.previewDataUrl,
    };
  }
  return {
    nameText,
    previewDataUrl: bundle.previewDataUrl,
  };
}
