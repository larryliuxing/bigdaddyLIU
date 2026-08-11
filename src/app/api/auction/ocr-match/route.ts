import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { matchNamesFromText } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "");
  if (!text.trim()) {
    return NextResponse.json({ error: "没有识别到文字" }, { status: 400 });
  }

  const result = matchNamesFromText(text);
  return NextResponse.json(result);
}
