/**
 * Browser-side screenshot crops / contrast boosts for combat-power OCR.
 * Game UI names are often light-cyan on noisy 3D backgrounds; combat power
 * sits on a dark plate — different crops help Tesseract a lot.
 */

export type PreprocessVariant = {
  label: string;
  dataUrl: string;
  /** Prefer single-line / sparse modes for name crops */
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

/** Keep cyan / light-blue / near-white glyphs; crush everything else to black. */
export function enhanceNameColors(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const brightness = (r + g + b) / 3;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;

    // Typical character-name cyan / sky-blue
    const cyanLike =
      b >= 120 &&
      b >= g - 10 &&
      b > r + 18 &&
      brightness >= 90 &&
      brightness <= 245;

    // Soft white / pale blue-white outline
    const pale =
      brightness >= 185 &&
      sat < 55 &&
      b >= r - 5;

    // Gold/brown class titles sometimes sit near the name — keep bright gold too
    // so OCR still sees nearby tokens, but prefer name colors above.
    const keep = cyanLike || pale;
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
 * Build several OCR-friendly crops from a character equipment screenshot.
 */
export async function buildCombatPowerOcrVariants(
  source: File | Blob | string,
): Promise<PreprocessVariant[]> {
  const img = await loadImageElement(source);
  const variants: PreprocessVariant[] = [];

  // Full frame (baseline — already works well for 战斗力)
  {
    const full = cropScaled(img, 0, 0, 1, 1, img.width < 900 ? 1.6 : 1);
    variants.push({
      label: "full",
      dataUrl: toDataUrl(full),
      mode: "full",
    });
  }

  // Broad top band (class + name + title)
  {
    const band = cropScaled(img, 0.18, 0.02, 0.64, 0.22, 2.4);
    enhanceNameColors(band);
    variants.push({
      label: "name-band",
      dataUrl: toDataUrl(band),
      mode: "name",
    });
  }

  // Tight name line (center top)
  {
    const line = cropScaled(img, 0.26, 0.07, 0.48, 0.1, 3);
    enhanceNameColors(line);
    variants.push({
      label: "name-line",
      dataUrl: toDataUrl(line),
      mode: "name",
    });
  }

  // Alternate slightly lower (XP bar sits under name on some UIs)
  {
    const alt = cropScaled(img, 0.22, 0.05, 0.56, 0.14, 2.8);
    enhanceNameColors(alt);
    variants.push({
      label: "name-alt",
      dataUrl: toDataUrl(alt),
      mode: "name",
    });
  }

  // Combat power plate near lower-middle of character panel
  {
    const power = cropScaled(img, 0.2, 0.52, 0.6, 0.22, 2.2);
    enhanceLightText(power);
    variants.push({
      label: "power",
      dataUrl: toDataUrl(power),
      mode: "power",
    });
  }

  return variants;
}
