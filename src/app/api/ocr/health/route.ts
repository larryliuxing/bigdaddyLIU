import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OCR_BASE = (process.env.GUILD_OCR_URL || "http://127.0.0.1:8765").replace(
  /\/$/,
  "",
);

export async function GET() {
  try {
    const res = await fetch(`${OCR_BASE}/health`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return NextResponse.json({
      ok: Boolean(res.ok && data.ok),
      engine: "paddleocr",
    });
  } catch {
    return NextResponse.json({ ok: false, engine: "paddleocr" }, { status: 503 });
  }
}
