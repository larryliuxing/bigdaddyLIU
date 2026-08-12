import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  calculateDividends,
  getAuctionSettings,
  getDividendReport,
  getLatestSession,
  getSessionById,
  listDividends,
  listSessions,
  setItemDividendMembers,
  updateAuctionSettings,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";

export const runtime = "nodejs";

function resolveTargetSession(bodySessionId?: unknown) {
  const id = Number(bodySessionId);
  if (Number.isFinite(id) && id > 0) {
    return getSessionById(id);
  }
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

  const report = session ? getDividendReport(session.id) : null;
  return NextResponse.json({
    sessions: listSessions(),
    session,
    settings: getAuctionSettings(),
    dividends: session ? listDividends(session.id) : [],
    report,
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

  try {
    if (action === "setTaxRate") {
      const taxPercent = Number(body?.taxPercent ?? body?.taxRate);
      const taxRate =
        body?.taxRate != null && Number(body.taxRate) <= 1
          ? Number(body.taxRate)
          : taxPercent / 100;
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 0.5) {
        return NextResponse.json(
          { error: "税率需在 0%–50% 之间" },
          { status: 400 },
        );
      }
      const settings = updateAuctionSettings({ taxRate });
      return NextResponse.json({ settings });
    }

    const session = resolveTargetSession(body?.sessionId);
    if (!session) {
      return NextResponse.json({ error: "暂无场次" }, { status: 400 });
    }

    if (action === "calculate") {
      const taxPercent =
        body?.taxPercent != null ? Number(body.taxPercent) : null;
      const taxRate =
        taxPercent != null && Number.isFinite(taxPercent)
          ? taxPercent / 100
          : body?.taxRate != null
            ? Number(body.taxRate)
            : undefined;
      const report = calculateDividends(session.id, taxRate);
      return NextResponse.json({
        report,
        dividends: report.totals,
        session,
        room: buildRoomState(session.id),
        settings: getAuctionSettings(),
      });
    }

    if (action === "setItemMembers") {
      const itemId = Number(body?.itemId);
      const memberIds = Array.isArray(body?.memberIds)
        ? body.memberIds.map(Number)
        : [];
      const report = setItemDividendMembers(itemId, memberIds);
      return NextResponse.json({
        report,
        dividends: report.totals,
        room: buildRoomState(session.id),
      });
    }

    // Total-table temporary add/remove is intentionally unsupported.
    if (
      action === "addTemporary" ||
      action === "deleteTemporary" ||
      action === "updateAmount"
    ) {
      return NextResponse.json(
        { error: "综合总表不支持临时加人，请在单件拍品中增删分红成员" },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 },
    );
  }
}
