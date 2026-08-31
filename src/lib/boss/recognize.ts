"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  buildBossClickPreview,
  buildBossNameClickCrops,
  buildBossTimeClickCrops,
} from "./ocrCrops";

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

async function recognizeCrops(
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
  return uniqueJoin(chunks);
}

export type BossNameOcrResult = {
  text: string;
  previewDataUrl: string;
};

export type BossTimeOcrResult = {
  text: string;
  previewDataUrl: string;
};

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
  const text = await recognizeCrops(
    worker,
    crops,
    {
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "",
    },
    [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SPARSE_TEXT],
  );
  const cjk = text.replace(/[^\u4e00-\u9fff·]/g, "");
  return { text: cjk.length >= 2 ? cjk : text, previewDataUrl };
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
  const text = await recognizeCrops(
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
  return { text, previewDataUrl };
}
