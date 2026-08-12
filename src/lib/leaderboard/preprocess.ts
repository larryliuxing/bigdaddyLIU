/**
 * Browser-side crops for combat-power OCR.
 * Character names are bright blue/cyan; combat power is white on a dark plate.
 * Name matching must ONLY use blue-filtered top crops — never bottom white UI.
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
    Math.max(0, sx),
    Math.max(0, sy),
    Math.max(1, sw),
    Math.max(1, sh),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** True for saturated blue / cyan name glyphs — NOT white UI text. */
export function isNameBluePixel(r: number, g: number, b: number): boolean {
  const brightness = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;

  // Reject near-white / gray UI ("日程自动进行中", 战斗力, etc.)
  if (sat < 35) return false;
  if (brightness > 230) return false;

  // Bright blue / cyan character names
  return (
    b >= 125 &&
    b > r + 28 &&
    b >= g - 8 &&
    sat >= 35 &&
    brightness >= 85 &&
    brightness <= 230
  );
}

/** Keep ONLY blue/cyan name pixels; crush white and everything else. */
export function enhanceNameColors(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const keep = isNameBluePixel(d[i], d[i + 1], d[i + 2]);
    const v = keep ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Boost light text for combat-power plates (white on dark). */
export function enhanceLightText(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
    const v = brightness >= 140 ? 255 : 0;
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
 * Locate the densest blue/cyan text cluster in the upper half (character name).
 */
export function findCyanNameBounds(img: HTMLImageElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const sampleW = Math.min(360, img.width);
  const sampleH = Math.min(480, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const yMax = Math.floor(sampleH * 0.42);
  const xMin = Math.floor(sampleW * 0.15);
  const xMax = Math.floor(sampleW * 0.85);

  let minX = sampleW;
  let minY = sampleH;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (let y = 0; y < yMax; y += 1) {
    for (let x = xMin; x < xMax; x += 1) {
      const i = (y * sampleW + x) * 4;
      if (!isNameBluePixel(data[i], data[i + 1], data[i + 2])) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  // Need a meaningful cluster (name glyphs), not noise
  if (count < 40 || maxX <= minX || maxY <= minY) return null;

  const padX = Math.max(8, Math.floor((maxX - minX) * 0.35));
  const padY = Math.max(6, Math.floor((maxY - minY) * 0.8));
  const sx = (minX - padX) / sampleW;
  const sy = (minY - padY) / sampleH;
  const sw = (maxX - minX + padX * 2) / sampleW;
  const sh = (maxY - minY + padY * 2) / sampleH;

  return {
    x: Math.max(0, sx) * img.width,
    y: Math.max(0, sy) * img.height,
    w: Math.min(1 - Math.max(0, sx), sw) * img.width,
    h: Math.min(1 - Math.max(0, sy), sh) * img.height,
  };
}

/**
 * Build OCR crops. Name variants are blue-only; power/full never feed name matching.
 */
export async function buildCombatPowerOcrVariants(
  source: File | Blob | string,
): Promise<PreprocessVariant[]> {
  const img = await loadImageElement(source);
  const variants: PreprocessVariant[] = [];

  // Full frame — combat power / fallback digits only (not used for name identity)
  {
    const full = cropScaled(img, 0, 0, 1, 1, img.width < 900 ? 1.6 : 1);
    variants.push({
      label: "full",
      dataUrl: toDataUrl(full),
      mode: "full",
    });
  }

  // Auto blue-cluster crop (best for 「唐小虎」 style names)
  const bounds = findCyanNameBounds(img);
  if (bounds) {
    const auto = cropAbsolute(img, bounds.x, bounds.y, bounds.w, bounds.h, 3.2);
    enhanceNameColors(auto);
    variants.push({
      label: "name-auto-blue",
      dataUrl: toDataUrl(auto),
      mode: "name",
    });
  }

  // Fixed top-center blue name crops
  const nameCrops: Array<[string, number, number, number, number, number]> = [
    ["name-band", 0.18, 0.02, 0.64, 0.2, 2.6],
    ["name-line", 0.26, 0.06, 0.48, 0.1, 3.2],
    ["name-alt", 0.22, 0.04, 0.56, 0.13, 2.8],
  ];

  for (const [label, sx, sy, sw, sh, scale] of nameCrops) {
    const crop = cropScaled(img, sx, sy, sw, sh, scale);
    enhanceNameColors(crop);
    variants.push({
      label,
      dataUrl: toDataUrl(crop),
      mode: "name",
    });
  }

  // Combat power plate
  {
    const power = cropScaled(img, 0.2, 0.5, 0.6, 0.28, 2.2);
    enhanceLightText(power);
    variants.push({
      label: "power",
      dataUrl: toDataUrl(power),
      mode: "power",
    });
  }

  return variants;
}
