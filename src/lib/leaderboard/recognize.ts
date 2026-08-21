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
  layoutId: string | null;
  powerTopText: string;
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

async function recognizePowerCrop(worker: Worker, dataUrl: string) {
  const chunks: string[] = [];
  const passes: Array<{ psm: typeof PSM[keyof typeof PSM]; whitelist: string }> =
    [
      { psm: PSM.SINGLE_LINE, whitelist: "0123456789战斗力能力值:： " },
      { psm: PSM.SINGLE_LINE, whitelist: "0123456789" },
      { psm: PSM.RAW_LINE, whitelist: "0123456789战斗力能力值:： " },
      { psm: PSM.SINGLE_BLOCK, whitelist: "" },
    ];

  for (const pass of passes) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm,
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: pass.whitelist,
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
 * Auto-detect combat power from the top-left HUD / panel region.
 * Collects candidates across layouts and picks the most plausible value
 * (avoids accepting the first OCR digit-soup hit).
 */
export async function recognizeCombatPowers(
  image: File | Blob | string,
): Promise<PowerOcrResult> {
  const worker = await getMixedWorker();
  const sets = await buildPowerCropSets(image);

  type Candidate = {
    value: number;
    text: string;
    layoutId: string;
    labeled: boolean;
  };
  const candidates: Candidate[] = [];
  let fallbackTopText = "";
  let fallbackLayoutId: string | null = null;

  for (const set of sets) {
    const topChunks: string[] = [];

    for (const url of set.topDataUrls) {
      try {
        topChunks.push(...(await recognizePowerCrop(worker, url)));
      } catch {
        // continue
      }
    }

    const powerTopText = uniqueJoin(topChunks);
    if (powerTopText && fallbackTopText === "") {
      fallbackTopText = powerTopText;
      fallbackLayoutId = set.layoutId;
    }

    const powerTop = extractCombatPower(powerTopText);
    if (powerTop != null) {
      const labeled = /战斗力|能力值|战力/.test(powerTopText);
      candidates.push({
        value: powerTop,
        text: powerTopText,
        layoutId: set.layoutId,
        labeled,
      });
      // Strong labeled 4–5 digit hit: stop early
      const digits = String(powerTop).length;
      if (labeled && (digits === 4 || digits === 5) && powerTop <= 99_999) {
        break;
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

  if (candidates.length) {
    candidates.sort((a, b) => {
      const score = (c: Candidate) => {
        const digits = String(c.value).length;
        let s = c.labeled ? 100 : 0;
        if (digits === 4 || digits === 5) s += 50;
        if (c.value >= 2000 && c.value <= 80_000) s += 20;
        if (c.value > 99_999) s -= 80;
        return s;
      };
      return score(b) - score(a) || a.value - b.value;
    });
    const best = candidates[0];
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
    powerTopText: fallbackTopText,
    text: fallbackTopText,
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
