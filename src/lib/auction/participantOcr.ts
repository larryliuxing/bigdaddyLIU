/**
 * OCR the leftmost「名称」column from a game「参与者」modal screenshot,
 * then callers match those names against guild members for dividends.
 */

import { recognizeWithPaddle } from "@/lib/ocr/client";

export type ParticipantOcrResult = {
  text: string;
  names: string[];
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

export type RatioRect = { x: number; y: number; w: number; h: number };

/**
 * Crops for already-cropped modal shots AND wider game screenshots.
 * Name column sits under「名称」, left of「品级」.
 */
const NAME_COLUMN_CROPS: RatioRect[] = [
  // Tight modal paste (most common from clipboard)
  { x: 0.04, y: 0.2, w: 0.36, h: 0.68 },
  { x: 0.02, y: 0.18, w: 0.4, h: 0.7 },
  { x: 0.06, y: 0.22, w: 0.32, h: 0.64 },
  // Slightly inset (headers / padding)
  { x: 0.08, y: 0.24, w: 0.3, h: 0.6 },
  // Older wider-screen guesses
  { x: 0.16, y: 0.24, w: 0.24, h: 0.58 },
  { x: 0.18, y: 0.26, w: 0.2, h: 0.55 },
];

/** Whole table body — used to parse「名字 品级 战盟」rows. */
const TABLE_BODY_CROPS: RatioRect[] = [
  { x: 0.02, y: 0.18, w: 0.96, h: 0.72 },
  { x: 0.04, y: 0.2, w: 0.92, h: 0.68 },
  { x: 0.1, y: 0.22, w: 0.8, h: 0.62 },
];

const GRADE_WORDS =
  /普通|守护|洪门|精英|领袖|成员|品级|战盟|名称|参与者|贡献度|获得|能力值/;

/**
 * Participant modal names are a fixed light gray on charcoal,
 * about RGB(120,124,130) on RGB(11,15,19). Brightness often sits
 * around 80–140 — far below the old 125/150 ink cut, which wiped
 * the glyphs before Tesseract ran.
 */
export function isParticipantNameInk(r: number, g: number, b: number) {
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  if (sat > 40) return false;
  if (brightness >= 82) return true;
  if (brightness >= 70 && sat <= 18) return true;
  return false;
}

export function participantNameInkCut(inkMean: number) {
  return Math.max(52, Math.min(118, inkMean - 32));
}

function cropRatio(
  img: HTMLImageElement,
  rect: RatioRect,
  scale: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const sw = Math.max(1, Math.floor(img.width * rect.w));
  const sh = Math.max(1, Math.floor(img.height * rect.h));
  canvas.width = Math.max(8, Math.round(sw * scale));
  canvas.height = Math.max(8, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    Math.max(0, Math.floor(img.width * rect.x)),
    Math.max(0, Math.floor(img.height * rect.y)),
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Soft contrast plate: keep stroke detail better than hard binary. */
function enhanceNameColumn(src: HTMLCanvasElement): HTMLCanvasElement {
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("无法创建画布");
  const image = sctx.getImageData(0, 0, src.width, src.height);
  const { data } = image;

  // First pass: collect brightness of likely ink for adaptive cut
  let inkSum = 0;
  let inkCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (isParticipantNameInk(data[i], data[i + 1], data[i + 2])) {
      inkSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      inkCount++;
    }
  }
  const inkMean = inkCount > 0 ? inkSum / inkCount : 110;
  const cut = participantNameInkCut(inkMean);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // Reject saturated UI chrome (guild icons); keep the light-gray names.
    const isInk =
      sat <= 40 &&
      brightness >= cut &&
      (isParticipantNameInk(r, g, b) || brightness >= cut + 8);
    // Map to soft gray/black instead of pure binary to keep thin strokes
    if (isInk) {
      const t = Math.max(0, Math.min(1, (brightness - cut) / 80));
      const v = Math.round(40 - t * 30);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    data[i + 3] = 255;
  }

  const out = document.createElement("canvas");
  const pad = 16;
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2;
  const dctx = out.getContext("2d");
  if (!dctx) throw new Error("无法创建画布");
  dctx.fillStyle = "#ffffff";
  dctx.fillRect(0, 0, out.width, out.height);
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  tmp.getContext("2d")!.putImageData(image, 0, 0);
  dctx.drawImage(tmp, pad, pad);
  return out;
}

function cleanNameToken(raw: string) {
  return raw
    .replace(/\s+/g, "")
    .replace(/[|｜\[\]【】()（）<>《》·•.,，、。:：;；'"“”‘’\-_/\\=+~`!@#$%^&*]/g, "")
    .replace(/[0-9A-Za-z]/g, "")
    .replace(GRADE_WORDS, "");
}

function isPlausibleName(name: string) {
  if (name.length < 2 || name.length > 16) return false;
  if (!/^[\u4e00-\u9fff]+$/.test(name)) return false;
  if (GRADE_WORDS.test(name)) return false;
  // Reject obvious OCR junk fragments that are all the same char etc.
  if (name.length >= 3 && /^(.)\1+$/.test(name)) return false;
  // Common guild / header leftovers
  if (/^(千帆舞|战盟|名称|品级|参与者)$/.test(name)) return false;
  return true;
}

/** Parse a table row like「黄岳民之父 普通 千帆舞」→ name. */
export function parseParticipantRowName(line: string): string | null {
  const raw = line.replace(/[|｜]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return null;

  // Cut before known grade labels when present
  const gradeSplit = raw.split(
    /\s*(?:普通|守护|洪门|精英|领袖)\s*/,
  );
  const head = (gradeSplit[0] || "").trim();
  const fromHead = cleanNameToken(head);
  if (isPlausibleName(fromHead)) return fromHead;

  // Fallback: first contiguous CJK run on the line
  const runs = cleanNameToken(raw).match(/[\u4e00-\u9fff]{2,12}/g) || [];
  for (const run of runs) {
    if (isPlausibleName(run)) return run;
  }
  return null;
}

export function namesFromOcrResult(text: string, lines: string[] = []): string[] {
  const names: string[] = [];
  const push = (n: string | null) => {
    if (!n || !isPlausibleName(n)) return;
    if (!names.includes(n)) names.push(n);
  };

  for (const line of lines) {
    push(parseParticipantRowName(line));
    push(cleanNameToken(line));
  }

  for (const line of text.split(/\n+/)) {
    push(parseParticipantRowName(line));
  }

  for (const line of text.split(/\n+/)) {
    const cleaned = cleanNameToken(line);
    push(cleaned);
    const runs = cleaned.match(/[\u4e00-\u9fff]{2,16}/g) || [];
    for (const run of runs) push(run);
  }

  return names;
}

function extractNameCandidates(text: string): string[] {
  return namesFromOcrResult(text);
}

function scoreNames(names: string[]) {
  if (!names.length) return 0;
  const avgLen =
    names.reduce((s, n) => s + n.length, 0) / Math.max(1, names.length);
  // Prefer several mid-length Chinese names (typical character names 2–8)
  return names.length * 10 + avgLen * 3;
}

const OCR_DATA_URL_LIMIT = 450_000;

function canvasToOcrDataUrl(canvas: HTMLCanvasElement): string {
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  if (jpeg.length <= OCR_DATA_URL_LIMIT) return jpeg;
  let width = canvas.width;
  let height = canvas.height;
  while (width > 80 && height > 80) {
    width = Math.max(80, Math.round(width * 0.75));
    height = Math.max(80, Math.round(height * 0.75));
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const ctx = tmp.getContext("2d");
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, width, height);
    const next = tmp.toDataURL("image/jpeg", 0.7);
    if (next.length <= OCR_DATA_URL_LIMIT) return next;
  }
  return canvas.toDataURL("image/jpeg", 0.55);
}

type Attempt = {
  names: string[];
  text: string;
  preview: string;
  score: number;
};

async function runCrops(
  img: HTMLImageElement,
  crops: RatioRect[],
  scale: number,
): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  for (const rect of crops) {
    const crop = cropRatio(img, rect, scale);
    const payload = canvasToOcrDataUrl(crop);
    const result = await recognizeWithPaddle([payload], "participant_names");
    const names = namesFromOcrResult(result.text, result.lines);
    attempts.push({
      names,
      text: result.text || result.lines.join("\n"),
      preview: payload,
      score: scoreNames(names),
    });
  }
  return attempts;
}

function mergeAttempts(attempts: Attempt[]): ParticipantOcrResult {
  attempts.sort((a, b) => b.score - a.score);
  const best = attempts[0];

  const ordered: string[] = [];
  const push = (name: string) => {
    if (!ordered.includes(name)) ordered.push(name);
  };
  for (const attempt of attempts) {
    for (const n of attempt.names) push(n);
  }

  return {
    text: best?.text || "",
    names: ordered,
    previewDataUrl: best?.preview || null,
  };
}

/**
 * Recognize names inside a user-drawn ratio rectangle on a participant screenshot.
 */
export async function recognizeParticipantNamesInRect(
  source: File | Blob | string,
  rect: RatioRect,
): Promise<ParticipantOcrResult> {
  const img = await loadImage(source);
  const attempts = await runCrops(img, [rect], 1);
  if (!attempts[0]?.names.length && img.height * rect.h < 280) {
    attempts.push(...(await runCrops(img, [rect], 1.4)));
  }
  return mergeAttempts(attempts);
}

/**
 * Recognize participant names from the left「名称」column of a modal screenshot.
 */
export async function recognizeParticipantNames(
  source: File | Blob | string,
): Promise<ParticipantOcrResult> {
  const img = await loadImage(source);

  const attempts = [
    ...(await runCrops(img, NAME_COLUMN_CROPS, 1)),
    ...(await runCrops(img, TABLE_BODY_CROPS, 1)),
  ];

  attempts.sort((a, b) => b.score - a.score);
  const best = attempts[0];

  // Consensus: names that appear in multiple crops/passes are far more reliable.
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    for (const n of attempt.names) {
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }

  const consensus = [...counts.entries()]
    .filter(([name, count]) => count >= 2 || name.length >= 3)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([name]) => name);

  const ordered =
    consensus.length > 0
      ? consensus
      : best?.names?.length
        ? best.names
        : [];

  return {
    text: best?.text || "",
    names: ordered,
    previewDataUrl: best?.preview || null,
  };
}
