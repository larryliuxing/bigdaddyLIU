import { NextResponse } from "next/server";
import { getAdminSession, getMemberSession } from "@/lib/auth";
import { getLeaderboardImage } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = Number(searchParams.get("memberId"));
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  }

  const imageData = getLeaderboardImage(memberId);
  if (!imageData) {
    return NextResponse.json(
      { error: "该成员暂无上传截图" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    memberId,
    imageData,
  });
}
