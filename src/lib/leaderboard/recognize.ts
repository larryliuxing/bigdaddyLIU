"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
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

let digitWorkerPromise: Promise<Worker> | null = null;
let nameWorkerPromise: Promise<Worker> | null = null;

async function getDigitWorker() {
  if (!digitWorkerPromise) {
    digitWorkerPromise = createWorker("eng");
  }
  return digitWorkerPromise;
}

async function getNameWorker() {
  if (!nameWorkerPromise) {
    nameWorkerPromise = createWorker("chi_sim");
  }
  return nameWorkerPromise;
}

/** Warm OCR packs when the upload panel opens. */
export function prewarmLeaderboardOcr() {
  void getDigitWorker();
  void getNameWorker();
}

async function recognizeDigits(worker: Worker, dataUrl: string) {
  const chunks: string[] = [];
  for (const psm of [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SINGLE_WORD] as const) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        tessedit_char_whitelist: "0123456789",
        preserve_interword_spaces: "0",
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

async function recognizeNameOnce(
  worker: Worker,
  dataUrl: string,
  psm: PSM,
) {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "",
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

function uniqueJoinName(chunks: string[]) {
  const cleaned = chunks
    .map((c) =>
      c
        .replace(/\+\d+/g, " ")
        .replace(/[0-9]+/g, " ")
        .replace(/[^\u4e00-\u9fffA-Za-z·\s]/g, " ")
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
  const [worker, crops, previewDataUrl] = await Promise.all([
    getDigitWorker(),
    buildPowerClickCrops(image, xRatio, yRatio),
    buildPowerClickPreview(image, xRatio, yRatio),
  ]);

  const chunks: string[] = [];
  for (const url of crops) {
    try {
      chunks.push(...(await recognizeDigits(worker, url)));
      const early = extractClickedCombatPower(uniqueJoin(chunks));
      if (early != null) break;
    } catch {
      // continue
    }
  }

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
  } catch {
    // ignore
  }

  const text = uniqueJoin(chunks);
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
  const [worker, bundle] = await Promise.all([
    getNameWorker(),
    buildNameClickCrops(image, xRatio, yRatio),
  ]);
  const { crops, previewDataUrl } = bundle;

  const chunks: string[] = [];
  const modes = [PSM.SINGLE_LINE, PSM.RAW_LINE] as const;
  outer: for (const psm of modes) {
    for (const url of crops) {
      try {
        const text = await recognizeNameOnce(worker, url, psm);
        if (text) chunks.push(text);
        if (
          expectedName &&
          chunks.length &&
          extractDetectedName(uniqueJoinName(chunks), expectedName).matched
        ) {
          break outer;
        }
      } catch {
        // continue
      }
    }
  }

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
  } catch {
    // ignore
  }

  return {
    nameText: uniqueJoinName(chunks),
    previewDataUrl,
  };
}
