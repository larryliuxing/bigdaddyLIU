import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createAuctionItem,
  createDraftSession,
  deleteAuctionItem,
  getLatestSession,
  getOrCreateEditableSession,
  getSessionById,
  listItems,
} from "@/lib/db";
import type { ItemQuality } from "@/lib/types";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

const QUALITIES: ItemQuality[] = [
  "white",
  "green",
  "blue",
  "purple",
  "orange",
  "pink",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = Number(searchParams.get("sessionId"));
  const session = sessionId
    ? getSessionById(sessionId)
    : getLatestSession();

  return NextResponse.json({
    session,
    items: session ? listItems(session.id) : [],
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const quality = QUALITIES.includes(body?.quality) ? body.quality : "green";
  const startPrice = Number(body?.startPrice ?? 5);
  const bidIncrement = Number(body?.bidIncrement ?? 5);
  const imageData =
    typeof body?.imageData === "string" ? body.imageData : null;
  const dividendMemberIds = Array.isArray(body?.dividendMemberIds)
    ? body.dividendMemberIds.map(Number).filter(Boolean)
    : [];

  if (!name) {
    return NextResponse.json({ error: "请填写拍品名称" }, { status: 400 });
  }
  if (!(startPrice > 0) || !(bidIncrement > 0)) {
    return NextResponse.json({ error: "价格必须大于 0" }, { status: 400 });
  }
  if (dividendMemberIds.length === 0) {
    return NextResponse.json(
      { error: "请至少选择一名分红成员" },
      { status: 400 },
    );
  }

  let session = getOrCreateEditableSession();
  if (session.status === "ended") {
    session = createDraftSession();
  }
  if (session.status === "live") {
    // Allow adding only before/during draft; during live usually not
    // For flexibility, block during live
    return NextResponse.json(
      { error: "拍卖进行中，请结束后再添加拍品到新场次" },
      { status: 400 },
    );
  }

  const item = createAuctionItem({
    sessionId: session.id,
    name,
    quality,
    startPrice,
    bidIncrement,
    imageData,
    dividendMemberIds,
  });

  return NextResponse.json({ item, room: buildRoomState() }, { status: 201 });
}

export async function DELETE(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "缺少拍品 ID" }, { status: 400 });
  }

  const ok = deleteAuctionItem(id);
  if (!ok) {
    return NextResponse.json(
      { error: "无法删除（拍品不存在或已开始）" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, room: buildRoomState() });
}
