import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  addTemporaryDividend,
  calculateDividends,
  getLatestSession,
  getSessionById,
  listDividends,
  listSessions,
  updateDividendAmount,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

function resolveTargetSession(bodySessionId?: unknown) {
  const id = Number(bodySessionId);
  if (Number.isFinite(id) && id > 0) {
    return getSessionById(id);
  }
  // Prefer latest ended session for dividend ops when latest is a new draft
  const latest = getLatestSession();
  if (latest?.status === "ended") return latest;
  const ended = listSessions().find((s) => s.status === "ended");
  return ended ?? latest;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = Number(searchParams.get("sessionId"));
  const session = sessionId
    ? listSessions().find((s) => s.id === sessionId)
    : resolveTargetSession();

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
  const session = resolveTargetSession(body?.sessionId);
  if (!session) {
    return NextResponse.json({ error: "暂无场次" }, { status: 400 });
  }

  try {
    if (action === "calculate") {
      const dividends = calculateDividends(session.id);
      return NextResponse.json({
        dividends,
        session,
        room: buildRoomState(session.id),
      });
    }

    if (action === "addTemporary") {
      const amount = Number(body?.amount ?? 0);
      if (!(amount > 0)) {
        return NextResponse.json({ error: "金额必须大于 0" }, { status: 400 });
      }
      const entry = addTemporaryDividend({
        sessionId: session.id,
        memberId: body?.memberId ? Number(body.memberId) : null,
        memberName: String(body?.memberName ?? ""),
        amount,
        note: body?.note,
      });
      return NextResponse.json({
        entry,
        dividends: listDividends(session.id),
        room: buildRoomState(session.id),
      });
    }

    if (action === "updateAmount") {
      const amount = Number(body?.amount ?? 0);
      if (!(amount >= 0) || Number.isNaN(amount)) {
        return NextResponse.json({ error: "金额无效" }, { status: 400 });
      }
      const entry = updateDividendAmount(
        Number(body?.id),
        amount,
        session.id,
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
