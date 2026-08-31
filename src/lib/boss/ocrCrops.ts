/**
 * Click crops for guild-boss screenshot OCR (white text on dark rows).
 */

import {
  enhanceLightText,
  loadImageForOcr,
} from "@/lib/leaderboard/preprocess";

type RatioRect = { x: number; y: number; w: number; h: number };

const NAME_CROPS: Array<{ w: number; h: number; xBias: number }> = [
  { w: 0.22, h: 0.055, xBias: 0.08 },
  { w: 0.34, h: 0.07, xBias: 0.12 },
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

function cropRatio(
  img: HTMLImageElement,
  rect: RatioRect,
  scale: number,
): HTMLCanvasElement {
  const sx = img.width * rect.x;
  const sy = img.height * rect.y;
  const sw = img.width * rect.w;
  const sh = img.height * rect.h;
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

/** Threshold a bit lower so gray 出没时间 still inks. */
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

export async function buildBossNameClickCrops(
  source: File | Blob | string,
  xRatio: number,
  yRatio: number,
): Promise<string[]> {
  const img = await loadImageForOcr(source);
  const urls: string[] = [];
  for (const size of NAME_CROPS) {
    const probe = rectAround(xRatio, yRatio, size.w, size.h, size.xBias);
    const raw = cropRatio(img, probe, 3.4);
    const light = cropRatio(img, probe, 3.4);
    enhanceLightText(light);
    urls.push(toDataUrl(padCanvas(raw, 12)));
    urls.push(toDataUrl(padCanvas(light, 12)));
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
      ? { w: 0.28, h: 0.07, xBias: 0.08, yBias: 0 }
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
