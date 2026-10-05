/**
 * Auction item tooltip OCR: read the colored name at the top only.
 * Typical layout: icon | quality-colored name | X close, then gray UI rows.
 *
 * Failure mode to avoid: left icon bleed → junk glyphs ("到巨荐生" for "巨斧").
 */

import { pickAuctionItemName } from "@/lib/auction/itemName";
import { recognizeWithPaddle } from "@/lib/ocr/client";
import type { ItemQuality } from "@/lib/types";

export {
  cleanItemName,
  extractNameCandidates,
  pickAuctionItemName,
} from "@/lib/auction/itemName";

export type ItemNameOcrResult = {
  name: string;
  quality: ItemQuality | null;
  rawText: string;
  previewDataUrl: string | null;
};

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

  if (brightness < 50) return { score: 0, quality: null };

  // White / silver name (low sat, bright) — not metallic icon glitter
  if (sat < 40 && brightness >= 185) {
    return { score: 45 + brightness / 8, quality: "white" };
  }

  if (sat < 22 && brightness < 200) return { score: 0, quality: null };

  // Purple / violet (common epic names)
  if (b > 85 && r > 85 && r > g + 12 && b > g + 12 && sat >= 28) {
    return { score: 78 + sat / 3, quality: "purple" };
  }
  // Pink / magenta
  if (r > 130 && b > 95 && r > g + 20 && b >= g - 5 && sat >= 28) {
    return { score: 66 + sat / 3, quality: "pink" };
  }
  // Blue
  if (b > r + 22 && b >= g && b > 100 && sat >= 26) {
    return { score: 58 + (b - r) / 2, quality: "blue" };
  }
  // Green
  if (g > r + 15 && g > b + 12 && g > 100 && sat >= 24) {
    return { score: 68 + (g - Math.max(r, b)) / 2, quality: "green" };
  }
  // Orange / gold
  if (r > 140 && g > 65 && r > b + 35 && g > b + 15 && sat >= 30) {
    return { score: 60 + (r - b) / 3, quality: "orange" };
  }

  if (sat >= 35 && brightness >= 95 && brightness <= 250) {
    return { score: 18 + sat / 5, quality: null };
  }
  return { score: 0, quality: null };
}

/** Any non-panel pixel — used to find the solid left icon block. */
function isNonPanelPixel(r: number, g: number, b: number) {
  const brightness = (r + g + b) / 3;
  if (brightness < 48) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Dark gray chrome still counts if mid-bright (icon edges, lock badge)
  return brightness >= 55 || max - min >= 18;
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
 * Find the top colored name band, aggressively skipping the left item icon.
 * Icon = dense filled block (any bright pixels); name = sparse quality ink.
 */
function findNameBounds(img: HTMLImageElement): NameBounds {
  const probe = document.createElement("canvas");
  const maxW = 640;
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

  const y0 = Math.floor(height * 0.008);
  const y1 = Math.floor(height * 0.22);
  const xScan0 = Math.floor(width * 0.01);
  const x1 = Math.floor(width * 0.92);

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
    sx: img.width * 0.26,
    sy: img.height * 0.02,
    sw: img.width * 0.55,
    sh: img.height * 0.12,
    quality: voteQuality(qualityVotes),
    weak: true,
  });

  if (bestRow < 0 || bestRowInk < 60) return fallback();

  const rowPad = Math.max(3, Math.floor(height * 0.012));
  const ry0 = Math.max(y0, bestRow - rowPad);
  const ry1 = Math.min(
    y1,
    bestRow + Math.max(rowPad * 2, Math.floor(height * 0.032)),
  );
  const rowH = Math.max(1, ry1 - ry0);

  // Column densities: solid icon vs quality name ink
  const colSolid = new Float32Array(width);
  const colQuality = new Float32Array(width);
  for (let x = xScan0; x < x1; x++) {
    let solid = 0;
    let quality = 0;
    for (let y = ry0; y < ry1; y++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isNonPanelPixel(r, g, b)) solid += 1;
      if (qualityInkScore(r, g, b).score > 0) quality += 1;
    }
    colSolid[x] = solid / rowH;
    colQuality[x] = quality / rowH;
  }

  // Icon = first wide dense solid block in left ~48%
  const solidCut = 0.38;
  let iconEnd = Math.floor(width * 0.18);
  let inDense = false;
  let denseStart = -1;
  const leftLimit = Math.floor(width * 0.48);
  for (let x = xScan0; x < leftLimit; x++) {
    if (colSolid[x] >= solidCut) {
      if (!inDense) {
        inDense = true;
        denseStart = x;
      }
    } else if (inDense) {
      const denseW = x - denseStart;
      if (denseW >= rowH * 0.5) {
        // Extra gap after icon (lock/shield badges stick out)
        iconEnd = x + Math.max(4, Math.floor(width * 0.018));
      }
      inDense = false;
      denseStart = -1;
      if (iconEnd > Math.floor(width * 0.16)) break;
    }
  }
  if (inDense && denseStart >= 0) {
    const denseW = leftLimit - denseStart;
    if (denseW >= rowH * 0.5) {
      iconEnd = leftLimit;
    }
  }

  // Hard floor: typical tooltips put name after ~20–28% width
  iconEnd = Math.max(iconEnd, Math.floor(width * 0.2));

  // Quality-ink bbox strictly to the right of icon
  let inkMinX = x1;
  let inkMaxX = iconEnd;
  let inkMinY = ry1;
  let inkMaxY = ry0;
  let inkFound = false;
  for (let y = ry0; y < ry1; y++) {
    for (let x = iconEnd; x < x1; x++) {
      const i = (y * width + x) * 4;
      const { score } = qualityInkScore(data[i], data[i + 1], data[i + 2]);
      if (score <= 8) continue;
      inkFound = true;
      if (x < inkMinX) inkMinX = x;
      if (x > inkMaxX) inkMaxX = x;
      if (y < inkMinY) inkMinY = y;
      if (y > inkMaxY) inkMaxY = y;
    }
  }

  if (!inkFound || inkMaxX <= inkMinX) return fallback();

  // Stop at first large empty gap after name (avoid X / side icons)
  let gapStart = -1;
  let cutX = inkMaxX;
  for (let x = inkMinX; x <= inkMaxX; x++) {
    if (colQuality[x] < 0.04) {
      if (gapStart < 0) gapStart = x;
      if (x - gapStart >= Math.max(6, Math.floor(width * 0.02))) {
        cutX = gapStart - 1;
        break;
      }
    } else {
      gapStart = -1;
    }
  }
  inkMaxX = Math.min(inkMaxX, Math.max(inkMinX + 2, cutX));

  // Tight pad — avoid re-including icon bleed
  const padX = Math.max(2, Math.floor((inkMaxX - inkMinX) * 0.04));
  const padY = Math.max(3, Math.floor(rowH * 0.35));
  const bx0 = Math.max(iconEnd, inkMinX - padX);
  const by0 = Math.max(0, inkMinY - padY);
  const bx1 = Math.min(width - 1, inkMaxX + padX);
  const by1 = Math.min(height - 1, inkMaxY + padY);

  // Reject if crop still looks like it starts inside icon (too much solid left)
  let leftSolid = 0;
  const checkW = Math.min(8, bx1 - bx0);
  for (let x = bx0; x < bx0 + checkW; x++) {
    leftSolid += colSolid[x] || 0;
  }
  let adjX0 = bx0;
  if (checkW > 0 && leftSolid / checkW > 0.55) {
    adjX0 = Math.min(bx1 - 4, bx0 + Math.floor(width * 0.04));
  }

  return {
    sx: (adjX0 / width) * img.width,
    sy: (by0 / height) * img.height,
    sw: ((bx1 - adjX0) / width) * img.width,
    sh: ((by1 - by0) / height) * img.height,
    quality: voteQuality(qualityVotes),
    weak: false,
  };
}

/** Drop the left fraction of a crop (icon remnant insurance). */
function trimCropLeft(src: HTMLCanvasElement, fraction: number): HTMLCanvasElement {
  const cut = Math.min(
    Math.floor(src.width * Math.max(0, Math.min(0.4, fraction))),
    Math.max(0, src.width - 8),
  );
  if (cut <= 0) return src;
  const out = document.createElement("canvas");
  out.width = src.width - cut;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(
    src,
    cut,
    0,
    src.width - cut,
    src.height,
    0,
    0,
    out.width,
    out.height,
  );
  return out;
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

type EnhanceMode = "soft" | "hard" | "purple";

/** Turn colored name into dark glyphs on white for Tesseract. */
function enhanceNameCrop(
  src: HTMLCanvasElement,
  mode: EnhanceMode = "hard",
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  const dctx = out.getContext("2d");
  if (!sctx || !dctx) throw new Error("无法创建画布");
  const image = sctx.getImageData(0, 0, src.width, src.height);
  const { data } = image;

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
  const minScore = mode === "soft" ? 8 : mode === "purple" ? 40 : 20;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const { score, quality } = qualityInkScore(r, g, b);

    let keep = score >= minScore;
    if (mode === "soft") {
      keep = keep || (score > 0 && brightness >= inkMean - 40);
    }
    if (mode === "purple") {
      // Keep purple/pink/blue name ink only — drop silver icon glitter
      keep =
        score >= minScore &&
        (quality === "purple" ||
          quality === "pink" ||
          quality === "blue" ||
          quality === "green" ||
          quality === "orange");
    }
    if (mode === "hard") {
      keep = score >= minScore;
    }

    if (keep) {
      data[i] = 16;
      data[i + 1] = 16;
      data[i + 2] = 16;
      data[i + 3] = 255;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  dctx.putImageData(image, 0, 0);

  // Drop leftover left-edge solid blobs (icon remnants) after binarize
  scrubLeftInkBlob(out);

  const padded = document.createElement("canvas");
  const padX = 20;
  const padY = 16;
  padded.width = out.width + padX * 2;
  padded.height = out.height + padY * 2;
  const pctx = padded.getContext("2d");
  if (!pctx) return out;
  pctx.fillStyle = "#ffffff";
  pctx.fillRect(0, 0, padded.width, padded.height);
  pctx.drawImage(out, padX, padY);
  return padded;
}

/** Wipe dense black mass on the far left of a binarized crop (icon residue). */
function scrubLeftInkBlob(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const limit = Math.floor(width * 0.35);
  const colInk = new Float32Array(width);
  for (let x = 0; x < limit; x++) {
    let ink = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (data[i] < 80) ink += 1;
    }
    colInk[x] = ink / height;
  }

  // Find contiguous dense left block and clear it
  let end = 0;
  let seen = false;
  for (let x = 0; x < limit; x++) {
    if (colInk[x] >= 0.45) {
      seen = true;
      end = x + 1;
    } else if (seen) {
      // allow thin gaps inside icon
      let gap = 0;
      let x2 = x;
      while (x2 < limit && colInk[x2] < 0.45) {
        gap++;
        x2++;
        if (gap > Math.max(3, Math.floor(width * 0.02))) break;
      }
      if (gap <= Math.max(3, Math.floor(width * 0.02)) && x2 < limit) {
        end = x2;
        x = x2 - 1;
        continue;
      }
      break;
    }
  }

  // Only scrub if block is icon-sized (not a thin stroke of first glyph)
  if (end >= Math.max(10, Math.floor(height * 0.55))) {
    const clearTo = Math.min(limit, end + Math.max(2, Math.floor(width * 0.01)));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < clearTo; x++) {
        const i = (y * width + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
}

const NAME_CROP_MAX_EDGE = 720;

function toNameOcrJpeg(canvas: HTMLCanvasElement, quality = 0.88): string {
  const edge = Math.max(canvas.width, canvas.height);
  let src = canvas;
  if (edge > NAME_CROP_MAX_EDGE) {
    const scale = NAME_CROP_MAX_EDGE / edge;
    const fitted = document.createElement("canvas");
    fitted.width = Math.max(8, Math.round(canvas.width * scale));
    fitted.height = Math.max(8, Math.round(canvas.height * scale));
    const ctx = fitted.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, fitted.width, fitted.height);
      src = fitted;
    }
  }
  return src.toDataURL("image/jpeg", quality);
}

async function recognizeNameVariants(
  dataUrl: string,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return [];
  const result = await recognizeWithPaddle(
    [dataUrl],
    "auction_item_name",
    signal,
  );
  return [result.text, ...result.lines].filter(Boolean);
}

export type RecognizeItemNameOptions = {
  signal?: AbortSignal;
  /** Quality/crop only — do not call Paddle when the name is already filled. */
  skipRecognize?: boolean;
};

/**
 * Recognize only the top quality-colored item name from a tooltip screenshot.
 * One small JPEG title crop (not the whole tooltip, not 3–5 Paddle passes).
 */
export async function recognizeItemName(
  source: File | Blob | string,
  options?: RecognizeItemNameOptions,
): Promise<ItemNameOcrResult> {
  const img = await loadImage(source);
  const bounds = findNameBounds(img);
  const scale = bounds.weak ? 2.2 : 2;
  const crop = buildNameCrop(img, bounds, scale);
  const previewDataUrl = toNameOcrJpeg(crop);

  if (options?.skipRecognize) {
    return {
      name: "",
      quality: bounds.quality,
      rawText: "",
      previewDataUrl,
    };
  }

  const rawChunks: string[] = [];
  rawChunks.push(
    ...(await recognizeNameVariants(previewDataUrl, options?.signal)),
  );

  let name = pickAuctionItemName(rawChunks);
  if (name.length < 2 && !options?.signal?.aborted) {
    const enhanced = enhanceNameCrop(trimCropLeft(crop, 0.08), "purple");
    rawChunks.push(
      ...(await recognizeNameVariants(toNameOcrJpeg(enhanced, 0.9), options?.signal)),
    );
    name = pickAuctionItemName(rawChunks);
  }

  return {
    name,
    quality: bounds.quality,
    rawText: rawChunks.join(" | "),
    previewDataUrl,
  };
}
