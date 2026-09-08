/**
 * Click crops for guild-boss screenshot OCR (white text on dark rows).
 */

import { loadImageForOcr } from "@/lib/leaderboard/preprocess";
import { bossNameInkCut, isBossNameInk } from "./nameInk";

type RatioRect = { x: number; y: number; w: number; h: number };

export type { RatioRect };

const NAME_CROPS: Array<{ w: number; h: number; xBias: number }> = [
  { w: 0.3, h: 0.08, xBias: 0.08 },
  { w: 0.42, h: 0.11, xBias: 0.1 },
];

/** Time line is long; include a bit below the click to catch 出没时间. */
const TIME_CROPS: Array<{ w: number; h: number; xBias: number; yBias: number }> =
  [
    { w: 0.42, h: 0.07, xBias: -0.02, yBias: 0.02 },
    { w: 0.52, h: 0.11, xBias: -0.02, yBias: 0.035 },
  ];

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function rectAround(
  xRatio: number,
  yRatio: number,
  w: number,
  h: number,
  xBias: number,
  yBias = 0,
): RatioRect {
  return {
    x: clamp01(xRatio - w / 2 + xBias),
    y: clamp01(yRatio - h / 2 + yBias),
    w,
    h,
  };
}

function cropAbsolute(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  scale: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    Math.max(0, Math.floor(sx)),
    Math.max(0, Math.floor(sy)),
    Math.max(1, Math.floor(sw)),
    Math.max(1, Math.floor(sh)),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function cropRatio(
  img: HTMLImageElement,
  rect: RatioRect,
  scale: number,
): HTMLCanvasElement {
  return cropAbsolute(
    img,
    img.width * rect.x,
    img.height * rect.y,
    img.width * rect.w,
    img.height * rect.h,
    scale,
  );
}

function padCanvas(source: HTMLCanvasElement, pad: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width + pad * 2;
  out.height = source.height + pad * 2;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, pad, pad);
  return out;
}

function toDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

/**
 * Inside a probe, keep the sparse horizontal name-glyph band and skip
 * the circular portrait on the left.
 */
function findWhiteNameBounds(
  img: HTMLImageElement,
  probe: RatioRect,
): { x: number; y: number; w: number; h: number } | null {
  const sx = Math.floor(img.width * probe.x);
  const sy = Math.floor(img.height * probe.y);
  const sw = Math.max(1, Math.floor(img.width * probe.w));
  const sh = Math.max(1, Math.floor(img.height * probe.h));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  const rowCounts = new Array<number>(sh).fill(0);
  const rowMinX = new Array<number>(sh).fill(sw);
  const rowMaxX = new Array<number>(sh).fill(0);
  let total = 0;
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const i = (y * sw + x) * 4;
      if (!isBossNameInk(data[i], data[i + 1], data[i + 2])) continue;
      total += 1;
      rowCounts[y] += 1;
      if (x < rowMinX[y]) rowMinX[y] = x;
      if (x > rowMaxX[y]) rowMaxX[y] = x;
    }
  }
  if (total < 18) return null;

  const win = Math.max(4, Math.floor(sh * 0.4));
  let bestSum = 0;
  let bestY = 0;
  for (let y = 0; y + win <= sh; y += 1) {
    let sum = 0;
    for (let k = 0; k < win; k += 1) sum += rowCounts[y + k];
    if (sum > bestSum) {
      bestSum = sum;
      bestY = y;
    }
  }
  if (bestSum < 12) return null;

  let minX = sw;
  let maxX = 0;
  let minY = sh;
  let maxY = 0;
  for (let y = bestY; y < bestY + win; y += 1) {
    if (rowCounts[y] < 2) continue;
    if (rowMinX[y] < minX) minX = rowMinX[y];
    if (rowMaxX[y] > maxX) maxX = rowMaxX[y];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX <= minX || maxY <= minY) return null;

  // Drop a dense left blob (portrait) if the remaining band is still wide.
  const cut = minX + Math.floor((maxX - minX) * 0.22);
  let leftDense = 0;
  let rightSparse = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= Math.min(cut, maxX); x += 1) {
      const i = (y * sw + x) * 4;
      if (isBossNameInk(data[i], data[i + 1], data[i + 2])) leftDense += 1;
    }
    for (let x = Math.min(cut + 1, maxX); x <= maxX; x += 1) {
      const i = (y * sw + x) * 4;
      if (isBossNameInk(data[i], data[i + 1], data[i + 2])) rightSparse += 1;
    }
  }
  if (rightSparse > 20 && leftDense > rightSparse * 0.9) {
    minX = Math.min(cut + 1, maxX - 8);
  }

  const padX = Math.max(6, Math.floor((maxX - minX) * 0.1));
  const padY = Math.max(4, Math.floor((maxY - minY) * 0.4));
  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  return {
    x: sx + x,
    y: sy + y,
    w: Math.min(sw - x, maxX - minX + padX * 2),
    h: Math.min(sh - y, maxY - minY + padY * 2),
  };
}

/** Keep pale-gray / gold name strokes; drop mint selection boxes. */
function enhanceBossNameText(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  let inkSum = 0;
  let inkCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (isBossNameInk(d[i], d[i + 1], d[i + 2])) {
      inkSum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      inkCount += 1;
    }
  }
  const inkMean = inkCount > 0 ? inkSum / inkCount : 110;
  const cut = bossNameInkCut(inkMean);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const brightness = (r + g + b) / 3;
    const keep =
      isBossNameInk(r, g, b) ||
      (brightness >= cut &&
        brightness >= 82 &&
        Math.max(r, g, b) - Math.min(r, g, b) <= 36 &&
        !(g >= r + 32 && g >= 150));
    if (keep) {
      const t = Math.max(0, Math.min(1, (brightness - cut) / 70));
      const v = Math.round(36 - t * 28);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    } else {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
    }
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Drop a left circular portrait if the remaining band looks like a name. */
function trimLeftPortrait(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 40) return canvas;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const colInk = new Array<number>(width).fill(0);
  for (let x = 0; x < width; x += 1) {
    let n = 0;
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4;
      if (data[i] < 80) n += 1;
    }
    colInk[x] = n;
  }
  const split = Math.floor(width * 0.28);
  let left = 0;
  let right = 0;
  for (let x = 0; x < split; x += 1) left += colInk[x];
  for (let x = split; x < width; x += 1) right += colInk[x];
  const leftAvg = left / Math.max(1, split);
  const rightAvg = right / Math.max(1, width - split);
  if (!(leftAvg > 8 && rightAvg > 3 && leftAvg > rightAvg * 1.35)) {
    return canvas;
  }
  let cut = split;
  for (let x = split; x > Math.floor(width * 0.08); x -= 1) {
    if (colInk[x] < rightAvg * 0.55) {
      cut = x;
      break;
    }
  }
  if (cut < 8 || width - cut < 20) return canvas;
  const out = document.createElement("canvas");
  out.width = width - cut;
  out.height = height;
  const octx = out.getContext("2d");
  if (!octx) return canvas;
  octx.drawImage(canvas, cut, 0, out.width, height, 0, 0, out.width, height);
  return out;
}
function enhanceTimeText(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = brightness >= 118 ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function buildBossRectCrops(
  source: File | Blob | string,
  rect: RatioRect,
  kind: "name" | "time",
): Promise<{ preview: string; crops: string[] }> {
  const img = await loadImageForOcr(source);
  const pad = 0.004;
  const r: RatioRect = {
    x: clamp01(Math.min(rect.x, rect.x + rect.w) - pad),
    y: clamp01(Math.min(rect.y, rect.y + rect.h) - pad),
    w: clamp01(Math.abs(rect.w) + pad * 2),
    h: clamp01(Math.abs(rect.h) + pad * 2),
  };
  if (r.x + r.w > 1) r.w = 1 - r.x;
  if (r.y + r.h > 1) r.h = 1 - r.y;
  const scale = kind === "name" ? 5 : 3.4;
  const raw = cropRatio(img, r, scale);
  const ink = cropRatio(img, r, scale);
  if (kind === "name") {
    enhanceBossNameText(ink);
  } else {
    enhanceTimeText(ink);
  }
  const preview = cropRatio(img, r, 2.2);
  const nameInk = kind === "name" ? trimLeftPortrait(ink) : ink;
  const nameRaw = kind === "name" ? trimLeftPortrait(raw) : raw;
  const crops =
    kind === "name"
      ? [
          toDataUrl(padCanvas(nameRaw, 16)),
          toDataUrl(padCanvas(nameInk, 16)),
          toDataUrl(
            padCanvas(
              enhanceBossNameText(cropRatio(img, r, 3.6)),
              16,
            ),
          ),
        ]
      : [toDataUrl(padCanvas(raw, 12)), toDataUrl(padCanvas(ink, 12))];
  return {
    preview: toDataUrl(padCanvas(preview, 6)),
    crops,
  };
}

export async function buildBossNameClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string[]> {
  const img = await loadImageForOcr(source);
  const urls: string[] = [];
  for (const size of NAME_CROPS) {
    const probe = rectAround(xRatio, yRatio, size.w, size.h, size.xBias);
    const bounds = findWhiteNameBounds(img, probe);
    if (bounds && bounds.w > 8 && bounds.h > 6) {
      const raw = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, 4);
      const light = cropAbsolute(
        img,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h,
        4,
      );
      enhanceBossNameText(light);
      urls.push(toDataUrl(padCanvas(raw, 14)));
      urls.push(toDataUrl(padCanvas(light, 14)));
    }
    const fallbackRaw = cropRatio(img, probe, 3.4);
    const fallbackLight = cropRatio(img, probe, 3.4);
    enhanceBossNameText(fallbackLight);
    urls.push(toDataUrl(padCanvas(fallbackRaw, 12)));
    urls.push(toDataUrl(padCanvas(fallbackLight, 12)));
  }
  return urls;
}

export async function buildBossTimeClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string[]> {
  const img = await loadImageForOcr(source);
  const urls: string[] = [];
  for (const size of TIME_CROPS) {
    const probe = rectAround(
      xRatio,
      yRatio,
      size.w,
      size.h,
      size.xBias,
      size.yBias,
    );
    const raw = cropRatio(img, probe, 3.2);
    const ink = cropRatio(img, probe, 3.2);
    enhanceTimeText(ink);
    urls.push(toDataUrl(padCanvas(raw, 10)));
    urls.push(toDataUrl(padCanvas(ink, 10)));
  }
  return urls;
}

export async function buildBossClickPreview(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
  kind: "name" | "time",
): Promise<string> {
  const img = await loadImageForOcr(source);
  const size =
    kind === "name"
      ? { w: 0.32, h: 0.09, xBias: 0.08, yBias: 0 }
      : { w: 0.48, h: 0.1, xBias: -0.02, yBias: 0.03 };
  const probe = rectAround(
    xRatio,
    yRatio,
    size.w,
    size.h,
    size.xBias,
    size.yBias,
  );
  const canvas = cropRatio(img, probe, 2.2);
  return toDataUrl(padCanvas(canvas, 6));
}
