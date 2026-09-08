"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
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

let nameWorkerPromise: Promise<Worker> | null = null;
let timeWorkerPromise: Promise<Worker> | null = null;

async function getNameWorker() {
  if (!nameWorkerPromise) {
    nameWorkerPromise = createWorker("chi_sim");
  }
  return nameWorkerPromise;
}

async function getTimeWorker() {
  if (!timeWorkerPromise) {
    timeWorkerPromise = createWorker("chi_sim+eng");
  }
  return timeWorkerPromise;
}

export function prewarmBossTimerOcr() {
  void getNameWorker();
  void getTimeWorker();
}

async function recognizeCropTexts(
  worker: Worker,
  crops: string[],
  params: Record<string, string>,
  psms: Array<(typeof PSM)[keyof typeof PSM]>,
) {
  const chunks: string[] = [];
  for (const url of crops) {
    for (const psm of psms) {
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          ...params,
        });
        const result = await worker.recognize(url);
        const text = (result.data.text || "").trim();
        if (text) chunks.push(text);
      } catch {
        // next
      }
    }
  }
  return chunks;
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
  const [worker, built] = await Promise.all([
    getNameWorker(),
    buildBossRectCrops(image, rect, "name"),
  ]);
  const chunks = await recognizeCropTexts(
    worker,
    built.crops,
    {
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "",
    },
    [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SPARSE_TEXT],
  );
  return {
    text: pickBestNameText(chunks, bossNames),
    previewDataUrl: built.preview,
  };
}

export async function recognizeBossTimeAtRect(
  image: File | Blob | string,
  rect: RatioRect,
): Promise<BossTimeOcrResult> {
  const [worker, built] = await Promise.all([
    getTimeWorker(),
    buildBossRectCrops(image, rect, "time"),
  ]);
  const chunks = await recognizeCropTexts(
    worker,
    built.crops,
    {
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "0123456789年月日时分:：- ",
    },
    [PSM.SINGLE_LINE, PSM.SINGLE_BLOCK, PSM.AUTO],
  );
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
  } catch {
    // ignore
  }
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
  const [worker, crops, previewDataUrl] = await Promise.all([
    getNameWorker(),
    buildBossNameClickCrops(image, xRatio, yRatio),
    buildBossClickPreview(image, xRatio, yRatio, "name"),
  ]);
  const chunks = await recognizeCropTexts(
    worker,
    crops,
    {
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "",
    },
    [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SPARSE_TEXT],
  );
  return { text: pickBestNameText(chunks, []), previewDataUrl };
}

export async function recognizeBossTimeAtClick(
  image: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<BossTimeOcrResult> {
  const [worker, crops, previewDataUrl] = await Promise.all([
    getTimeWorker(),
    buildBossTimeClickCrops(image, xRatio, yRatio),
    buildBossClickPreview(image, xRatio, yRatio, "time"),
  ]);
  const chunks = await recognizeCropTexts(
    worker,
    crops,
    {
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "0123456789年月日时分:：- ",
    },
    [PSM.SINGLE_BLOCK, PSM.AUTO, PSM.SINGLE_LINE],
  );
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
  } catch {
    // ignore
  }
  return { text: pickBestTimeText(chunks), previewDataUrl };
}
