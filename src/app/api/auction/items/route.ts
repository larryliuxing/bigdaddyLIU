import { NextResponse } from "next/server";
import {
  getAdminSession,
  getMemberSession,
  requireAdminSession,
} from "@/lib/auth";
import {
  createAuctionItem,
  deleteAuctionItem,
  getItemById,
  getLatestSession,
  getOrCreateEditableSession,
  getSessionById,
  listItems,
  mapPriceStatsByNames,
  normalizeItemNameKey,
  updateAuctionItem,
} from "@/lib/db";
import type { ItemQuality } from "@/lib/types";
import {
  readJsonBodyCapped,
  sanitizeAuctionItemImage,
} from "@/lib/auction/itemImage";
import { isPinkAuction, isParticipantOnlyAuction } from "@/lib/auction/pink";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

const QUALITIES: ItemQuality[] = [
  "white",
  "green",
  "blue",
  "purple",
  "orange",
  "pink",
  "special_pink",
];

export async function GET(request: Request) {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = Number(searchParams.get("sessionId"));
  const session = sessionId
    ? getSessionById(sessionId)
    : getLatestSession();

  const items = session ? listItems(session.id, { includeImages: false }) : [];
  const statsMap = mapPriceStatsByNames(items.map((i) => i.name));
  const withStats = items.map((item) => ({
    ...item,
    priceStats: statsMap.get(normalizeItemNameKey(item.name)) ?? null,
  }));

  return NextResponse.json({
    session,
    items: withStats,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const parsed = await readJsonBodyCapped(request);
  if (parsed.tooLarge) {
    return NextResponse.json(
      { error: "拍品图片太大，已阻止以免卡住服务器。请重新粘贴后再添加" },
      { status: 413 },
    );
  }
  const body = (parsed.body ?? null) as Record<string, unknown> | null;
  const name = String(body?.name ?? "").trim();
  const quality = QUALITIES.includes(body?.quality as ItemQuality)
    ? (body?.quality as ItemQuality)
    : "green";
  const startPrice = Number(body?.startPrice ?? 5);
  const bidIncrement = Number(body?.bidIncrement ?? 5);
  const bidMin =
    body?.bidMin != null && body?.bidMin !== "" ? Number(body.bidMin) : null;
  const bidMax =
    body?.bidMax != null && body?.bidMax !== "" ? Number(body.bidMax) : null;
  const imageData = sanitizeAuctionItemImage(body?.imageData);
  const dividendMemberIds = Array.isArray(body?.dividendMemberIds)
    ? body.dividendMemberIds.map(Number).filter(Boolean)
    : [];
  const requestedSessionId = Number(body?.sessionId);

  if (!name) {
    return NextResponse.json({ error: "请填写拍品名称" }, { status: 400 });
  }
  if (isPinkAuction(quality)) {
    if (!(bidMin != null && bidMin > 0) || !(bidMax != null && bidMax > 0)) {
      return NextResponse.json(
        { error: "特殊粉色请填写低限价和高限价" },
        { status: 400 },
      );
    }
    if (bidMax <= bidMin) {
      return NextResponse.json(
        { error: "高限价必须大于低限价" },
        { status: 400 },
      );
    }
    if (dividendMemberIds.length < 2) {
      return NextResponse.json(
        { error: "特殊粉色至少选择 2 名参与者（可出价、投票）" },
        { status: 400 },
      );
    }
  }
  if (!(startPrice > 0) || !(bidIncrement > 0)) {
    return NextResponse.json({ error: "价格必须大于 0" }, { status: 400 });
  }
  if (dividendMemberIds.length === 0) {
    return NextResponse.json(
      {
        error: isParticipantOnlyAuction(quality)
          ? "请至少选择一名参与者"
          : "请至少选择一名分红成员",
      },
      { status: 400 },
    );
  }

  let session =
    Number.isFinite(requestedSessionId) && requestedSessionId > 0
      ? getSessionById(requestedSessionId)
      : getOrCreateEditableSession();

  if (!session) {
    return NextResponse.json({ error: "场次不存在" }, { status: 404 });
  }
  if (session.status === "ended") {
    return NextResponse.json(
      { error: "已完成场次不可添加拍品" },
      { status: 400 },
    );
  }
  if (session.status === "live") {
    return NextResponse.json(
      { error: "进行中的场次不可添加拍品" },
      { status: 400 },
    );
  }

  try {
    const item = createAuctionItem({
      sessionId: session.id,
      name,
      quality,
      startPrice,
      bidIncrement,
      imageData,
      dividendMemberIds,
      bidMin: isPinkAuction(quality) ? bidMin : null,
      bidMax: isPinkAuction(quality) ? bidMax : null,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "添加失败";
    return NextResponse.json(
      { error: message.includes("UNIQUE") ? "分红成员重复，请刷新后重试" : "添加拍品失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const parsed = await readJsonBodyCapped(request);
  if (parsed.tooLarge) {
    return NextResponse.json({ error: "请求过大" }, { status: 413 });
  }
  const body = (parsed.body ?? null) as Record<string, unknown> | null;
  const id = Number(body?.id ?? new URL(request.url).searchParams.get("id"));
  const existing = id ? getItemById(id) : null;
  if (!existing) {
    return NextResponse.json({ error: "拍品不存在" }, { status: 404 });
  }

  const name = String(body?.name ?? existing.name).trim();
  const quality = QUALITIES.includes(body?.quality as ItemQuality)
    ? (body?.quality as ItemQuality)
    : existing.quality;
  const startPrice = Number(body?.startPrice ?? existing.startPrice);
  const bidIncrement = Number(body?.bidIncrement ?? existing.bidIncrement);
  const bidMin =
    body?.bidMin != null && body?.bidMin !== ""
      ? Number(body.bidMin)
      : existing.bidMin;
  const bidMax =
    body?.bidMax != null && body?.bidMax !== ""
      ? Number(body.bidMax)
      : existing.bidMax;
  const dividendMemberIds = Array.isArray(body?.dividendMemberIds)
    ? body.dividendMemberIds.map(Number).filter(Boolean)
    : existing.dividendMemberIds;

  if (!name) {
    return NextResponse.json({ error: "请填写拍品名称" }, { status: 400 });
  }
  if (isPinkAuction(quality)) {
    if (!(bidMin != null && bidMin > 0) || !(bidMax != null && bidMax > 0)) {
      return NextResponse.json(
        { error: "特殊粉色请填写低限价和高限价" },
        { status: 400 },
      );
    }
    if (bidMax <= bidMin) {
      return NextResponse.json(
        { error: "高限价必须大于低限价" },
        { status: 400 },
      );
    }
    if (dividendMemberIds.length < 2) {
      return NextResponse.json(
        { error: "特殊粉色至少选择 2 名参与者（可出价、投票）" },
        { status: 400 },
      );
    }
  }
  if (!(startPrice > 0) || !(bidIncrement > 0)) {
    return NextResponse.json({ error: "价格必须大于 0" }, { status: 400 });
  }
  if (dividendMemberIds.length === 0) {
    return NextResponse.json(
      {
        error: isParticipantOnlyAuction(quality)
          ? "请至少选择一名参与者"
          : "请至少选择一名分红成员",
      },
      { status: 400 },
    );
  }

  const item = updateAuctionItem({
    itemId: existing.id,
    name,
    quality,
    startPrice,
    bidIncrement,
    bidMin: isPinkAuction(quality) ? bidMin : null,
    bidMax: isPinkAuction(quality) ? bidMax : null,
    dividendMemberIds,
  });
  if (!item) {
    return NextResponse.json(
      { error: "无法修改（拍品已开始或场次已结束）" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    item,
    room: buildRoomState(item.sessionId, { lite: true, includeDividends: true }),
  });
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
  const itemSessionId = Number(searchParams.get("sessionId"));
  return NextResponse.json({
    ok: true,
    room: buildRoomState(
      Number.isFinite(itemSessionId) && itemSessionId > 0
        ? itemSessionId
        : undefined,
      { lite: true },
    ),
  });
}
