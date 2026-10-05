/** Hard cap for stored auction-item screenshots (data-URL chars). */
export const MAX_AUCTION_ITEM_IMAGE_CHARS = 450_000;

/** Tiny images skip canvas work entirely. */
export const KEEP_AUCTION_ITEM_IMAGE_CHARS = 80_000;

/** Reject add-item JSON bodies before they freeze the Node event loop. */
export const MAX_AUCTION_ITEM_POST_BYTES = 2_000_000;

/** Paste already JPEG-compresses. Re-encoding on submit freezes the tab. */
export function needsAuctionItemImageCompress(imageData: unknown): boolean {
  if (typeof imageData !== "string") return false;
  const trimmed = imageData.trim();
  if (!trimmed.startsWith("data:image/") || trimmed.length < 32) return false;
  if (trimmed.length <= KEEP_AUCTION_ITEM_IMAGE_CHARS) return false;
  if (
    trimmed.length <= MAX_AUCTION_ITEM_IMAGE_CHARS &&
    /^data:image\/jpe?g/i.test(trimmed)
  ) {
    return false;
  }
  return true;
}

export function sanitizeAuctionItemImage(
  imageData: unknown,
): string | null {
  if (typeof imageData !== "string") return null;
  const trimmed = imageData.trim();
  if (trimmed.length < 32) return null;
  if (!trimmed.startsWith("data:image/")) return null;
  if (trimmed.length > MAX_AUCTION_ITEM_IMAGE_CHARS) return null;
  return trimmed;
}

export async function readJsonBodyCapped(
  request: Request,
  maxBytes = MAX_AUCTION_ITEM_POST_BYTES,
): Promise<{ tooLarge: true } | { tooLarge?: false; body: unknown }> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { tooLarge: true };
  }

  const reader = request.body?.getReader();
  if (!reader) return { body: null };

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(merged);
  if (!text) return { body: null };
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { body: null };
  }
}
