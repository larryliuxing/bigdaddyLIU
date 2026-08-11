import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  advanceAuction,
  createDraftSession,
  endAuctionSession,
  getLatestSession,
  getOrCreateEditableSession,
  startAuctionSession,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ room: buildRoomState() });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  try {
    let session = getLatestSession();

    if (action === "create") {
      session = createDraftSession({
        scheduledStart: body?.scheduledStart ?? null,
        durationMinutes: body?.durationMinutes
          ? Number(body.durationMinutes)
          : undefined,
      });
    } else if (action === "start") {
      session = getOrCreateEditableSession();
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
      session = endAuctionSession(session.id);
    } else {
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    return NextResponse.json({ session, room: buildRoomState(session.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 },
    );
  }
}
