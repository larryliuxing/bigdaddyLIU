import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  getLeaderboardBoard,
  getLeaderboardThresholdPercent,
  setLeaderboardThresholdPercent,
} from "@/lib/db";
import { parseLeaderboardThresholdPercent } from "@/lib/leaderboard/threshold";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const thresholdPercent = getLeaderboardThresholdPercent();
  return NextResponse.json({
    thresholdPercent,
    board: getLeaderboardBoard(),
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const thresholdPercent = parseLeaderboardThresholdPercent(
    body?.thresholdPercent,
  );
  if (thresholdPercent == null) {
    return NextResponse.json(
      { error: "百分比需在 1%–100% 之间" },
      { status: 400 },
    );
  }
  const saved = setLeaderboardThresholdPercent(thresholdPercent);
  return NextResponse.json({
    ok: true,
    thresholdPercent: saved,
    board: getLeaderboardBoard(),
  });
}
