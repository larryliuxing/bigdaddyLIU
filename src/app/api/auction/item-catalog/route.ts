import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { searchItemCatalog } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const q = String(new URL(request.url).searchParams.get("q") ?? "").slice(
    0,
    80,
  );
  return NextResponse.json({ items: searchItemCatalog(q, 20) });
}
