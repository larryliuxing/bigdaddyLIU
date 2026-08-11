import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";
import { addBossChat, getBossRoomState, touchBossPresence } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  touchBossPresence(member.id, member.name);
  const body = await request.json().catch(() => null);
  const message = String(body?.message ?? "");

  try {
    const chat = addBossChat({
      memberId: member.id,
      memberName: member.name,
      message,
    });
    return NextResponse.json({ chat, room: getBossRoomState() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发送失败" },
      { status: 400 },
    );
  }
}
