"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import { buildCombatPowerOcrVariants } from "./preprocess";

export type CombatPowerOcrResult = {
  nameText: string;
  powerTopText: string;
  powerBottomText: string;
  /** Combined for debug / legacy */
  text: string;
  /** Convenience merge of both power crops */
  powerText: string;
};

let mixedWorkerPromise: Promise<Worker> | null = null;
let nameWorkerPromise: Promise<Worker> | null = null;

async function getMixedWorker() {
  if (!mixedWorkerPromise) {
    mixedWorkerPromise = createWorker("chi_sim+eng");
  }
  return mixedWorkerPromise;
}

async function getNameWorker() {
  if (!nameWorkerPromise) {
    nameWorkerPromise = createWorker("chi_sim");
  }
  return nameWorkerPromise;
}

const NAME_PSMS = [PSM.SINGLE_LINE, PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK] as const;

async function recognizeNameCrop(worker: Worker, dataUrl: string) {
  const chunks: string[] = [];
  for (const psm of NAME_PSMS) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
      });
      const result = await worker.recognize(dataUrl);
      const text = (result.data.text || "").trim();
      if (text) chunks.push(text);
    } catch {
      // next
    }
  }
  return chunks;
}

async function recognizeBlock(worker: Worker, dataUrl: string) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(dataUrl);
  return (result.data.text || "").trim();
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

/**
 * Ratio-template OCR:
 * - nameText from top-left blue name box
 * - powerTopText from top-left 能力值 box
 * - powerBottomText from center-bottom combat power box
 */
export async function recognizeCombatPowerScreenshot(
  image: File | Blob | string,
): Promise<CombatPowerOcrResult> {
  const [nameWorker, mixedWorker] = await Promise.all([
    getNameWorker(),
    getMixedWorker(),
  ]);
  const variants = await buildCombatPowerOcrVariants(image);
  const nameChunks: string[] = [];
  const powerTopChunks: string[] = [];
  const powerBottomChunks: string[] = [];

  for (const variant of variants) {
    try {
      if (variant.mode === "name") {
        nameChunks.push(...(await recognizeNameCrop(nameWorker, variant.dataUrl)));
      } else if (variant.mode === "powerTop") {
        const text = await recognizeBlock(mixedWorker, variant.dataUrl);
        if (text) powerTopChunks.push(text);
      } else {
        const text = await recognizeBlock(mixedWorker, variant.dataUrl);
        if (text) powerBottomChunks.push(text);
      }
    } catch {
      // continue
    }
  }

  try {
    await nameWorker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    await mixedWorker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  } catch {
    // ignore
  }

  const nameText = uniqueJoin(nameChunks);
  const powerTopText = uniqueJoin(powerTopChunks);
  const powerBottomText = uniqueJoin(powerBottomChunks);
  const powerText = uniqueJoin([powerTopText, powerBottomText].filter(Boolean));

  return {
    nameText,
    powerTopText,
    powerBottomText,
    powerText,
    text: uniqueJoin([nameText, powerTopText, powerBottomText].filter(Boolean)),
  };
}
