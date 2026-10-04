import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";

export const runtime = "nodejs";

const OCR_BASE = (process.env.GUILD_OCR_URL || "http://127.0.0.1:8765").replace(
  /\/$/,
  "",
);
const MAX_IMAGE_CHARS = 3_500_000;

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
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
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string };
    return NextResponse.json({ text: String(data.text || "").trim() });
  } catch {
    return NextResponse.json({ text: "", error: "识别服务未启动" }, { status: 503 });
  }
}
