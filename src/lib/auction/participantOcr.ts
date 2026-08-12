/**
 * OCR the leftmost「名称」column from a game「参与者」modal screenshot,
 * then callers match those names against guild members for dividends.
 */

import { createWorker, PSM, type Worker } from "tesseract.js";

export type ParticipantOcrResult = {
  text: string;
  names: string[];
  previewDataUrl: string | null;
};

let participantWorkerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (!participantWorkerPromise) {
    participantWorkerPromise = createWorker("chi_sim");
  }
  return participantWorkerPromise;
}

function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  const url =
    typeof source === "string" ? source : URL.createObjectURL(source);
  const revoke = typeof source !== "string";
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (revoke) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (revoke) URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

type RatioRect = { x: number; y: number; w: number; h: number };

/** Candidate crops for the name column inside a centered participants modal. */
const NAME_COLUMN_CROPS: RatioRect[] = [
  { x: 0.18, y: 0.26, w: 0.2, h: 0.55 },
  { x: 0.16, y: 0.24, w: 0.24, h: 0.58 },
  { x: 0.2, y: 0.28, w: 0.17, h: 0.52 },
  { x: 0.14, y: 0.22, w: 0.28, h: 0.6 },
];

function isNameInk(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const brightness = (r + g + b) / 3;
  // White / light-gray name glyphs on dark rows
  if (brightness >= 165 && sat <= 45) return true;
  // Slightly dimmer row text
  if (brightness >= 140 && sat <= 30) return true;
  return false;
}

function cropRatio(
  img: HTMLImageElement,
  rect: RatioRect,
  scale: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const sw = Math.max(1, Math.floor(img.width * rect.w));
  const sh = Math.max(1, Math.floor(img.height * rect.h));
  canvas.width = Math.max(8, Math.round(sw * scale));
  canvas.height = Math.max(8, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    Math.max(0, Math.floor(img.width * rect.x)),
    Math.max(0, Math.floor(img.height * rect.y)),
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Dark panel → white plate with black glyphs for Tesseract. */
function enhanceNameColumn(src: HTMLCanvasElement): HTMLCanvasElement {
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("无法创建画布");
  const image = sctx.getImageData(0, 0, src.width, src.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    if (isNameInk(data[i], data[i + 1], data[i + 2])) {
      data[i] = 15;
      data[i + 1] = 15;
      data[i + 2] = 15;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    data[i + 3] = 255;
  }
  const out = document.createElement("canvas");
  const pad = 12;
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2;
  const dctx = out.getContext("2d");
  if (!dctx) throw new Error("无法创建画布");
  dctx.fillStyle = "#ffffff";
  dctx.fillRect(0, 0, out.width, out.height);
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  tmp.getContext("2d")!.putImageData(image, 0, 0);
  dctx.drawImage(tmp, pad, pad);
  return out;
}

function cleanNameToken(raw: string) {
  return raw
    .replace(/\s+/g, "")
    .replace(/[|｜\[\]【】()（）<>《》·•.,，。:：;；'"“”‘’\-_/\\=+0-9]/g, "")
    .replace(/^(名称|品级|战盟|贡献度|获得|普通|参与者)+/, "")
    .replace(/(名称|品级|战盟|贡献度|获得|普通)+$/, "");
}

function extractNameCandidates(text: string) {
  const lines = text
    .split(/\n+/)
    .map((l) => cleanNameToken(l))
    .filter(Boolean);

  const names: string[] = [];
  const skip =
    /^(名称|品级|战盟|贡献度|获得|普通|参与者|洪门|守护|能力值)$/;

  for (const line of lines) {
    if (skip.test(line)) continue;
    if (line.length < 2 || line.length > 12) continue;
    if (!/[\u4e00-\u9fff]/.test(line)) continue;
    if (!names.includes(line)) names.push(line);
  }

  // Also pull contiguous CJK runs from messy lines
  for (const line of text.split(/\n+/)) {
    const runs = cleanNameToken(line).match(/[\u4e00-\u9fff]{2,12}/g);
    if (!runs) continue;
    for (const run of runs) {
      if (skip.test(run)) continue;
      if (!names.includes(run)) names.push(run);
    }
  }
  return names;
}

async function recognizeColumn(worker: Worker, dataUrl: string) {
  const chunks: string[] = [];
  for (const psm of [
    PSM.SINGLE_COLUMN,
    PSM.SPARSE_TEXT,
    PSM.SINGLE_BLOCK,
  ] as const) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
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

/**
 * Recognize participant names from the left「名称」column of a modal screenshot.
 */
export async function recognizeParticipantNames(
  source: File | Blob | string,
): Promise<ParticipantOcrResult> {
  const img = await loadImage(source);
  const worker = await getWorker();

  const allText: string[] = [];
  const allNames: string[] = [];
  let previewDataUrl: string | null = null;

  for (const rect of NAME_COLUMN_CROPS) {
    const crop = cropRatio(img, rect, 2.6);
    const enhanced = enhanceNameColumn(crop);
    const dataUrl = enhanced.toDataURL("image/png");
    if (!previewDataUrl) previewDataUrl = dataUrl;
    const texts = await recognizeColumn(worker, dataUrl);
    for (const text of texts) {
      allText.push(text);
      for (const name of extractNameCandidates(text)) {
        if (!allNames.includes(name)) allNames.push(name);
      }
    }
    // Early exit when we already have a healthy set of name-like tokens
    if (allNames.length >= 4) break;
  }

  return {
    text: allText.join("\n"),
    names: allNames,
    previewDataUrl,
  };
}
