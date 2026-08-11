import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  addTemporaryDividend,
  calculateDividends,
  getLatestSession,
  listDividends,
  listSessions,
  updateDividendAmount,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = Number(searchParams.get("sessionId"));
  const session = sessionId
    ? listSessions().find((s) => s.id === sessionId)
    : getLatestSession();

  return NextResponse.json({
    sessions: listSessions(),
    session,
    dividends: session ? listDividends(session.id) : [],
    room: buildRoomState(session?.id),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "calculate");
  const session = getLatestSession();
  if (!session) {
    return NextResponse.json({ error: "暂无场次" }, { status: 400 });
  }

  try {
    if (action === "calculate") {
      const dividends = calculateDividends(session.id);
      return NextResponse.json({
        dividends,
        room: buildRoomState(session.id),
      });
    }

    if (action === "addTemporary") {
      const entry = addTemporaryDividend({
        sessionId: session.id,
        memberId: body?.memberId ? Number(body.memberId) : null,
        memberName: String(body?.memberName ?? ""),
        amount: Number(body?.amount ?? 0),
        note: body?.note,
      });
      return NextResponse.json({
        entry,
        dividends: listDividends(session.id),
        room: buildRoomState(session.id),
      });
    }

    if (action === "updateAmount") {
      const entry = updateDividendAmount(
        Number(body?.id),
        Number(body?.amount ?? 0),
      );
      if (!entry) {
        return NextResponse.json({ error: "记录不存在" }, { status: 404 });
      }
      return NextResponse.json({
        entry,
        dividends: listDividends(session.id),
        room: buildRoomState(session.id),
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
