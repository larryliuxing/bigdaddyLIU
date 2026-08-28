/**
 * Browser image crops for leaderboard OCR.
 * Name path: click probe → find cyan glyph band → tight padded crops.
 */

import {
  NAME_CLICK_CROP,
  NAME_CLICK_CROP_WIDE,
  POWER_CLICK_CROP,
  POWER_CLICK_CROP_WIDE,
  type RatioRect,
} from "./regions";

const MAX_OCR_EDGE = 1600;

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

/** Downscale huge screenshots so OCR crops stay fast. */
export async function loadImageForOcr(
  source: File | Blob | string,
): Promise<HTMLImageElement> {
  const img = await loadImageElement(source);
  const maxEdge = Math.max(img.width, img.height);
  if (maxEdge <= MAX_OCR_EDGE) return img;

  const scale = MAX_OCR_EDGE / maxEdge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return img;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.onerror = () => reject(new Error("图片缩放失败"));
    out.src = canvas.toDataURL("image/jpeg", 0.92);
  });
}

function canvasCtx(canvas: HTMLCanvasElement) {
  return canvas.getContext("2d", { willReadFrequently: true });
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
  const ctx = canvasCtx(canvas);
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
 * Score pale / white / light-blue HUD name glyphs.
 * Rejects orange icons, yellow-white level digits, and dark saturated
 * nameplate fill — but keeps washed cyan and ice-blue strokes.
 */
export function nameGlyphScore(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const blueLead = b - r;

  // Orange phoenix / gold +N
  if (r > b + 16 && r >= g) return 0;
  // Yellow-white level digits like「2」
  if (brightness > 175 && r >= b + 12 && g >= b) return 0;
  // Pure white plates; keep slightly-blue 丶 highlights
  if (brightness > 200 && sat < 12 && b < r + 3) return 0;
  // Dark cloth / MP bar (saturated and dimmer than glyphs)
  if (brightness < 100) return 0;
  if (brightness < 112 && sat > 70 && blueLead > 20) return 0;

  // Classic cyan HUD fill
  const strongBlue =
    brightness >= 108 &&
    brightness <= 235 &&
    blueLead >= 16 &&
    b >= 105 &&
    sat >= 18 &&
    sat <= 130;

  // Light blue / pale cyan (low contrast on dark UI)
  const lightBlue =
    brightness >= 118 &&
    brightness <= 250 &&
    blueLead >= 4 &&
    b >= g - 14 &&
    sat >= 6 &&
    sat <= 120;

  // Ice-blue / near-white strokes and 丶 dots
  const iceBlue =
    brightness >= 160 &&
    brightness <= 252 &&
    b >= r &&
    blueLead >= 2 &&
    sat <= 75;

  let score = 0;
  if (strongBlue) score = Math.max(score, 52 + blueLead);
  if (lightBlue) score = Math.max(score, 48 + blueLead * 1.35);
  if (iceBlue) score = Math.max(score, 36 + blueLead);
  return score;
}

/**
 * Score cyan / blue-white name ink (legacy helper used by tests / power path).
 */
export function blueInkScore(r: number, g: number, b: number): number {
  return nameGlyphScore(r, g, b);
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
  const ctx = canvasCtx(canvas);
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    mask[p] = nameGlyphScore(d[i], d[i + 1], d[i + 2]) >= 16 ? 1 : 0;
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
  const ctx = canvasCtx(canvas);
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const score = nameGlyphScore(d[i], d[i + 1], d[i + 2]);
    let v: number;
    if (score >= 16) {
      v = Math.max(0, 255 - Math.min(255, Math.floor(score * 2.6 + 70)));
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

/**
 * Mild grayscale: keep stroke anti-aliasing instead of hard binary.
 * Better for stylized CJK HUD fonts that fall apart when thresholded.
 */
export function enhanceNameGray(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvasCtx(canvas);
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const score = nameGlyphScore(r, g, b);
    const brightness = (r + g + b) / 3;
    const v =
      score >= 10
        ? Math.max(
            0,
            Math.min(200, Math.round(255 - brightness * 0.9 - score * 1.35)),
          )
        : Math.min(255, Math.round(220 + brightness * 0.14));
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function enhanceLightText(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvasCtx(canvas);
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
  const x = clamp01(xRatio - size.w / 2);
  const y = clamp01(yRatio - size.h / 2);
  return {
    x,
    y,
    w: Math.min(size.w, 1 - x),
    h: Math.min(size.h, 1 - y),
  };
}

/**
 * Local-bright glyphs → black on white. Keeps tiny 丶 dots that erode would wipe.
 */
export function enhanceNameLocalBright(
  canvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const ctx = canvasCtx(canvas);
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  let sum = 0;
  const n = width * height;
  for (let i = 0; i < d.length; i += 4) {
    sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
  }
  const mean = sum / Math.max(1, n);
  const floor = Math.max(118, mean + 10);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const brightness = (r + g + b) / 3;
    const orange = r > b + 16 && r >= g;
    const on =
      !orange && nameGlyphScore(r, g, b) >= 12 && brightness >= floor - 12;
    const v = on ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Inside a probe crop, locate the name glyph cluster around the click
 * (skip full-width MP bars and leftover icons).
 */
export function findBlueNameBoundsInProbe(
  img: HTMLImageElement,
  probe: RatioRect,
  clickXRatio?: number,
  clickYRatio?: number,
): { x: number; y: number; w: number; h: number } | null {
  const sx = Math.floor(img.width * probe.x);
  const sy = Math.floor(img.height * probe.y);
  const sw = Math.max(1, Math.floor(img.width * probe.w));
  const sh = Math.max(1, Math.floor(img.height * probe.h));

  const maxScanW = 320;
  const scanScale = sw > maxScanW ? maxScanW / sw : 1;
  const cw = Math.max(1, Math.round(sw * scanScale));
  const ch = Math.max(1, Math.round(sh * scanScale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvasCtx(canvas);
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  const { data } = ctx.getImageData(0, 0, cw, ch);

  const mask = new Uint8Array(cw * ch);
  const rowCounts = new Array<number>(ch).fill(0);
  let total = 0;
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const i = (y * cw + x) * 4;
      if (nameGlyphScore(data[i], data[i + 1], data[i + 2]) < 16) continue;
      mask[y * cw + x] = 1;
      total += 1;
      rowCounts[y] += 1;
    }
  }
  if (total < 12) return null;

  const rowOk = rowCounts.map((c) => c / cw <= 0.55 && c >= 2);
  const col = new Array<number>(cw).fill(0);
  for (let y = 0; y < ch; y += 1) {
    if (!rowOk[y]) continue;
    for (let x = 0; x < cw; x += 1) {
      if (mask[y * cw + x]) col[x] += 1;
    }
  }
  const peak = Math.max(...col, 0);
  if (peak < 2) return null;
  const thr = Math.max(2, peak * 0.2);
  const on = col.map((v) => v >= thr);

  const gap = Math.max(3, Math.round(ch * 0.12));
  const runs: Array<[number, number]> = [];
  let i = 0;
  while (i < cw) {
    while (i < cw && !on[i]) i += 1;
    if (i >= cw) break;
    let j = i;
    while (j < cw) {
      if (on[j]) {
        j += 1;
        continue;
      }
      let k = j;
      while (k < cw && !on[k] && k - j <= gap) k += 1;
      if (k < cw && on[k] && k - j <= gap) {
        j = k;
        continue;
      }
      break;
    }
    runs.push([i, j - 1]);
    i = j;
  }
  if (!runs.length) return null;

  const clickX =
    clickXRatio != null
      ? ((clickXRatio - probe.x) / Math.max(probe.w, 1e-6)) * cw
      : cw / 2;
  let pick = runs.find(([a, b]) => clickX >= a - 2 && clickX <= b + 2);
  if (!pick) {
    pick = runs.slice().sort((A, B) => {
      const da = Math.abs((A[0] + A[1]) / 2 - clickX);
      const db = Math.abs((B[0] + B[1]) / 2 - clickX);
      return da - db;
    })[0];
  }
  const minX = pick[0];
  const maxX = pick[1];
  let minY = ch;
  let maxY = 0;
  for (let y = 0; y < ch; y += 1) {
    if (!rowOk[y]) continue;
    let any = false;
    for (let x = minX; x <= maxX; x += 1) {
      if (mask[y * cw + x]) {
        any = true;
        break;
      }
    }
    if (any) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) return null;

  const inv = 1 / scanScale;
  const absMinX = minX * inv;
  const absMaxX = maxX * inv;
  const absMinY = minY * inv;
  const absMaxY = maxY * inv;
  const padX = Math.max(4, Math.floor((absMaxX - absMinX) * 0.1));
  const padY = Math.max(3, Math.floor((absMaxY - absMinY) * 0.28));
  const localX = Math.max(0, absMinX - padX);
  const localY = Math.max(0, absMinY - padY);

  return {
    x: sx + localX,
    y: sy + localY,
    w: Math.min(sw - localX, absMaxX - absMinX + padX * 2),
    h: Math.min(sh - localY, absMaxY - absMinY + padY * 2),
  };
}

function variantsFromBounds(
  img: HTMLImageElement,
  bounds: { x: number; y: number; w: number; h: number },
): string[] {
  const urls: string[] = [];
  const scale = bounds.w < 90 ? 7.2 : bounds.w < 140 ? 5.2 : 3.8;

  const local = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, scale);
  enhanceNameLocalBright(local);
  urls.push(toDataUrl(padCanvas(local, 18)));

  const gray = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, scale);
  enhanceNameGray(gray);
  urls.push(toDataUrl(padCanvas(gray, 18)));

  return urls;
}

export function powerRectAroundClick(
  xRatio: number,
  yRatio: number,
  size: { w: number; h: number } = POWER_CLICK_CROP,
): RatioRect {
  return {
    x: clamp01(xRatio - size.w / 2),
    y: clamp01(yRatio - size.h / 2),
    w: size.w,
    h: size.h,
  };
}

/** Crops around the combat-power digits the user clicked. */
export async function buildPowerClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string[]> {
  const img = await loadImageForOcr(source);
  const probes = [
    powerRectAroundClick(xRatio, yRatio, POWER_CLICK_CROP),
    powerRectAroundClick(xRatio, yRatio, POWER_CLICK_CROP_WIDE),
  ];
  const urls: string[] = [];
  for (const probe of probes) {
    const raw = cropRatio(img, probe, 3.2);
    const light = cropRatio(img, probe, 3.2);
    enhanceLightText(light);
    urls.push(toDataUrl(padCanvas(raw, 12)));
    urls.push(toDataUrl(padCanvas(light, 12)));
  }
  return urls;
}

export async function buildPowerClickPreview(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string> {
  const img = await loadImageForOcr(source);
  const rect = powerRectAroundClick(xRatio, yRatio, POWER_CLICK_CROP);
  const canvas = cropRatio(img, rect, 2.8);
  return toDataUrl(padCanvas(canvas, 8));
}

/**
 * Tight cyan-name crops around a click (auto-trimmed to glyph band).
 * Returns OCR variants plus a preview so the image is only scanned once.
 */
export async function buildNameClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<{ crops: string[]; previewDataUrl: string }> {
  const img = await loadImageForOcr(source);
  const probes = [
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP),
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP_WIDE),
  ];

  const crops: string[] = [];
  let bestBounds: { x: number; y: number; w: number; h: number } | null = null;
  for (const probe of probes) {
    const bounds = findBlueNameBoundsInProbe(img, probe, xRatio, yRatio);
    if (!bounds) continue;
    bestBounds = bounds;
    break;
  }

  if (bestBounds) {
    crops.push(...variantsFromBounds(img, bestBounds));
  } else {
    const rect = probes[0];
    const gray = cropRatio(img, rect, 4);
    enhanceNameGray(gray);
    crops.push(toDataUrl(padCanvas(gray, 14)));
    const local = cropRatio(img, rect, 4);
    enhanceNameLocalBright(local);
    crops.push(toDataUrl(padCanvas(local, 14)));
  }

  return {
    crops,
    previewDataUrl: crops[0] ?? "",
  };
}

/** Preview shows the trimmed blue-name crop (what OCR actually sees). */
export async function buildNameClickPreview(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string> {
  const { previewDataUrl } = await buildNameClickCrops(source, xRatio, yRatio);
  return previewDataUrl;
}
