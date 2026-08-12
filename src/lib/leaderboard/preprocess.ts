/**
 * Browser image crops for leaderboard OCR.
 * Powers: multi-layout ratio boxes.
 * Name: tight crop around a user click (blue ink preferred).
 */

import { NAME_CLICK_CROP, POWER_LAYOUTS, type RatioRect } from "./regions";

export type PowerCropSet = {
  layoutId: string;
  topDataUrls: string[];
  bottomDataUrls: string[];
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

function cropRatio(
  img: HTMLImageElement,
  rect: RatioRect,
  scale: number,
): HTMLCanvasElement {
  const sx = Math.floor(img.width * rect.x);
  const sy = Math.floor(img.height * rect.y);
  const sw = Math.max(1, Math.floor(img.width * rect.w));
  const sh = Math.max(1, Math.floor(img.height * rect.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function blueInkScore(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  if (sat < 28 || brightness > 235 || b < 110) return 0;
  if (b <= r + 18 || b < g - 15) return 0;
  const blueness = b - Math.max(r, g * 0.9);
  if (blueness < 12) return 0;
  return blueness + sat * 0.25;
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

export function enhanceNameBlue(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    mask[p] = blueInkScore(d[i], d[i + 1], d[i + 2]) >= 18 ? 1 : 0;
  }
  const fat = dilateMask(mask, width, height, 1);
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

function toDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function nameRectAroundClick(xRatio: number, yRatio: number): RatioRect {
  const w = NAME_CLICK_CROP.w;
  const h = NAME_CLICK_CROP.h;
  return {
    x: clamp01(xRatio - w / 2),
    y: clamp01(yRatio - h / 2),
    w,
    h,
  };
}

/** Build power crop variants for every layout template. */
export async function buildPowerCropSets(
  source: File | Blob | string,
): Promise<PowerCropSet[]> {
  const img = await loadImageElement(source);
  return POWER_LAYOUTS.map((layout) => {
    const topRaw = cropRatio(img, layout.top, 2.8);
    const topLight = cropRatio(img, layout.top, 2.8);
    enhanceLightText(topLight);
    const bottomRaw = cropRatio(img, layout.bottom, 2.6);
    const bottomLight = cropRatio(img, layout.bottom, 2.6);
    enhanceLightText(bottomLight);
    return {
      layoutId: layout.id,
      topDataUrls: [toDataUrl(topRaw), toDataUrl(topLight)],
      bottomDataUrls: [toDataUrl(bottomRaw), toDataUrl(bottomLight)],
    };
  });
}

/** Tight crops around a click for blue name OCR. */
export async function buildNameClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string[]> {
  const img = await loadImageElement(source);
  const rect = nameRectAroundClick(xRatio, yRatio);
  const urls: string[] = [];

  const raw = cropRatio(img, rect, 4);
  urls.push(toDataUrl(raw));

  const blue = cropRatio(img, rect, 4);
  enhanceNameBlue(blue);
  urls.push(toDataUrl(blue));

  // Slightly taller crop in case the click is a bit low/high
  const tall = {
    x: rect.x,
    y: clamp01(rect.y - 0.02),
    w: rect.w,
    h: Math.min(0.14, rect.h + 0.04),
  };
  const tallBlue = cropRatio(img, tall, 3.6);
  enhanceNameBlue(tallBlue);
  urls.push(toDataUrl(tallBlue));

  return urls;
}

/** Preview thumbnail of the name crop (for UI feedback). */
export async function buildNameClickPreview(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string> {
  const img = await loadImageElement(source);
  const rect = nameRectAroundClick(xRatio, yRatio);
  return toDataUrl(cropRatio(img, rect, 2));
}
