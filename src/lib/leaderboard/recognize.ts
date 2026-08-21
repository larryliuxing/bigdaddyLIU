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
let digitWorkerPromise: Promise<Worker> | null = null;
let nameWorkerPromise: Promise<Worker> | null = null;

/** Mixed worker — reads 「战斗力」label + digits on the mid-bottom band. */
async function getPowerWorker() {
  if (!powerWorkerPromise) {
    powerWorkerPromise = createWorker("chi_sim+eng");
  }
  return powerWorkerPromise;
}

/** Fast digits-only fallback for the right half of the band. */
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

/** Warm name OCR when the upload panel opens (power uses server PP-OCR). */
export function prewarmLeaderboardOcr() {
  void getNameWorker();
}

function isStrongPowerHit(value: number) {
  const digits = String(value).length;
  return value >= 2000 && value <= 99_999 && (digits === 4 || digits === 5);
}

function hasPowerLabel(text: string) {
  return /战斗力|总战斗力|战力/.test(text);
}

async function recognizeLabeledBand(worker: Worker, dataUrl: string) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "",
  });
  const result = await worker.recognize(dataUrl);
  return (result.data.text || "").trim();
}

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
 * Mid-bottom 「战斗力」+ number OCR.
 * Fast path: labeled band hit → return. Else digit crop, then next layout.
 */
export async function recognizeCombatPowers(
  image: File | Blob | string,
): Promise<PowerOcrResult> {
  const [labelWorker, digitWorker, img] = await Promise.all([
    getPowerWorker(),
    getDigitWorker(),
    loadImageForOcr(image),
  ]);

  type PowerCandidate = {
    value: number;
    text: string;
    layoutId: string;
    labeled: boolean;
  };

  let fallbackText = "";
  let fallbackLayoutId: string | null = null;
  const state: { best: PowerCandidate | null } = { best: null };

  const consider = (
    value: number,
    text: string,
    layoutId: string,
    labeled: boolean,
  ) => {
    const next: PowerCandidate = { value, text, layoutId, labeled };
    const cur = state.best;
    if (!cur) {
      state.best = next;
      return;
    }
    if (labeled && !cur.labeled) {
      state.best = next;
      return;
    }
    if (
      labeled === cur.labeled &&
      isStrongPowerHit(value) &&
      !isStrongPowerHit(cur.value)
    ) {
      state.best = next;
      return;
    }
    if (
      labeled === cur.labeled &&
      isStrongPowerHit(value) === isStrongPowerHit(cur.value) &&
      value < cur.value
    ) {
      state.best = next;
    }
  };

  for (const layout of POWER_LAYOUTS) {
    const set = buildPowerCropSetFromImage(img, layout);
    // urls: [fullRaw, fullLight, numRaw, numLight]
    const fullUrls = set.topDataUrls.slice(0, 2);
    const numUrls = set.topDataUrls.slice(2);

    for (const url of fullUrls) {
      let text = "";
      try {
        text = await recognizeLabeledBand(labelWorker, url);
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
      const labeled = hasPowerLabel(text);
      consider(value, text, set.layoutId, labeled);

      // 「战斗力」+ 4–5 digit → done
      if (labeled && isStrongPowerHit(value)) {
        try {
          await labelWorker.setParameters({
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

    // Digit-only right half (after sword icon) — one raw then light
    for (const url of numUrls) {
      let text = "";
      try {
        text = await recognizeDigits(digitWorker, url);
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
      consider(value, text, set.layoutId, false);
      if (isStrongPowerHit(value)) {
        // Good enough from number crop — stop this layout's light pass chain
        break;
      }
    }

    if (state.best && state.best.labeled && isStrongPowerHit(state.best.value)) {
      break;
    }
    if (state.best && isStrongPowerHit(state.best.value)) {
      // Unlabeled but strong mid-bottom digit — accept without more layouts
      break;
    }
  }

  try {
    await labelWorker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
    await digitWorker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      tessedit_char_whitelist: "",
    });
  } catch {
    // ignore
  }

  if (state.best) {
    return {
      ok: true,
      combatPower: state.best.value,
      powerTop: state.best.value,
      layoutId: state.best.layoutId,
      powerTopText: state.best.text,
      text: state.best.text,
    };
  }

  return {
    ok: false,
    combatPower: null,
    powerTop: null,
    layoutId: fallbackLayoutId,
    powerTopText: fallbackText,
    text: fallbackText,
    error: "未识别到「战斗力」后的数字，请截取角色下方战斗力完整界面",
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
