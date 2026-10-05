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

/**
 * Clipboard screenshots are often multi-MB PNGs. Writing those into SQLite
 * on the request thread freezes the whole server. Shrink to a JPEG first.
 */
export async function compressAuctionItemImage(
  dataUrl: string,
): Promise<string | null> {
  const raw = typeof dataUrl === "string" ? dataUrl.trim() : "";
  if (!raw.startsWith("data:image/")) return null;
  if (!needsAuctionItemImageCompress(raw)) {
    return sanitizeAuctionItemImage(raw);
  }

  try {
    const img = await loadImage(raw);
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!(width > 0 && height > 0)) return sanitizeAuctionItemImage(raw);

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const qualities = [0.82, 0.7, 0.58, 0.45];
    let last: string | null = null;
    for (let pass = 0; pass < 4; pass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      for (const quality of qualities) {
        last = canvas.toDataURL("image/jpeg", quality);
        if (last.length <= MAX_AUCTION_ITEM_IMAGE_CHARS) return last;
      }
      width = Math.max(320, Math.round(width * 0.72));
      height = Math.max(240, Math.round(height * 0.72));
    }
    return sanitizeAuctionItemImage(last || raw);
  } catch {
    return sanitizeAuctionItemImage(raw);
  }
}
