"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  buildNameClickCrops,
  buildNameClickPreview,
  buildPowerCropSets,
} from "./preprocess";
import { extractCombatPower } from "./parse";

export type PowerOcrResult = {
  ok: boolean;
  combatPower: number | null;
  powerTop: number | null;
  powerBottom: number | null;
  layoutId: string | null;
  powerTopText: string;
  powerBottomText: string;
  text: string;
  error?: string;
};

export type NameOcrResult = {
  nameText: string;
  previewDataUrl: string;
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

async function recognizeBlock(worker: Worker, dataUrl: string) {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(dataUrl);
  return (result.data.text || "").trim();
}

async function recognizeNameCrop(worker: Worker, dataUrl: string) {
  const chunks: string[] = [];
  for (const psm of [
    PSM.SINGLE_LINE,
    PSM.RAW_LINE,
    PSM.SINGLE_WORD,
    PSM.SPARSE_TEXT,
  ] as const) {
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

/** Prefer CJK-heavy OCR lines for name matching (drop digit/+ noise). */
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

  // Put lines with more CJK first so parse sees the name sooner
  cleaned.sort((a, b) => {
    const ca = (a.match(/[\u4e00-\u9fff]/g) || []).length;
    const cb = (b.match(/[\u4e00-\u9fff]/g) || []).length;
    return cb - ca;
  });

  return uniqueJoin(cleaned);
}

/**
 * Auto-detect combat power from multiple HUD / panel layouts.
 * Succeeds only when a top-box number equals a bottom-box number.
 */
export async function recognizeCombatPowers(
  image: File | Blob | string,
): Promise<PowerOcrResult> {
  const worker = await getMixedWorker();
  const sets = await buildPowerCropSets(image);

  let fallbackTop: number | null = null;
  let fallbackBottom: number | null = null;
  let fallbackTopText = "";
  let fallbackBottomText = "";

  for (const set of sets) {
    const topChunks: string[] = [];
    const bottomChunks: string[] = [];

    for (const url of set.topDataUrls) {
      try {
        const text = await recognizeBlock(worker, url);
        if (text) topChunks.push(text);
      } catch {
        // continue
      }
    }
    for (const url of set.bottomDataUrls) {
      try {
        const text = await recognizeBlock(worker, url);
        if (text) bottomChunks.push(text);
      } catch {
        // continue
      }
    }

    const powerTopText = uniqueJoin(topChunks);
    const powerBottomText = uniqueJoin(bottomChunks);
    const powerTop = extractCombatPower(powerTopText);
    const powerBottom = extractCombatPower(powerBottomText);

    if (powerTop != null && fallbackTop == null) {
      fallbackTop = powerTop;
      fallbackTopText = powerTopText;
    }
    if (powerBottom != null && fallbackBottom == null) {
      fallbackBottom = powerBottom;
      fallbackBottomText = powerBottomText;
    }

    if (powerTop != null && powerBottom != null && powerTop === powerBottom) {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      } catch {
        // ignore
      }
      return {
        ok: true,
        combatPower: powerTop,
        powerTop,
        powerBottom,
        layoutId: set.layoutId,
        powerTopText,
        powerBottomText,
        text: uniqueJoin([powerTopText, powerBottomText]),
      };
    }
  }

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  } catch {
    // ignore
  }

  if (fallbackTop == null && fallbackBottom == null) {
    return {
      ok: false,
      combatPower: null,
      powerTop: null,
      powerBottom: null,
      layoutId: null,
      powerTopText: "",
      powerBottomText: "",
      text: "",
      error: "未识别到战力数字，请截取包含左上与中下战力的完整界面",
    };
  }

  if (
    fallbackTop != null &&
    fallbackBottom != null &&
    fallbackTop !== fallbackBottom
  ) {
    return {
      ok: false,
      combatPower: null,
      powerTop: fallbackTop,
      powerBottom: fallbackBottom,
      layoutId: null,
      powerTopText: fallbackTopText,
      powerBottomText: fallbackBottomText,
      text: uniqueJoin([fallbackTopText, fallbackBottomText]),
      error: `左上战力（${fallbackTop}）与中下战力（${fallbackBottom}）不一致`,
    };
  }

  return {
    ok: false,
    combatPower: fallbackTop ?? fallbackBottom,
    powerTop: fallbackTop,
    powerBottom: fallbackBottom,
    layoutId: null,
    powerTopText: fallbackTopText,
    powerBottomText: fallbackBottomText,
    text: uniqueJoin([fallbackTopText, fallbackBottomText]),
    error:
      fallbackTop == null
        ? "未识别到左上战力"
        : "未识别到中下战力",
  };
}

/**
 * OCR the blue character name from a user click on the screenshot.
 */
export async function recognizeNameAtClick(
  image: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<NameOcrResult> {
  const [worker, crops, previewDataUrl] = await Promise.all([
    getNameWorker(),
    buildNameClickCrops(image, xRatio, yRatio),
    buildNameClickPreview(image, xRatio, yRatio),
  ]);

  const chunks: string[] = [];
  for (const url of crops) {
    try {
      chunks.push(...(await recognizeNameCrop(worker, url)));
    } catch {
      // continue
    }
  }

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  } catch {
    // ignore
  }

  return {
    nameText: uniqueJoinName(chunks),
    previewDataUrl,
  };
}
