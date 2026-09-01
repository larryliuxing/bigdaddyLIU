import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";
import { castPinkVote, getPublicAuctionSession, rollPinkPoints } from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const itemId = Number(body?.itemId);
  if (!(itemId > 0)) {
    return NextResponse.json({ error: "请选择拍品" }, { status: 400 });
  }

  const session = getPublicAuctionSession();
  if (!session || session.status !== "live") {
    return NextResponse.json({ error: "暂无进行中的拍卖" }, { status: 400 });
  }

  try {
    if (action === "vote") {
      const candidateId = Number(body?.candidateId);
      if (!(candidateId > 0)) {
        return NextResponse.json({ error: "请选择投票对象" }, { status: 400 });
      }
      const item = castPinkVote({
        itemId,
        voterMemberId: member.id,
        candidateMemberId: candidateId,
      });
      return NextResponse.json({
        item,
        room: buildRoomState(session.id, {
          lite: true,
          viewerMemberId: member.id,
        }),
      });
    }

    if (action === "roll") {
      const result = rollPinkPoints({ itemId, memberId: member.id });
      return NextResponse.json({
        points: result.points,
        item: result.item,
        room: buildRoomState(session.id, {
          lite: true,
          viewerMemberId: member.id,
        }),
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 },
    );
  }
}
