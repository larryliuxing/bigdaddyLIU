"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  buildNameClickCrops,
  buildNameClickPreview,
  buildPowerCropSetFromImage,
  loadImageForOcr,
} from "./preprocess";
import { extractCombatPower, extractDetectedName } from "./parse";
import { POWER_LAYOUTS } from "./regions";

export type PowerOcrResult = {
  ok: boolean;
  combatPower: number | null;
  powerTop: number | null;
  layoutId: string | null;
  powerTopText: string;
  text: string;
  error?: string;
};

export type NameOcrResult = {
  nameText: string;
  previewDataUrl: string;
};

let powerWorkerPromise: Promise<Worker> | null = null;
let nameWorkerPromise: Promise<Worker> | null = null;

/** Digits-only eng worker — much faster than chi_sim+eng for HUD numbers. */
async function getPowerWorker() {
  if (!powerWorkerPromise) {
    powerWorkerPromise = createWorker("eng");
  }
  return powerWorkerPromise;
}

async function getNameWorker() {
  if (!nameWorkerPromise) {
    nameWorkerPromise = createWorker("chi_sim");
  }
  return nameWorkerPromise;
}

/** Warm WASM + language packs when the upload panel opens. */
export function prewarmLeaderboardOcr() {
  void getPowerWorker();
  void getNameWorker();
}

function isStrongPowerHit(value: number) {
  const digits = String(value).length;
  return value >= 2000 && value <= 99_999 && (digits === 4 || digits === 5);
}

/** One fast digit pass; returns text or "". */
async function recognizeDigits(worker: Worker, dataUrl: string) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: "0123456789",
    preserve_interword_spaces: "0",
  });
  const result = await worker.recognize(dataUrl);
  return (result.data.text || "").trim();
}

async function recognizeNameCrop(
  worker: Worker,
  dataUrl: string,
  expectedName?: string,
) {
  const chunks: string[] = [];
  for (const psm of [PSM.SINGLE_LINE, PSM.SINGLE_WORD, PSM.RAW_LINE] as const) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "",
      });
      const result = await worker.recognize(dataUrl);
      const text = (result.data.text || "").trim();
      if (text) chunks.push(text);
      if (
        expectedName &&
        chunks.length &&
        extractDetectedName(uniqueJoinName(chunks), expectedName).matched
      ) {
        break;
      }
    } catch {
      // next
    }
  }
  return chunks;
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
 * Top-left combat power OCR — fast path:
 * eng digits, raw crop first, stop on first strong 4–5 digit hit.
 */
export async function recognizeCombatPowers(
  image: File | Blob | string,
): Promise<PowerOcrResult> {
  const [worker, img] = await Promise.all([
    getPowerWorker(),
    loadImageForOcr(image),
  ]);

  let fallbackText = "";
  let fallbackLayoutId: string | null = null;
  let best: {
    value: number;
    text: string;
    layoutId: string;
  } | null = null;

  for (const layout of POWER_LAYOUTS) {
    const set = buildPowerCropSetFromImage(img, layout);

    for (const url of set.topDataUrls) {
      let text = "";
      try {
        text = await recognizeDigits(worker, url);
      } catch {
        continue;
      }
      if (!text) continue;

      if (!fallbackText) {
        fallbackText = text;
        fallbackLayoutId = set.layoutId;
      }

      const value = extractCombatPower(text);
      if (value == null) continue;

      if (
        !best ||
        (isStrongPowerHit(value) && !isStrongPowerHit(best.value)) ||
        (isStrongPowerHit(value) &&
          isStrongPowerHit(best.value) &&
          value < best.value)
      ) {
        best = { value, text, layoutId: set.layoutId };
      }

      // Raw crop + strong 4–5 digit → done (skip light + other layouts)
      if (isStrongPowerHit(value) && url === set.topDataUrls[0]) {
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
            tessedit_char_whitelist: "",
          });
        } catch {
          // ignore
        }
        return {
          ok: true,
          combatPower: value,
          powerTop: value,
          layoutId: set.layoutId,
          powerTopText: text,
          text,
        };
      }
    }

    if (best && isStrongPowerHit(best.value)) {
      break;
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

  if (best) {
    return {
      ok: true,
      combatPower: best.value,
      powerTop: best.value,
      layoutId: best.layoutId,
      powerTopText: best.text,
      text: best.text,
    };
  }

  return {
    ok: false,
    combatPower: null,
    powerTop: null,
    layoutId: fallbackLayoutId,
    powerTopText: fallbackText,
    text: fallbackText,
    error: "未识别到左上角战力数字，请截取包含左上战力的界面",
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
  const [worker, crops, previewDataUrl] = await Promise.all([
    getNameWorker(),
    buildNameClickCrops(image, xRatio, yRatio),
    buildNameClickPreview(image, xRatio, yRatio),
  ]);

  const chunks: string[] = [];
  for (const url of crops) {
    try {
      chunks.push(...(await recognizeNameCrop(worker, url, expectedName)));
      if (
        expectedName &&
        chunks.length &&
        extractDetectedName(uniqueJoinName(chunks), expectedName).matched
      ) {
        break;
      }
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

  return {
    nameText: uniqueJoinName(chunks),
    previewDataUrl,
  };
}
