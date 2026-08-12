import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  advanceAuction,
  createDraftSession,
  deleteAuctionSession,
  endAuctionSession,
  getSessionById,
  listSessionSummaries,
  startAuctionSession,
  updateSessionSchedule,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = Number(searchParams.get("sessionId"));
  const room = buildRoomState(
    Number.isFinite(sessionId) && sessionId > 0 ? sessionId : undefined,
  );
  return NextResponse.json({
    room,
    sessions: listSessionSummaries(),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  try {
    if (action === "create") {
      const scheduledStart =
        typeof body?.scheduledStart === "string" && body.scheduledStart
          ? body.scheduledStart
          : null;
      if (!scheduledStart) {
        return NextResponse.json(
          { error: "请设置开始时间" },
          { status: 400 },
        );
      }
      const durationMinutes = Number(body?.durationMinutes ?? 30);
      if (!(durationMinutes >= 5) || !(durationMinutes <= 180)) {
        return NextResponse.json(
          { error: "时长需在 5–180 分钟" },
          { status: 400 },
        );
      }
      const session = createDraftSession({
        scheduledStart,
        durationMinutes,
      });
      return NextResponse.json({
        session,
        sessions: listSessionSummaries(),
        room: buildRoomState(session.id),
      });
    }

    if (action === "updateSchedule") {
      const sessionId = Number(body?.sessionId);
      if (!sessionId) {
        return NextResponse.json({ error: "缺少场次 ID" }, { status: 400 });
      }
      const existing = getSessionById(sessionId);
      if (!existing) {
        return NextResponse.json({ error: "场次不存在" }, { status: 404 });
      }
      if (existing.status === "live" || existing.status === "ended") {
        return NextResponse.json(
          { error: "进行中或已完成的场次不可更改" },
          { status: 400 },
        );
      }
      const scheduledStart =
        typeof body?.scheduledStart === "string" && body.scheduledStart
          ? body.scheduledStart
          : null;
      if (!scheduledStart) {
        return NextResponse.json(
          { error: "请设置开始时间" },
          { status: 400 },
        );
      }
      const durationMinutes = Number(
        body?.durationMinutes ?? existing.durationMinutes,
      );
      const session = updateSessionSchedule(sessionId, {
        scheduledStart,
        durationMinutes,
      });
      return NextResponse.json({
        session,
        sessions: listSessionSummaries(),
        room: buildRoomState(sessionId),
      });
    }

    if (action === "delete") {
      const sessionId = Number(body?.sessionId);
      if (!sessionId) {
        return NextResponse.json({ error: "缺少场次 ID" }, { status: 400 });
      }
      const existing = getSessionById(sessionId);
      if (!existing) {
        return NextResponse.json({ error: "场次不存在" }, { status: 404 });
      }
      if (existing.status === "live" || existing.status === "ended") {
        return NextResponse.json(
          { error: "进行中或已完成的场次不可删除，仅作记录保留" },
          { status: 400 },
        );
      }
      const ok = deleteAuctionSession(sessionId);
      if (!ok) {
        return NextResponse.json({ error: "删除失败" }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        sessions: listSessionSummaries(),
        room: buildRoomState(),
      });
    }

    const sessionId = Number(body?.sessionId);
    let session = sessionId ? getSessionById(sessionId) : null;

    if (action === "start") {
      if (!session) {
        return NextResponse.json({ error: "场次不存在" }, { status: 404 });
      }
      if (session.status === "ended") {
        return NextResponse.json({ error: "已完成场次不可开始" }, { status: 400 });
      }
      if (session.status === "live") {
        return NextResponse.json({
          session,
          sessions: listSessionSummaries(),
          room: buildRoomState(session.id),
        });
      }
      session = startAuctionSession(session.id, { forceNow: true });
    } else if (action === "next") {
      if (!session || session.status !== "live") {
        return NextResponse.json({ error: "没有进行中的拍卖" }, { status: 400 });
      }
      session = advanceAuction(session.id);
    } else if (action === "end") {
      if (!session) {
        return NextResponse.json({ error: "没有可结束的场次" }, { status: 400 });
      }
      if (session.status !== "live") {
        return NextResponse.json(
          { error: "只能结束进行中的拍卖" },
          { status: 400 },
        );
      }
      session = endAuctionSession(session.id);
    } else {
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    return NextResponse.json({
      session,
      sessions: listSessionSummaries(),
      room: buildRoomState(session.id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 },
    );
  }
}
