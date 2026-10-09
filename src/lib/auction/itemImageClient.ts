"use client";

import {
  MAX_AUCTION_ITEM_IMAGE_CHARS,
  needsAuctionItemImageCompress,
  sanitizeAuctionItemImage,
} from "./itemImage";

const MAX_EDGE = 1280;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = dataUrl;
  });
}

function encodeFittedJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): string | null {
  let width = sourceWidth;
  let height = sourceHeight;
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const qualities = [0.8, 0.66, 0.52];
  for (let pass = 0; pass < 3; pass += 1) {
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
    for (const quality of qualities) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= MAX_AUCTION_ITEM_IMAGE_CHARS) return url;
    }
    width = Math.max(320, Math.round(width * 0.72));
    height = Math.max(240, Math.round(height * 0.72));
  }
  return null;
}

/**
 * Clipboard screenshots are often multi-MB PNGs. Writing those into the
 * request freezes the server. Shrink to one JPEG before upload.
 * Name-recognition crops do not use this.
 */
export async function compressAuctionItemImage(
  image: string | File | Blob,
): Promise<string | null> {
  if (typeof image === "string") {
    const raw = image.trim();
    if (!raw.startsWith("data:image/")) return null;
    if (!needsAuctionItemImageCompress(raw)) {
      return sanitizeAuctionItemImage(raw);
    }
  } else if (image.size < 32) {
    return null;
  }

  try {
    if (typeof createImageBitmap === "function") {
      const source =
        typeof image === "string" ? await (await fetch(image)).blob() : image;
      const bitmap = await createImageBitmap(source);
      try {
        const encoded = encodeFittedJpeg(bitmap, bitmap.width, bitmap.height);
        if (encoded) return encoded;
      } finally {
        bitmap.close();
      }
    }
  } catch {
    // Fall through to the element decoder for data URLs.
  }

  if (typeof image !== "string") return null;
  try {
    const img = await loadImage(image);
    return (
      encodeFittedJpeg(
        img,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
      ) || sanitizeAuctionItemImage(image)
    );
  } catch {
    return sanitizeAuctionItemImage(image);
  }
}
