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
 * Score HUD name ink: saturated cyan (飞飞 / 抖音绵羊), washed light
 * blue, and ice-blue 丶 dots. Rejects orange icons, gold level digits,
 * and near-white combat slashes that used to pass as ice-blue.
 */
export function nameGlyphScore(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const blueLead = b - r;

  // Orange phoenix / gold +N
  if (r > b + 16 && r >= g) return 0;
  // Yellow-white level digits like「2」/「5」
  if (brightness > 175 && r >= b + 12 && g >= b) return 0;
  // Near-white combat slashes / sparks (not name ink)
  if (brightness >= 198 && sat <= 30) return 0;
  if (brightness >= 186 && sat <= 16 && blueLead < 14) return 0;
  if (brightness < 88) return 0;

  // Saturated cyan HUD fill. sat is often 180–250 — the old ≤130 cap
  // dropped the actual glyphs and only kept pale edges.
  const strongCyan =
    brightness >= 92 &&
    brightness <= 210 &&
    blueLead >= 36 &&
    b >= 130 &&
    sat >= 60 &&
    g <= b + 10 &&
    r <= b - 18;

  const midBlue =
    brightness >= 108 &&
    brightness <= 235 &&
    blueLead >= 16 &&
    b >= 105 &&
    sat >= 18 &&
    g <= b + 12;

  const lightBlue =
    brightness >= 118 &&
    brightness <= 245 &&
    blueLead >= 8 &&
    b >= g - 8 &&
    sat >= 12 &&
    sat <= 140 &&
    !(brightness > 210 && sat < 30);

  const iceBlue =
    brightness >= 155 &&
    brightness <= 228 &&
    b >= r + 6 &&
    blueLead >= 8 &&
    sat >= 10 &&
    sat <= 70;

  let score = 0;
  if (strongCyan) score = Math.max(score, 80 + Math.min(blueLead, 180) * 0.4);
  if (midBlue) score = Math.max(score, 52 + Math.min(blueLead, 120) * 0.35);
  if (lightBlue) score = Math.max(score, 48 + blueLead * 1.1);
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
  // Dilate only: erode wipes thin 飞 strokes. Speckles are mostly gone
  // after bar-trimmed cyan scoring.
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

/**
 * Hard cyan mask, no morphology. Keeps stylized HUD stroke gaps so
 * Tesseract sees two similar glyphs (飞飞 → 习习) instead of a blob.
 */
export function enhanceNameCyanHard(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvasCtx(canvas);
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = nameGlyphScore(d[i], d[i + 1], d[i + 2]) >= 16 ? 0 : 255;
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
  const floor = Math.max(100, mean + 8);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const brightness = (r + g + b) / 3;
    const orange = r > b + 16 && r >= g;
    const score = nameGlyphScore(r, g, b);
    const on =
      !orange &&
      score >= 12 &&
      (score >= 70 || brightness >= floor - 16);
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
  const rowRun = new Array<number>(ch).fill(0);
  let total = 0;
  for (let y = 0; y < ch; y += 1) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < cw; x += 1) {
      const i = (y * cw + x) * 4;
      if (nameGlyphScore(data[i], data[i + 1], data[i + 2]) < 16) {
        run = 0;
        continue;
      }
      mask[y * cw + x] = 1;
      total += 1;
      rowCounts[y] += 1;
      run += 1;
      if (run > best) best = run;
    }
    rowRun[y] = best;
  }
  if (total < 12) return null;

  // Full-probe bars (rare). Name-width MP bars are handled after the x-run.
  const rowOk = rowCounts.map((c, y) => {
    const fill = c / cw;
    const bar = rowRun[y] / cw >= 0.42 && fill >= 0.32;
    return !bar && c >= 2;
  });
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
  const clickY =
    clickYRatio != null
      ? ((clickYRatio - probe.y) / Math.max(probe.h, 1e-6)) * ch
      : ch / 2;
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
  const runW = Math.max(1, maxX - minX + 1);

  const localFill = new Array<number>(ch).fill(0);
  const localRun = new Array<number>(ch).fill(0);
  for (let y = 0; y < ch; y += 1) {
    let run = 0;
    let best = 0;
    let count = 0;
    for (let x = minX; x <= maxX; x += 1) {
      if (mask[y * cw + x]) {
        count += 1;
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    localFill[y] = count;
    localRun[y] = best;
  }

  const isBarRow = (y: number) =>
    localRun[y] >= runW * 0.5 && localFill[y] >= runW * 0.36;

  // Row clusters: name glyphs vs the cyan MP bar sitting under them.
  const clusters: Array<[number, number]> = [];
  let y = 0;
  while (y < ch) {
    while (y < ch && (localFill[y] < 2 || isBarRow(y))) y += 1;
    if (y >= ch) break;
    let y2 = y;
    while (y2 + 1 < ch) {
      const nxt = y2 + 1;
      if (isBarRow(nxt)) break;
      if (localFill[nxt] >= 2) {
        y2 = nxt;
        continue;
      }
      if (nxt + 1 < ch && localFill[nxt + 1] >= 2 && !isBarRow(nxt + 1)) {
        y2 = nxt + 1;
        continue;
      }
      break;
    }
    clusters.push([y, y2]);
    y = y2 + 1;
  }

  let band: [number, number] | null = null;
  if (clusters.length) {
    band = clusters.slice().sort((A, B) => {
      const ha = A[1] - A[0] + 1;
      const hb = B[1] - B[0] + 1;
      const ca = (A[0] + A[1]) / 2;
      const cb = (B[0] + B[1]) / 2;
      const inA = clickY >= A[0] - 2 && clickY <= A[1] + 2 ? 0 : 1;
      const inB = clickY >= B[0] - 2 && clickY <= B[1] + 2 ? 0 : 1;
      if (inA !== inB) return inA - inB;
      const da = Math.abs(ca - clickY);
      const db = Math.abs(cb - clickY);
      if (Math.abs(da - db) > 3) return da - db;
      return hb - ha;
    })[0];
  }

  let minY = ch;
  let maxY = 0;
  if (band) {
    minY = band[0];
    maxY = band[1];
    let peakFill = 0;
    for (let yy = minY; yy <= maxY; yy += 1) {
      if (localFill[yy] > peakFill) peakFill = localFill[yy];
    }
    const fillThr = Math.max(3, peakFill * 0.28);
    let g0 = minY;
    while (g0 <= maxY && localFill[g0] < fillThr) g0 += 1;
    let g1 = maxY;
    while (g1 >= g0 && localFill[g1] < fillThr) g1 -= 1;
    if (g1 > g0) {
      minY = g0;
      maxY = g1;
    }
  } else {
    for (let yy = 0; yy < ch; yy += 1) {
      if (isBarRow(yy) || localFill[yy] < 2) continue;
      if (yy < minY) minY = yy;
      if (yy > maxY) maxY = yy;
    }
  }
  if (maxX <= minX || maxY <= minY) return null;

  // Keep the band short — HUD names are a single line, not HP/MP.
  const maxBand = Math.max(12, Math.round(ch * 0.32));
  if (maxY - minY + 1 > maxBand) {
    const half = Math.floor(maxBand / 2);
    minY = Math.max(minY, Math.round(clickY) - half);
    maxY = Math.min(maxY, minY + maxBand - 1);
  }

  const inv = 1 / scanScale;
  const absMinX = minX * inv;
  const absMaxX = maxX * inv;
  const absMinY = minY * inv;
  const absMaxY = maxY * inv;
  const padX = Math.max(4, Math.floor((absMaxX - absMinX) * 0.1));
  const padY = Math.max(3, Math.floor((absMaxY - absMinY) * 0.22));
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

  const hard = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, scale);
  enhanceNameCyanHard(hard);
  urls.push(toDataUrl(padCanvas(hard, 18)));

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
): Promise<{ crops: string[]; previewDataUrl: string; colorDataUrl: string }> {
  const img = await loadImageForOcr(source);
  const probes = [
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP),
    nameRectAroundClick(xRatio, yRatio, NAME_CLICK_CROP_WIDE),
  ];

  const crops: string[] = [];
  let colorDataUrl = "";
  let bestBounds: { x: number; y: number; w: number; h: number } | null = null;
  for (const probe of probes) {
    const bounds = findBlueNameBoundsInProbe(img, probe, xRatio, yRatio);
    if (!bounds) continue;
    bestBounds = bounds;
    break;
  }

  if (bestBounds) {
    crops.push(...variantsFromBounds(img, bestBounds));
    const colorScale = bestBounds.w < 90 ? 5.5 : 4.5;
    const color = cropAbsolute(
      img,
      bestBounds.x,
      bestBounds.y,
      bestBounds.w,
      bestBounds.h,
      colorScale,
    );
    colorDataUrl = toDataUrl(padCanvas(color, 18));
  } else {
    const rect = probes[0];
    const gray = cropRatio(img, rect, 4);
    enhanceNameGray(gray);
    crops.push(toDataUrl(padCanvas(gray, 14)));
    const local = cropRatio(img, rect, 4);
    enhanceNameLocalBright(local);
    crops.push(toDataUrl(padCanvas(local, 14)));
    colorDataUrl = toDataUrl(padCanvas(cropRatio(img, rect, 4), 14));
  }

  return {
    crops,
    colorDataUrl,
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
