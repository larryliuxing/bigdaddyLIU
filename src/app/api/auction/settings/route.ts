import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  getAuctionSettings,
  getOrCreateEditableSession,
  updateAuctionSettings,
  updateSessionSchedule,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    settings: getAuctionSettings(),
    room: buildRoomState(),
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "无效请求" }, { status: 400 });
  }

  if (body.defaultStartTime || body.durationMinutes || body.bidExtensionSeconds) {
    updateAuctionSettings({
      defaultStartTime: body.defaultStartTime,
      durationMinutes: body.durationMinutes
        ? Number(body.durationMinutes)
        : undefined,
      bidExtensionSeconds: body.bidExtensionSeconds
        ? Number(body.bidExtensionSeconds)
        : undefined,
    });
  }

  if ("scheduledStart" in body || "sessionDurationMinutes" in body) {
    const session = getOrCreateEditableSession();
    if (session.status === "live" || session.status === "ended") {
      return NextResponse.json(
        { error: "进行中或已结束的场次不可改时间，请新建场次" },
        { status: 400 },
      );
    }
    updateSessionSchedule(session.id, {
      scheduledStart: body.scheduledStart ?? session.scheduledStart,
      durationMinutes: body.sessionDurationMinutes
        ? Number(body.sessionDurationMinutes)
        : session.durationMinutes,
      note: body.note,
    });
  }

  return NextResponse.json({
    settings: getAuctionSettings(),
    room: buildRoomState(),
  });
}
