import { NextResponse } from "next/server";
import { getAdminSession, requireMemberSession } from "@/lib/auth";
import {
  deleteLeaderboardEntry,
  getLeaderboardBoard,
  upsertLeaderboardEntry,
} from "@/lib/db";
import { parseCombatPowerScreenshot } from "@/lib/leaderboard/parse";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getLeaderboardBoard(0.85));
}

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ocrText = String(body?.ocrText ?? "");
  const imageData =
    typeof body?.imageData === "string" ? body.imageData : null;

  if (!ocrText.trim()) {
    return NextResponse.json(
      { error: "请先粘贴或上传战力截图并完成识别" },
      { status: 400 },
    );
  }

  const parsed = parseCombatPowerScreenshot(ocrText, member.name);
  if (!parsed.ok || parsed.combatPower == null) {
    return NextResponse.json(
      {
        error: parsed.error || "识别失败",
        detectedName: parsed.detectedName,
        combatPower: parsed.combatPower,
      },
      { status: 400 },
    );
  }

  upsertLeaderboardEntry({
    memberId: member.id,
    memberName: member.name,
    combatPower: parsed.combatPower,
    ocrName: parsed.detectedName || member.name,
    imageData,
  });

  return NextResponse.json({
    ok: true,
    combatPower: parsed.combatPower,
    detectedName: parsed.detectedName,
    board: getLeaderboardBoard(0.85),
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const memberId = Number(searchParams.get("memberId"));
  const member = await requireMemberSession();
  const admin = await getAdminSession();

  if (!member && !admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  // Members can only delete themselves; admin can delete any
  if (member && !admin) {
    deleteLeaderboardEntry(member.id);
    return NextResponse.json({ ok: true, board: getLeaderboardBoard(0.85) });
  }

  if (!memberId) {
    return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  }

  deleteLeaderboardEntry(memberId);
  return NextResponse.json({ ok: true, board: getLeaderboardBoard(0.85) });
}
