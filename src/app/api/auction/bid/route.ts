import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";
import { getLatestSession, placeBid } from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  const isAnonymous = Boolean(body?.isAnonymous);

  if (!(amount > 0)) {
    return NextResponse.json({ error: "请输入有效出价" }, { status: 400 });
  }

  const session = getLatestSession();
  if (!session) {
    return NextResponse.json({ error: "暂无拍卖场次" }, { status: 400 });
  }

  try {
    const result = placeBid({
      sessionId: session.id,
      memberId: member.id,
      amount,
      isAnonymous,
    });
    return NextResponse.json({
      ...result,
      room: buildRoomState(session.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "出价失败" },
      { status: 400 },
    );
  }
}
