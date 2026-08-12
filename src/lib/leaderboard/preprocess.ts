/**
 * Ratio-based crops for the HUD screenshot template.
 * Name = blue top-left; power = top-left 能力值 + center-bottom number.
 */

import {
  LEADERBOARD_OCR_REGIONS,
  type RatioRect,
} from "./regions";

export type PreprocessVariant = {
  label: string;
  dataUrl: string;
  mode: "name" | "powerTop" | "powerBottom";
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

/** Blue name ink → black strokes on white. */
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

/** White UI numbers → black on white for power crops. */
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

/**
 * Build fixed-ratio OCR crops from the HUD template.
 */
export async function buildCombatPowerOcrVariants(
  source: File | Blob | string,
): Promise<PreprocessVariant[]> {
  const img = await loadImageElement(source);
  const variants: PreprocessVariant[] = [];
  const { name, nameWide, powerTop, powerBottom } = LEADERBOARD_OCR_REGIONS;

  // ① Name — raw + blue-only, two ratio boxes
  for (const [label, rect, scale] of [
    ["name", name, 3.5],
    ["name-wide", nameWide, 3.2],
  ] as const) {
    const raw = cropRatio(img, rect, scale);
    variants.push({
      label: `${label}-raw`,
      dataUrl: toDataUrl(raw),
      mode: "name",
    });
    const blue = cropRatio(img, rect, scale);
    enhanceNameBlue(blue);
    variants.push({
      label: `${label}-blue`,
      dataUrl: toDataUrl(blue),
      mode: "name",
    });
  }

  // ② Top-left power (能力值)
  {
    const raw = cropRatio(img, powerTop, 2.8);
    variants.push({
      label: "power-top-raw",
      dataUrl: toDataUrl(raw),
      mode: "powerTop",
    });
    const light = cropRatio(img, powerTop, 2.8);
    enhanceLightText(light);
    variants.push({
      label: "power-top",
      dataUrl: toDataUrl(light),
      mode: "powerTop",
    });
  }

  // ③ Center-bottom power
  {
    const raw = cropRatio(img, powerBottom, 2.6);
    variants.push({
      label: "power-bottom-raw",
      dataUrl: toDataUrl(raw),
      mode: "powerBottom",
    });
    const light = cropRatio(img, powerBottom, 2.6);
    enhanceLightText(light);
    variants.push({
      label: "power-bottom",
      dataUrl: toDataUrl(light),
      mode: "powerBottom",
    });
  }

  return variants;
}
