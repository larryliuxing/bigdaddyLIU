import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { matchParticipantNames } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "");
  const names = Array.isArray(body?.names)
    ? body.names.map((n: unknown) => String(n ?? "")).filter(Boolean)
    : [];
  if (!text.trim() && names.length === 0) {
    return NextResponse.json({ error: "没有识别到文字" }, { status: 400 });
  }

  // Prefer structured OCR names for「未入库」display; raw text only helps matching.
  const result = matchParticipantNames(
    names.length ? names : text.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    text,
  );
  return NextResponse.json(result);
}
