/**
 * Browser image crops for leaderboard OCR.
 * Name path: click probe → find cyan glyph band → tight padded crops.
 */

import {
  NAME_CLICK_CROP,
  NAME_CLICK_CROP_WIDE,
  POWER_LAYOUTS,
  type RatioRect,
} from "./regions";

export type PowerCropSet = {
  layoutId: string;
  topDataUrls: string[];
};

function loadImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
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

/**
 * Score cyan / blue-white name ink.
 * Keeps pale cyan names; rejects orange +N, skin portraits, pure white UI.
 */
export function blueInkScore(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;

  // Reject warm UI (+4 orange / gold)
  if (r > b + 25 && r >= g) return 0;
  // Reject near-gray / pure white plates
  if (sat < 10 && brightness > 200) return 0;

  // Pale cyan / blue-white glyph fill (common for character names)
  const paleCyan =
    brightness >= 150 &&
    brightness <= 245 &&
    b >= r + 6 &&
    b >= g - 8 &&
    sat >= 10 &&
    sat <= 140;

  // Stronger saturated cyan outline / fill
  const strongCyan =
    b >= 120 &&
    b > r + 20 &&
    b >= g - 12 &&
    sat >= 28 &&
    brightness >= 90 &&
    brightness <= 230;

  if (paleCyan) return 50 + (b - r);
  if (strongCyan) return 35 + (b - Math.max(r, g * 0.9));
  return 0;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius = 1) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -radius; dy <= radius && !on; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (mask[ny * width + nx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

function erodeMask(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let all = 1;
      for (let dy = -1; dy <= 1 && all; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!mask[(y + dy) * width + (x + dx)]) {
            all = 0;
            break;
          }
        }
      }
      out[y * width + x] = all;
    }
  }
  return out;
}

/** Black ink on white — Tesseract-friendly. */
export function enhanceNameBlue(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    mask[p] = blueInkScore(d[i], d[i + 1], d[i + 2]) >= 16 ? 1 : 0;
  }
  // Open then dilate: drop speckles, keep glyph strokes connected
  const opened = dilateMask(erodeMask(mask, width, height), width, height, 1);
  const fat = dilateMask(opened, width, height, 1);
  for (let p = 0, i = 0; p < fat.length; p += 1, i += 4) {
    const v = fat[p] ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Soft blue-emphasis grayscale (keeps anti-aliased strokes). */
export function enhanceNameSoft(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const score = blueInkScore(d[i], d[i + 1], d[i + 2]);
    let v: number;
    if (score >= 16) {
      v = Math.max(0, 255 - Math.min(255, Math.floor(score * 2.2 + 60)));
    } else {
      v = 255;
    }
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function enhanceLightText(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = brightness >= 145 ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
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

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function nameRectAroundClick(
  xRatio: number,
  yRatio: number,
  size: { w: number; h: number } = NAME_CLICK_CROP,
): RatioRect {
  return {
    x: clamp01(xRatio - size.w / 2),
    y: clamp01(yRatio - size.h / 2),
    w: size.w,
    h: size.h,
  };
}

/**
 * Inside a probe crop, locate the densest horizontal cyan text band and
 * return absolute pixel bounds on the full image.
 */
export function findBlueNameBoundsInProbe(
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
      if (blueInkScore(data[i], data[i + 1], data[i + 2]) < 16) continue;
      total += 1;
      rowCounts[y] += 1;
      if (x < rowMinX[y]) rowMinX[y] = x;
      if (x > rowMaxX[y]) rowMaxX[y] = x;
    }
  }

  if (total < 25) return null;

  // Prefer a short horizontal band (name line), not a tall icon blob
  const win = Math.max(4, Math.floor(sh * 0.35));
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
  if (bestSum < 18) return null;

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

  // Drop extreme left/right outliers that are likely icon glow (optional trim
  // by requiring the band to be wider than tall — character names are).
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  if (bw < bh * 1.2 && bw < sw * 0.35) {
    // Probably an icon blob near the click; try full probe blue extent
    minX = sw;
    maxX = 0;
    minY = sh;
    maxY = 0;
    for (let y = 0; y < sh; y += 1) {
      if (rowCounts[y] < 3) continue;
      if (rowMinX[y] < minX) minX = rowMinX[y];
      if (rowMaxX[y] > maxX) maxX = rowMaxX[y];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX <= minX || maxY <= minY) return null;
  }

  const padX = Math.max(4, Math.floor((maxX - minX) * 0.12));
  const padY = Math.max(3, Math.floor((maxY - minY) * 0.45));

  return {
    x: sx + Math.max(0, minX - padX),
    y: sy + Math.max(0, minY - padY),
    w: Math.min(sw - Math.max(0, minX - padX), maxX - minX + padX * 2),
    h: Math.min(sh - Math.max(0, minY - padY), maxY - minY + padY * 2),
  };
}

function variantsFromBounds(
  img: HTMLImageElement,
  bounds: { x: number; y: number; w: number; h: number },
): string[] {
  const urls: string[] = [];
  const scale = bounds.w < 120 ? 5 : 4;

  const soft = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, scale);
  enhanceNameSoft(soft);
  urls.push(toDataUrl(padCanvas(soft, 12)));

  const hard = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, scale);
  enhanceNameBlue(hard);
  urls.push(toDataUrl(padCanvas(hard, 12)));

  // Extra upscale of hard mask for small CJK
  const hard2 = cropAbsolute(
    img,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    scale + 1.2,
  );
  enhanceNameBlue(hard2);
  urls.push(toDataUrl(padCanvas(hard2, 16)));

  return urls;
}

/** Build top-left power crop variants for every layout template. */
export async function buildPowerCropSets(
  source: File | Blob | string,
): Promise<PowerCropSet[]> {
  const img = await loadImageElement(source);
  return POWER_LAYOUTS.map((layout) => {
    const topRaw = cropRatio(img, layout.top, 2.8);
    const topLight = cropRatio(img, layout.top, 2.8);
    enhanceLightText(topLight);
    return {
      layoutId: layout.id,
      topDataUrls: [toDataUrl(topRaw), toDataUrl(topLight)],
    };
  });
}

/**
 * Tight cyan-name crops around a click (auto-trimmed to glyph band).
 */
export async function buildNameClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string[]> {
  const img = await loadImageElement(source);
  const probes = [
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP),
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP_WIDE),
  ];

  const urls: string[] = [];
  let bestBounds: { x: number; y: number; w: number; h: number } | null = null;

  for (const probe of probes) {
    const bounds = findBlueNameBoundsInProbe(img, probe);
    if (!bounds) continue;
    if (
      !bestBounds ||
      bounds.w * bounds.h < bestBounds.w * bestBounds.h * 0.9 ||
      (bounds.w / Math.max(1, bounds.h) >
        bestBounds.w / Math.max(1, bestBounds.h) &&
        bounds.w > bestBounds.w * 0.7)
    ) {
      // Prefer wider-than-tall (text) and reasonably compact
      const score =
        (bounds.w / Math.max(1, bounds.h)) * 10 +
        Math.min(bounds.w, img.width * 0.2);
      const bestScore = bestBounds
        ? (bestBounds.w / Math.max(1, bestBounds.h)) * 10 +
          Math.min(bestBounds.w, img.width * 0.2)
        : -1;
      if (score >= bestScore) bestBounds = bounds;
    }
  }

  if (bestBounds) {
    urls.push(...variantsFromBounds(img, bestBounds));
  } else {
    // Fallback: small probe with blue enhance only
    const rect = probes[0];
    const blue = cropRatio(img, rect, 4.5);
    enhanceNameBlue(blue);
    urls.push(toDataUrl(padCanvas(blue, 14)));
    const soft = cropRatio(img, rect, 4.5);
    enhanceNameSoft(soft);
    urls.push(toDataUrl(padCanvas(soft, 14)));
  }

  return urls;
}

/** Preview shows the trimmed blue-name crop (what OCR actually sees). */
export async function buildNameClickPreview(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string> {
  const img = await loadImageElement(source);
  const probes = [
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP),
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP_WIDE),
  ];

  for (const probe of probes) {
    const bounds = findBlueNameBoundsInProbe(img, probe);
    if (!bounds) continue;
    const canvas = cropAbsolute(
      img,
      bounds.x,
      bounds.y,
      bounds.w,
      bounds.h,
      3,
    );
    enhanceNameSoft(canvas);
    return toDataUrl(padCanvas(canvas, 8));
  }

  const fallback = cropRatio(img, probes[0], 2.5);
  enhanceNameSoft(fallback);
  return toDataUrl(padCanvas(fallback, 8));
}
