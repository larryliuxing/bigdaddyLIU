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

let workerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("chi_sim+eng");
  }
  return workerPromise;
}

async function recognizeVariant(
  worker: Worker,
  dataUrl: string,
  mode: "name" | "power" | "full",
) {
  const psm =
    mode === "name"
      ? PSM.SINGLE_LINE
      : mode === "power"
        ? PSM.SINGLE_BLOCK
        : PSM.AUTO;

  await worker.setParameters({
    tessedit_pageseg_mode: psm,
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
 * - nameText: ONLY blue-filtered top crops (never bottom white UI)
 * - powerText: power crop + full frame
 */
export async function recognizeCombatPowerScreenshot(
  image: File | Blob | string,
): Promise<CombatPowerOcrResult> {
  const worker = await getWorker();
  const variants = await buildCombatPowerOcrVariants(image);
  const nameChunks: string[] = [];
  const powerChunks: string[] = [];

  for (const variant of variants) {
    try {
      const text = await recognizeVariant(worker, variant.dataUrl, variant.mode);
      if (!text) continue;
      if (variant.mode === "name") {
        nameChunks.push(text);
      } else {
        powerChunks.push(text);
      }
    } catch {
      // Keep going with other crops
    }
  }

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
    });
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
