export type PaddleOcrResult = {
  text: string;
  lines: string[];
};

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
}

export async function toOcrDataUrl(image: string | File | Blob) {
  if (typeof image === "string") {
    if (image.startsWith("data:image/")) return image;
    const res = await fetch(image);
    if (!res.ok) throw new Error("图片读取失败");
    return blobToDataUrl(await res.blob());
  }
  return blobToDataUrl(image);
}

function combineAbortSignals(
  timeout: AbortSignal,
  extra?: AbortSignal,
): AbortSignal {
  if (!extra) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeout, extra]);
  }
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (timeout.aborted || extra.aborted) {
    ac.abort();
    return ac.signal;
  }
  timeout.addEventListener("abort", onAbort, { once: true });
  extra.addEventListener("abort", onAbort, { once: true });
  return ac.signal;
}

export async function recognizeWithPaddle(
  images: Array<string | null | undefined>,
  task = "general",
  signal?: AbortSignal,
): Promise<PaddleOcrResult> {
  const cleaned = images.filter(
    (v): v is string => Boolean(v && v.startsWith("data:image/")),
  );
  if (!cleaned.length) return { text: "", lines: [] };
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const timeout = AbortSignal.timeout(12000);
  let res: Response;
  try {
    res = await fetch("/api/ocr/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, images: cleaned.slice(0, 4) }),
      signal: combineAbortSignals(timeout, signal),
    });
  } catch (err) {
    if (signal?.aborted) {
      throw err instanceof DOMException
        ? err
        : new DOMException("Aborted", "AbortError");
    }
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new Error("识别超时。请把框再缩小一点后重试，或改从左侧名单点选");
    }
    throw err;
  }
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    lines?: unknown;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "识别服务失败");
  }
  const lines = Array.isArray(data.lines)
    ? data.lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const text = String(data.text || lines.join("\n")).trim();
  return { text, lines };
}

export function prewarmPaddleOcr() {
  void fetch("/api/ocr/health").catch(() => undefined);
}
