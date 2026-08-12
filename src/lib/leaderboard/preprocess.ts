/**
 * Browser-side crops for combat-power OCR.
 * Names are bright blue/cyan at the top; combat power is white on a dark plate.
 * Name crops must never keep white UI text (e.g. 日程自动进行中).
 */

export type PreprocessVariant = {
  label: string;
  dataUrl: string;
  mode: "name" | "power" | "full";
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

function cropScaled(
  img: HTMLImageElement,
  sxRatio: number,
  syRatio: number,
  swRatio: number,
  shRatio: number,
  scale: number,
): HTMLCanvasElement {
  const sx = Math.floor(img.width * sxRatio);
  const sy = Math.floor(img.height * syRatio);
  const sw = Math.max(1, Math.floor(img.width * swRatio));
  const sh = Math.max(1, Math.floor(img.height * shRatio));
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

/** Saturated blue / cyan name ink — excludes white/gray UI. */
export function blueInkScore(r: number, g: number, b: number): number {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;

  if (sat < 28) return 0;
  if (brightness > 235) return 0;
  if (b < 110) return 0;
  if (b <= r + 18) return 0;
  if (b < g - 15) return 0;

  // Higher = more "name blue"
  const blueness = b - Math.max(r, g * 0.9);
  if (blueness < 12) return 0;
  return blueness + sat * 0.25;
}

export function isNameBluePixel(r: number, g: number, b: number): boolean {
  return blueInkScore(r, g, b) >= 20;
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

/**
 * Blue name ink → dark strokes on white (Tesseract-friendly).
 * Soft alpha keeps stroke thickness better than hard 1-bit.
 */
export function enhanceNameColors(canvas: HTMLCanvasElement): HTMLCanvasElement {
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
    // Black ink on white background
    const v = fat[p] ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Mild contrast grayscale of top band (match-only helper path). */
export function enhanceTopGrayscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // Emphasize blue channel so cyan names stay dark-ish after invert logic
    const score = blueInkScore(r, g, b);
    let v: number;
    if (score >= 18) {
      v = Math.max(0, 255 - Math.min(255, Math.floor(score * 3 + 80)));
    } else {
      // Crush non-blue toward white so brown titles / white UI fade out
      const brightness = (r + g + b) / 3;
      v = brightness > 160 ? 255 : Math.min(255, Math.floor(brightness + 90));
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
    // Dark text on white for power digits too
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

/**
 * Find the strongest horizontal blue-text band in the upper area (character name line).
 */
export function findCyanNameBounds(img: HTMLImageElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const sampleW = Math.min(420, img.width);
  const sampleH = Math.min(560, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const yMax = Math.floor(sampleH * 0.38);
  const xMin = Math.floor(sampleW * 0.18);
  const xMax = Math.floor(sampleW * 0.82);
  const rowCounts = new Array<number>(yMax).fill(0);
  const rowMinX = new Array<number>(yMax).fill(sampleW);
  const rowMaxX = new Array<number>(yMax).fill(0);

  for (let y = 0; y < yMax; y += 1) {
    for (let x = xMin; x < xMax; x += 1) {
      const i = (y * sampleW + x) * 4;
      if (!isNameBluePixel(data[i], data[i + 1], data[i + 2])) continue;
      rowCounts[y] += 1;
      if (x < rowMinX[y]) rowMinX[y] = x;
      if (x > rowMaxX[y]) rowMaxX[y] = x;
    }
  }

  // Sliding window ≈ name line height
  const win = Math.max(6, Math.floor(sampleH * 0.035));
  let bestSum = 0;
  let bestY = -1;
  for (let y = 0; y + win <= yMax; y += 1) {
    let sum = 0;
    for (let k = 0; k < win; k += 1) sum += rowCounts[y + k];
    if (sum > bestSum) {
      bestSum = sum;
      bestY = y;
    }
  }

  if (bestY < 0 || bestSum < 30) return null;

  let minX = sampleW;
  let maxX = 0;
  for (let y = bestY; y < bestY + win; y += 1) {
    if (rowCounts[y] < 2) continue;
    if (rowMinX[y] < minX) minX = rowMinX[y];
    if (rowMaxX[y] > maxX) maxX = rowMaxX[y];
  }
  if (maxX <= minX) return null;

  const padX = Math.max(10, Math.floor((maxX - minX) * 0.25));
  const padY = Math.max(8, Math.floor(win * 0.9));
  const sx = (minX - padX) / sampleW;
  const sy = (bestY - padY) / sampleH;
  const sw = (maxX - minX + padX * 2) / sampleW;
  const sh = (win + padY * 2) / sampleH;

  return {
    x: Math.max(0, sx) * img.width,
    y: Math.max(0, sy) * img.height,
    w: Math.min(1 - Math.max(0, sx), Math.max(sw, 0.2)) * img.width,
    h: Math.min(1 - Math.max(0, sy), Math.max(sh, 0.04)) * img.height,
  };
}

export async function buildCombatPowerOcrVariants(
  source: File | Blob | string,
): Promise<PreprocessVariant[]> {
  const img = await loadImageElement(source);
  const variants: PreprocessVariant[] = [];

  {
    const full = cropScaled(img, 0, 0, 1, 1, img.width < 900 ? 1.5 : 1);
    variants.push({ label: "full", dataUrl: toDataUrl(full), mode: "full" });
  }

  const bounds = findCyanNameBounds(img);
  if (bounds) {
    // Raw color crop first — chi_sim often reads blue glyphs better than hard masks
    const raw = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, 3.6);
    variants.push({
      label: "name-auto-raw",
      dataUrl: toDataUrl(raw),
      mode: "name",
    });

    const auto = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, 3.6);
    enhanceNameColors(auto);
    variants.push({
      label: "name-auto-blue",
      dataUrl: toDataUrl(auto),
      mode: "name",
    });

    const soft = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, 3.6);
    enhanceTopGrayscale(soft);
    variants.push({
      label: "name-auto-soft",
      dataUrl: toDataUrl(soft),
      mode: "name",
    });
  }

  const nameCrops: Array<[string, number, number, number, number, number]> = [
    ["name-band", 0.2, 0.03, 0.6, 0.16, 3],
    ["name-line", 0.28, 0.07, 0.44, 0.08, 3.8],
    ["name-alt", 0.24, 0.05, 0.52, 0.11, 3.2],
  ];

  for (const [label, sx, sy, sw, sh, scale] of nameCrops) {
    const hard = cropScaled(img, sx, sy, sw, sh, scale);
    enhanceNameColors(hard);
    variants.push({ label, dataUrl: toDataUrl(hard), mode: "name" });

    const soft = cropScaled(img, sx, sy, sw, sh, scale);
    enhanceTopGrayscale(soft);
    variants.push({
      label: `${label}-soft`,
      dataUrl: toDataUrl(soft),
      mode: "name",
    });
  }

  {
    const power = cropScaled(img, 0.2, 0.5, 0.6, 0.28, 2.2);
    enhanceLightText(power);
    variants.push({ label: "power", dataUrl: toDataUrl(power), mode: "power" });
  }

  return variants;
}
