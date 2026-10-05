import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const OCR_BASE = (process.env.GUILD_OCR_URL || "http://127.0.0.1:8765").replace(
  /\/$/,
  "",
);
const MAX_IMAGE_CHARS = 8_000_000;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const extra = Array.isArray(body?.images)
    ? body.images.filter((v: unknown) => typeof v === "string")
    : [];
  const images = [body?.image, body?.imageData, ...extra]
    .filter(
      (v: unknown): v is string =>
        typeof v === "string" &&
        v.startsWith("data:image/") &&
        v.length < MAX_IMAGE_CHARS,
    )
    .slice(0, 4);
  if (!images.length) {
    return NextResponse.json({ text: "", lines: [] });
  }

  try {
    const res = await fetch(`${OCR_BASE}/ocr/recognize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: String(body?.task || "general"),
        images,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      text?: string;
      lines?: unknown;
      error?: string;
    };
    if (!res.ok) {
      return NextResponse.json(
        { text: "", lines: [], error: data.error || "识别服务失败" },
        { status: 502 },
      );
    }
    const lines = Array.isArray(data.lines)
      ? data.lines.map((line) => String(line || "").trim()).filter(Boolean)
      : [];
    return NextResponse.json({
      text: String(data.text || lines.join("\n")).trim(),
      lines,
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json(
      {
        text: "",
        lines: [],
        error: timedOut
          ? "识别超时。请把框再缩小一点后重试，或改从左侧名单点选"
          : "连不上识别服务（8765）。请看 pm2 logs guild-ocr，等模型加载完再试",
      },
      { status: 503 },
    );
  }
}
