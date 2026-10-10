import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";
import { readJsonBodyCapped } from "@/lib/auction/itemImage";

export const runtime = "nodejs";

const OCR_BASE = (process.env.GUILD_OCR_URL || "http://127.0.0.1:8765").replace(
  /\/$/,
  "",
);
const MAX_IMAGE_CHARS = 500_000;
const MAX_OCR_POST_BYTES = 3_000_000;

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const parsed = await readJsonBodyCapped(request, MAX_OCR_POST_BYTES);
  if (parsed.tooLarge) {
    return NextResponse.json(
      { text: "", error: "截图太大，已阻止以免卡住服务器。请把框缩小后再识别" },
      { status: 413 },
    );
  }
  const body = (parsed.body ?? null) as Record<string, unknown> | null;
  const image = typeof body?.image === "string" ? body.image : "";
  const extra = Array.isArray(body?.images)
    ? body.images.filter((v: unknown) => typeof v === "string")
    : [];
  const images = [image, ...extra].filter(
    (v: string) => v.startsWith("data:image/") && v.length < MAX_IMAGE_CHARS,
  );
  if (!images.length) {
    return NextResponse.json({ text: "" });
  }

  try {
    const res = await fetch(`${OCR_BASE}/ocr/recognize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "leaderboard_name", images }),
      signal: AbortSignal.timeout(18000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
    };
    if (!res.ok) {
      return NextResponse.json(
        { text: "", error: data.error || "识别服务失败" },
        { status: res.status },
      );
    }
    return NextResponse.json({ text: String(data.text || "").trim() });
  } catch {
    return NextResponse.json(
      { text: "", error: "识别服务未启动" },
      { status: 503 },
    );
  }
}
