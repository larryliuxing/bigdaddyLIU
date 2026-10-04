"use client";

import { recognizeWithPaddle, prewarmPaddleOcr } from "@/lib/ocr/client";
import {
  buildBossClickPreview,
  buildBossNameClickCrops,
  buildBossRectCrops,
  buildBossTimeClickCrops,
  type RatioRect,
} from "./ocrCrops";
import {
  formatParsedBeijingTimes,
  matchBossFromOcr,
  parseBossTimesFromOcr,
} from "./ocrParse";

export function prewarmBossTimerOcr() {
  prewarmPaddleOcr();
}

async function recognizeCropTexts(crops: string[], task: string) {
  const result = await recognizeWithPaddle(crops, task);
  return [result.text, ...result.lines].filter(Boolean);
}

function pickBestNameText(chunks: string[], bossNames: string[]) {
  const roster = bossNames.map((name, id) => ({ id, name }));
  let bestMatched = "";
  let bestScore = 0;
  for (const chunk of chunks) {
    const hit = matchBossFromOcr(chunk, roster);
    if (hit && hit.score > bestScore) {
      bestScore = hit.score;
      bestMatched = hit.boss.name;
    }
  }
  if (bestMatched) return bestMatched;
  for (const chunk of chunks) {
    const cjk = chunk.replace(/[^\u4e00-\u9fff·]/g, "");
    if (cjk.length >= 2) return cjk;
  }
  return chunks[0] ?? "";
}

function pickBestTimeText(chunks: string[]) {
  let bestCount = 0;
  let bestFormatted = "";
  for (const chunk of chunks) {
    const times = parseBossTimesFromOcr(chunk);
    if (times.length > bestCount) {
      bestCount = times.length;
      bestFormatted = formatParsedBeijingTimes(times);
    }
  }
  if (bestFormatted) return bestFormatted;
  return formatParsedBeijingTimes(parseBossTimesFromOcr(chunks.join("\n")));
}

export type BossNameOcrResult = {
  text: string;
  previewDataUrl: string;
};

export type BossTimeOcrResult = {
  text: string;
  previewDataUrl: string;
};

export async function recognizeBossNameAtRect(
  image: File | Blob | string,
  rect: RatioRect,
  bossNames: string[] = [],
): Promise<BossNameOcrResult> {
  const built = await buildBossRectCrops(image, rect, "name");
  const chunks = await recognizeCropTexts(built.crops, "boss_name");
  return {
    text: pickBestNameText(chunks, bossNames),
    previewDataUrl: built.preview,
  };
}

export async function recognizeBossTimeAtRect(
  image: File | Blob | string,
  rect: RatioRect,
): Promise<BossTimeOcrResult> {
  const built = await buildBossRectCrops(image, rect, "time");
  const chunks = await recognizeCropTexts(built.crops, "boss_time");
  return {
    text: pickBestTimeText(chunks),
    previewDataUrl: built.preview,
  };
}

export async function recognizeBossNameAtClick(
  image: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<BossNameOcrResult> {
  const [crops, previewDataUrl] = await Promise.all([
    buildBossNameClickCrops(image, xRatio, yRatio),
    buildBossClickPreview(image, xRatio, yRatio, "name"),
  ]);
  const chunks = await recognizeCropTexts(crops, "boss_name");
  return { text: pickBestNameText(chunks, []), previewDataUrl };
}

export async function recognizeBossTimeAtClick(
  image: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<BossTimeOcrResult> {
  const [crops, previewDataUrl] = await Promise.all([
    buildBossTimeClickCrops(image, xRatio, yRatio),
    buildBossClickPreview(image, xRatio, yRatio, "time"),
  ]);
  const chunks = await recognizeCropTexts(crops, "boss_time");
  return { text: pickBestTimeText(chunks), previewDataUrl };
}
