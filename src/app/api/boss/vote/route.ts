import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";
import { castBossVote, getBossRoomState, touchBossPresence } from "@/lib/db";
import type { BossVoteType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  touchBossPresence(member.id, member.name);

  const body = await request.json().catch(() => null);
  const bossId = Number(body?.bossId);
  const voteType = String(body?.voteType ?? "") as BossVoteType;

  if (!bossId || (voteType !== "killed" && voteType !== "not_spawned")) {
    return NextResponse.json({ error: "无效投票" }, { status: 400 });
  }

  try {
    const result = castBossVote({
      bossId,
      voteType,
      memberId: member.id,
      memberName: member.name,
    });
    return NextResponse.json({
      ...result,
      room: getBossRoomState(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "投票失败" },
      { status: 400 },
    );
  }
}
