"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import { buildCombatPowerOcrVariants } from "./preprocess";

export type CombatPowerOcrResult = {
  /** Blue/cyan name-crop OCR only — use this for identity checks */
  nameText: string;
  /** Combat-power crop + full-frame OCR — use for 战斗力 digits */
  powerText: string;
  /** Combined text (debug / legacy storage) */
  text: string;
};

let mixedWorkerPromise: Promise<Worker> | null = null;
let nameWorkerPromise: Promise<Worker> | null = null;

async function getMixedWorker() {
  if (!mixedWorkerPromise) {
    mixedWorkerPromise = createWorker("chi_sim+eng");
  }
  return mixedWorkerPromise;
}

/** Chinese-only worker — avoids Latin junk like "CT" on name crops */
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
      // try next PSM
    }
  }
  return chunks;
}

async function recognizePowerCrop(worker: Worker, dataUrl: string, mode: "power" | "full") {
  await worker.setParameters({
    tessedit_pageseg_mode: mode === "power" ? PSM.SINGLE_BLOCK : PSM.AUTO,
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
 * Multi-pass OCR:
 * - nameText: chi_sim on blue-filtered top crops only
 * - powerText: mixed worker on power + full frame
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
  const powerChunks: string[] = [];

  for (const variant of variants) {
    try {
      if (variant.mode === "name") {
        const parts = await recognizeNameCrop(nameWorker, variant.dataUrl);
        nameChunks.push(...parts);
      } else {
        const text = await recognizePowerCrop(
          mixedWorker,
          variant.dataUrl,
          variant.mode,
        );
        if (text) powerChunks.push(text);
      }
    } catch {
      // Keep going
    }
  }

  try {
    await nameWorker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    await mixedWorker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  } catch {
    // ignore
  }

  const nameText = uniqueJoin(nameChunks);
  const powerText = uniqueJoin(powerChunks);

  return {
    nameText,
    powerText,
    text: uniqueJoin([nameText, powerText].filter(Boolean)),
  };
}
