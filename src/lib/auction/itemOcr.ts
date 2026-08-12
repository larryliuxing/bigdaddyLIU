/**
 * Auction item tooltip OCR: read the colored name at the top only.
 * Typical layout: icon | quality-colored name | X close, then gray UI rows.
 */

import { createWorker, PSM, type Worker } from "tesseract.js";
import type { ItemQuality } from "@/lib/types";

export type ItemNameOcrResult = {
  name: string;
  quality: ItemQuality | null;
  rawText: string;
  previewDataUrl: string | null;
};

let nameWorkerPromise: Promise<Worker> | null = null;

async function getNameWorker() {
  if (!nameWorkerPromise) {
    nameWorkerPromise = createWorker("chi_sim");
  }
  return nameWorkerPromise;
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

/** Score quality-colored name ink on dark tooltip backgrounds. */
function qualityInkScore(
  r: number,
  g: number,
  b: number,
): {
  score: number;
  quality: ItemQuality | null;
} {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const brightness = (r + g + b) / 3;

  // Dark panel / separators
  if (brightness < 50) return { score: 0, quality: null };

  // White / silver name (low sat, bright)
  if (sat < 40 && brightness >= 175) {
    return { score: 45 + brightness / 8, quality: "white" };
  }

  // Near-gray UI chrome — ignore unless very bright
  if (sat < 22 && brightness < 200) return { score: 0, quality: null };

  // Purple / violet
  if (b > 85 && r > 85 && r > g + 12 && b > g + 12 && sat >= 30) {
    return { score: 72 + sat / 3, quality: "purple" };
  }
  // Pink / magenta
  if (r > 130 && b > 95 && r > g + 20 && b >= g - 5 && sat >= 28) {
    return { score: 66 + sat / 3, quality: "pink" };
  }
  // Blue name text (not gem icons — still scored; icon skipped spatially)
  if (b > r + 22 && b >= g && b > 100 && sat >= 26) {
    return { score: 58 + (b - r) / 2, quality: "blue" };
  }
  // Green (common / uncommon gear) — bright lime included
  if (g > r + 15 && g > b + 12 && g > 100 && sat >= 24) {
    return { score: 68 + (g - Math.max(r, b)) / 2, quality: "green" };
  }
  // Orange / gold
  if (r > 140 && g > 65 && r > b + 35 && g > b + 15 && sat >= 30) {
    return { score: 60 + (r - b) / 3, quality: "orange" };
  }

  // Any saturated bright ink as weak fallback (still name-like)
  if (sat >= 35 && brightness >= 95 && brightness <= 250) {
    return { score: 18 + sat / 5, quality: null };
  }
  return { score: 0, quality: null };
}

function voteQuality(
  votes: Partial<Record<ItemQuality, number>>,
): ItemQuality | null {
  let bestQuality: ItemQuality | null = null;
  let bestVote = 0;
  for (const [q, vote] of Object.entries(votes) as Array<
    [ItemQuality, number]
  >) {
    if (vote > bestVote) {
      bestVote = vote;
      bestQuality = q;
    }
  }
  return bestQuality;
}

type NameBounds = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  quality: ItemQuality | null;
  weak: boolean;
};

/**
 * Find the top colored name band, skipping the left item icon.
 * Icon = dense solid block; name glyphs = intermittent column ink.
 */
function findNameBounds(img: HTMLImageElement): NameBounds {
  const probe = document.createElement("canvas");
  const maxW = 520;
  const scale = Math.min(1, maxW / img.width);
  probe.width = Math.max(1, Math.round(img.width * scale));
  probe.height = Math.max(1, Math.round(img.height * scale));
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法创建画布");
  ctx.drawImage(img, 0, 0, probe.width, probe.height);
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    probe.width,
    probe.height,
  );

  // Header band: top ~24%
  const y0 = Math.floor(height * 0.01);
  const y1 = Math.floor(height * 0.24);
  // Start after typical icon; still scan a bit left to detect icon edge
  const xScan0 = Math.floor(width * 0.02);
  const x1 = Math.floor(width * 0.94);

  const qualityVotes: Partial<Record<ItemQuality, number>> = {};

  let bestRow = -1;
  let bestRowInk = 0;
  for (let y = y0; y < y1; y++) {
    let rowInk = 0;
    for (let x = xScan0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const { score, quality } = qualityInkScore(
        data[i],
        data[i + 1],
        data[i + 2],
      );
      if (score <= 0) continue;
      rowInk += score;
      if (quality) {
        qualityVotes[quality] = (qualityVotes[quality] ?? 0) + score;
      }
    }
    if (rowInk > bestRowInk) {
      bestRowInk = rowInk;
      bestRow = y;
    }
  }

  const fallback = (): NameBounds => ({
    sx: img.width * 0.2,
    sy: img.height * 0.02,
    sw: img.width * 0.72,
    sh: img.height * 0.14,
    quality: voteQuality(qualityVotes),
    weak: true,
  });

  if (bestRow < 0 || bestRowInk < 60) return fallback();

  const rowPad = Math.max(3, Math.floor(height * 0.014));
  const ry0 = Math.max(y0, bestRow - rowPad);
  const ry1 = Math.min(y1, bestRow + Math.max(rowPad * 2, Math.floor(height * 0.035)));
  const rowH = Math.max(1, ry1 - ry0);

  // Column ink density across the name row — icon is a dense block on the left.
  const colInk = new Float32Array(width);
  for (let x = xScan0; x < x1; x++) {
    let inkPixels = 0;
    for (let y = ry0; y < ry1; y++) {
      const i = (y * width + x) * 4;
      const { score } = qualityInkScore(data[i], data[i + 1], data[i + 2]);
      if (score > 0) inkPixels += 1;
    }
    colInk[x] = inkPixels / rowH;
  }

  // Find left icon block: consecutive dense columns near the left.
  const denseCut = 0.42;
  let iconEnd = Math.floor(width * 0.12);
  let inDense = false;
  let denseStart = -1;
  for (let x = xScan0; x < Math.floor(width * 0.45); x++) {
    if (colInk[x] >= denseCut) {
      if (!inDense) {
        inDense = true;
        denseStart = x;
      }
    } else if (inDense) {
      const denseW = x - denseStart;
      // Icon is roughly square-ish vs row height
      if (denseW >= rowH * 0.55) {
        iconEnd = x + Math.max(2, Math.floor(width * 0.01));
      }
      inDense = false;
      denseStart = -1;
      // First solid block is the icon; stop after it ends
      if (iconEnd > Math.floor(width * 0.12)) break;
    }
  }
  if (inDense && denseStart >= 0) {
    const denseW = Math.floor(width * 0.45) - denseStart;
    if (denseW >= rowH * 0.55) {
      iconEnd = Math.floor(width * 0.45);
    }
  }

  // Name text starts after icon: first run of intermittent ink columns
  const textCut = 0.06;
  let minX = x1;
  let maxX = iconEnd;
  let found = false;
  for (let x = Math.max(iconEnd, Math.floor(width * 0.14)); x < x1; x++) {
    if (colInk[x] >= textCut) {
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  // Also refine using actual ink pixels (ignore residual icon bleed)
  const x0 = Math.max(iconEnd, Math.floor(width * 0.14));
  let inkMinX = x1;
  let inkMaxX = x0;
  let inkFound = false;
  for (let y = ry0; y < ry1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const { score } = qualityInkScore(data[i], data[i + 1], data[i + 2]);
      if (score <= 0) continue;
      inkFound = true;
      if (x < inkMinX) inkMinX = x;
      if (x > inkMaxX) inkMaxX = x;
    }
  }

  if (inkFound) {
    minX = inkMinX;
    maxX = inkMaxX;
    found = true;
  }

  if (!found || maxX <= minX) return fallback();

  const padX = Math.max(4, Math.floor((maxX - minX) * 0.06));
  const padY = Math.max(4, Math.floor(rowH * 0.45));
  const bx0 = Math.max(x0, minX - padX);
  const by0 = Math.max(0, ry0 - padY);
  const bx1 = Math.min(width - 1, maxX + padX);
  const by1 = Math.min(height - 1, ry1 + padY);

  return {
    sx: (bx0 / width) * img.width,
    sy: (by0 / height) * img.height,
    sw: ((bx1 - bx0) / width) * img.width,
    sh: ((by1 - by0) / height) * img.height,
    quality: voteQuality(qualityVotes),
    weak: false,
  };
}

function buildNameCrop(
  img: HTMLImageElement,
  bounds: { sx: number; sy: number; sw: number; sh: number },
  scale = 3,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(bounds.sw * scale));
  canvas.height = Math.max(8, Math.round(bounds.sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    Math.max(0, Math.floor(bounds.sx)),
    Math.max(0, Math.floor(bounds.sy)),
    Math.max(1, Math.floor(bounds.sw)),
    Math.max(1, Math.floor(bounds.sh)),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Turn colored name into dark glyphs on white for Tesseract. */
function enhanceNameCrop(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  const dctx = out.getContext("2d");
  if (!sctx || !dctx) throw new Error("无法创建画布");
  const image = sctx.getImageData(0, 0, src.width, src.height);
  const { data } = image;

  // Adaptive cut based on ink brightness so green/blue/purple all survive
  let inkSum = 0;
  let inkCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const { score } = qualityInkScore(data[i], data[i + 1], data[i + 2]);
    if (score > 0) {
      inkSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      inkCount++;
    }
  }
  const inkMean = inkCount > 0 ? inkSum / inkCount : 160;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const { score } = qualityInkScore(r, g, b);
    // Soft ink: keep stroke weight for thin green glyphs
    if (score > 12 || (score > 0 && brightness >= inkMean - 40)) {
      const t = Math.max(0, Math.min(1, score / 80));
      const v = Math.round(28 - t * 18);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  dctx.putImageData(image, 0, 0);

  const padded = document.createElement("canvas");
  const pad = 14;
  padded.width = out.width + pad * 2;
  padded.height = out.height + pad * 2;
  const pctx = padded.getContext("2d");
  if (!pctx) return out;
  pctx.fillStyle = "#ffffff";
  pctx.fillRect(0, 0, padded.width, padded.height);
  pctx.drawImage(out, pad, pad);
  return padded;
}

/** Strip spaces / noise; keep the longest Chinese run. */
export function cleanItemName(raw: string) {
  const noSpace = raw.replace(/\s+/g, "");
  const stripped = noSpace
    .replace(/[|｜\[\]【】()（）<>《》·•.,，。:：;；'"“”‘’\-_/\\=+]+/g, "")
    .replace(/^[Xx×]+|[Xx×]+$/g, "");

  const cjkRuns = stripped.match(/[\u4e00-\u9fff]{2,}/g);
  if (cjkRuns?.length) {
    return cjkRuns.sort((a, b) => b.length - a.length)[0];
  }
  return "";
}

function scoreNameCandidate(raw: string) {
  const cleaned = cleanItemName(raw);
  if (cleaned.length < 2) return 0;
  const cjk = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = ((raw || "").match(/[A-Za-z0-9]/g) || []).length;
  // Prefer pure Chinese item names; Latin/digit OCR noise is common near icons
  if (cjk < 2) return 0;
  if (latin >= cjk) return cjk;
  return cjk * 12 + cleaned.length - latin * 8;
}

async function recognizeNameVariants(worker: Worker, dataUrl: string) {
  const texts: string[] = [];
  for (const psm of [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SPARSE_TEXT] as const) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "0",
        // Item names are Chinese; Latin/digits usually come from icon noise.
        tessedit_char_blacklist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      });
      const result = await worker.recognize(dataUrl);
      const text = (result.data.text || "").trim();
      if (text) texts.push(text);
    } catch {
      // try next
    }
  }
  // One pass without blacklist in case a rare mixed name exists
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      preserve_interword_spaces: "0",
      tessedit_char_blacklist: "",
    });
    const result = await worker.recognize(dataUrl);
    const text = (result.data.text || "").trim();
    if (text) texts.push(text);
  } catch {
    // ignore
  }
  return texts;
}

function pickBestName(candidates: string[]) {
  let best = "";
  let bestScore = 0;
  for (const raw of candidates) {
    const score = scoreNameCandidate(raw);
    const cleaned = cleanItemName(raw);
    if (score > bestScore || (score === bestScore && cleaned.length > best.length)) {
      bestScore = score;
      best = cleaned;
    }
  }
  return best;
}

/**
 * Recognize only the top quality-colored item name from a tooltip screenshot.
 */
export async function recognizeItemName(
  source: File | Blob | string,
): Promise<ItemNameOcrResult> {
  const img = await loadImage(source);
  const bounds = findNameBounds(img);
  const crop = buildNameCrop(img, bounds, bounds.weak ? 2.8 : 3.4);
  const enhanced = enhanceNameCrop(crop);
  const previewDataUrl = enhanced.toDataURL("image/png");

  const worker = await getNameWorker();
  const rawChunks = await recognizeNameVariants(worker, previewDataUrl);

  // Wider header retry if first pass is weak / Latin junk only
  if (pickBestName(rawChunks).length < 2) {
    const fallback = buildNameCrop(
      img,
      {
        sx: img.width * 0.2,
        sy: img.height * 0.015,
        sw: img.width * 0.7,
        sh: img.height * 0.16,
      },
      3,
    );
    const enhancedFallback = enhanceNameCrop(fallback);
    const more = await recognizeNameVariants(
      worker,
      enhancedFallback.toDataURL("image/png"),
    );
    rawChunks.push(...more);
  }

  const name = pickBestName(rawChunks);
  return {
    name,
    quality: bounds.quality,
    rawText: rawChunks.join(" | "),
    previewDataUrl,
  };
}
