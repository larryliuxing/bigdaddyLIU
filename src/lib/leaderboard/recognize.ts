"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import { buildCombatPowerOcrVariants } from "./preprocess";

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
    // Prefer denser CJK; still allow digits for combat power
    preserve_interword_spaces: "1",
  });

  const result = await worker.recognize(dataUrl);
  return (result.data.text || "").trim();
}

/**
 * Multi-pass OCR tuned for character equipment screenshots:
 * full image + cyan-enhanced name crops + combat-power crop.
 */
export async function recognizeCombatPowerScreenshot(
  image: File | Blob | string,
): Promise<string> {
  const worker = await getWorker();
  const variants = await buildCombatPowerOcrVariants(image);
  const chunks: string[] = [];

  for (const variant of variants) {
    try {
      const text = await recognizeVariant(worker, variant.dataUrl, variant.mode);
      if (text) chunks.push(text);
    } catch {
      // Keep going with other crops
    }
  }

  // Reset to a sensible default for any shared worker reuse
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
    });
  } catch {
    // ignore
  }

  // Deduplicate while preserving order
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
