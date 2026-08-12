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
function qualityInkScore(r: number, g: number, b: number): {
  score: number;
  quality: ItemQuality | null;
} {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const brightness = (r + g + b) / 3;

  // Dark panel / separators
  if (brightness < 55) return { score: 0, quality: null };
  // Near-gray UI icons / labels
  if (sat < 18 && brightness < 200) return { score: 0, quality: null };

  // White / silver name
  if (sat < 35 && brightness >= 185) {
    return { score: 40 + brightness / 8, quality: "white" };
  }

  // Purple / violet
  if (b > 90 && r > 90 && r > g + 15 && b > g + 15 && sat >= 35) {
    return { score: 70 + sat / 3, quality: "purple" };
  }
  // Pink / magenta
  if (r > 140 && b > 100 && r > g + 25 && b >= g && sat >= 30) {
    return { score: 65 + sat / 3, quality: "pink" };
  }
  // Blue
  if (b > r + 25 && b >= g && b > 110 && sat >= 28) {
    return { score: 60 + (b - r) / 2, quality: "blue" };
  }
  // Green
  if (g > r + 20 && g > b + 15 && g > 110 && sat >= 28) {
    return { score: 60 + (g - Math.max(r, b)) / 2, quality: "green" };
  }
  // Orange / gold
  if (r > 150 && g > 70 && r > b + 40 && g > b + 20 && sat >= 35) {
    return { score: 60 + (r - b) / 3, quality: "orange" };
  }

  // Any saturated bright ink as weak fallback (still name-like)
  if (sat >= 40 && brightness >= 100 && brightness <= 245) {
    return { score: 20 + sat / 5, quality: null };
  }
  return { score: 0, quality: null };
}

function sampleRegion(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  let ink = 0;
  const qualityVotes: Partial<Record<ItemQuality, number>> = {};
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const { score, quality } = qualityInkScore(
        data[i],
        data[i + 1],
        data[i + 2],
      );
      if (score <= 0) continue;
      ink += score;
      if (quality) {
        qualityVotes[quality] = (qualityVotes[quality] ?? 0) + score;
      }
    }
  }
  let bestQuality: ItemQuality | null = null;
  let bestVote = 0;
  for (const [q, vote] of Object.entries(qualityVotes) as Array<
    [ItemQuality, number]
  >) {
    if (vote > bestVote) {
      bestVote = vote;
      bestQuality = q;
    }
  }
  return { ink, quality: bestQuality };
}

function findNameBounds(img: HTMLImageElement) {
  const probe = document.createElement("canvas");
  const maxW = 480;
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

  // Header band: top ~22%, skip left icon ~16%, skip right close ~8%
  const y0 = Math.floor(height * 0.02);
  const y1 = Math.floor(height * 0.22);
  const x0 = Math.floor(width * 0.16);
  const x1 = Math.floor(width * 0.92);

  let minX = x1;
  let maxX = x0;
  let minY = y1;
  let found = false;
  const qualityVotes: Partial<Record<ItemQuality, number>> = {};

  // Row-scan to keep the first dense text row (name), ignore lower UI rows
  let bestRow = -1;
  let bestRowInk = 0;
  for (let y = y0; y < y1; y++) {
    let rowInk = 0;
    for (let x = x0; x < x1; x++) {
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

  if (bestRow < 0 || bestRowInk < 80) {
    // Fallback: whole header band
    const band = sampleRegion(data, width, x0, y0, x1, y1);
    return {
      sx: img.width * 0.16,
      sy: img.height * 0.02,
      sw: img.width * 0.76,
      sh: img.height * 0.16,
      quality: band.quality,
      weak: true,
    };
  }

  const rowPad = Math.max(2, Math.floor(height * 0.012));
  const ry0 = Math.max(y0, bestRow - rowPad);
  const ry1 = Math.min(y1, bestRow + rowPad * 2);

  for (let y = ry0; y < ry1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const { score } = qualityInkScore(data[i], data[i + 1], data[i + 2]);
      if (score <= 0) continue;
      found = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      // maxY kept via ry1
    }
  }

  let bestQuality: ItemQuality | null = null;
  let bestVote = 0;
  for (const [q, vote] of Object.entries(qualityVotes) as Array<
    [ItemQuality, number]
  >) {
    if (vote > bestVote) {
      bestVote = vote;
      bestQuality = q;
    }
  }

  if (!found) {
    return {
      sx: img.width * 0.16,
      sy: img.height * 0.02,
      sw: img.width * 0.76,
      sh: img.height * 0.14,
      quality: bestQuality,
      weak: true,
    };
  }

  const padX = Math.max(4, Math.floor((maxX - minX) * 0.08));
  const padY = Math.max(3, Math.floor((ry1 - ry0) * 0.35));
  const bx0 = Math.max(0, minX - padX);
  const by0 = Math.max(0, Math.min(minY, ry0) - padY);
  const bx1 = Math.min(width - 1, maxX + padX);
  const by1 = Math.min(height - 1, ry1 + padY);

  return {
    sx: (bx0 / width) * img.width,
    sy: (by0 / height) * img.height,
    sw: ((bx1 - bx0) / width) * img.width,
    sh: ((by1 - by0) / height) * img.height,
    quality: bestQuality,
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
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { score } = qualityInkScore(r, g, b);
    if (score > 0) {
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 20;
      data[i + 3] = 255;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  dctx.putImageData(image, 0, 0);
  // Slight padding plate
  const padded = document.createElement("canvas");
  const pad = 10;
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
  // Allow mixed names with a bit of Latin if needed
  const mixed = stripped.replace(/[^0-9A-Za-z\u4e00-\u9fff]/g, "");
  return mixed;
}

async function recognizeNameVariants(worker: Worker, dataUrl: string) {
  const texts: string[] = [];
  for (const psm of [PSM.SINGLE_LINE, PSM.RAW_LINE, PSM.SPARSE_TEXT] as const) {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "0",
      });
      const result = await worker.recognize(dataUrl);
      const text = (result.data.text || "").trim();
      if (text) texts.push(text);
    } catch {
      // try next
    }
  }
  return texts;
}

function pickBestName(candidates: string[]) {
  let best = "";
  for (const raw of candidates) {
    const cleaned = cleanItemName(raw);
    if (cleaned.length > best.length) best = cleaned;
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
  const crop = buildNameCrop(img, bounds, bounds.weak ? 2.5 : 3.2);
  const enhanced = enhanceNameCrop(crop);
  const previewDataUrl = enhanced.toDataURL("image/png");

  const worker = await getNameWorker();
  const rawChunks = await recognizeNameVariants(worker, previewDataUrl);

  // Also try a slightly taller header crop if first pass is weak
  if (pickBestName(rawChunks).length < 2) {
    const fallback = buildNameCrop(
      img,
      {
        sx: img.width * 0.14,
        sy: img.height * 0.015,
        sw: img.width * 0.78,
        sh: img.height * 0.18,
      },
      2.8,
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
