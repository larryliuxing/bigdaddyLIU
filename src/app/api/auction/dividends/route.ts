import { NextResponse } from "next/server";
import { getAdminSession, getMemberSession, requireAdminSession } from "@/lib/auth";
import {
  calculateDividends,
  getDividendReport,
  getLatestSession,
  getSessionById,
  listSessions,
  setItemDividendMembers,
  updateSessionTaxRate,
} from "@/lib/db";
import { buildRoomState } from "@/lib/auction/room";
import { parseAuctionTaxPercent } from "@/lib/auction/tax";

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
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessions = listSessions();
  const sessionIdParam = searchParams.get("sessionId");
  if (sessionIdParam == null) {
    return NextResponse.json({ sessions });
  }

  const sessionId = Number(sessionIdParam);
  const session = sessionId
    ? (sessions.find((s) => s.id === sessionId) ?? null)
    : null;
  const report = session ? getDividendReport(session.id) : null;
  return NextResponse.json({
    sessions,
    session,
    report,
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
    const session = resolveTargetSession(body?.sessionId);
    if (!session) {
      return NextResponse.json({ error: "暂无场次" }, { status: 400 });
    }

    if (action === "setTaxRate") {
      const taxRate = parseAuctionTaxPercent(body?.taxPercent);
      if (taxRate == null) {
        return NextResponse.json(
          { error: "税率需在 0%–10% 之间" },
          { status: 400 },
        );
      }
      if (session.status === "ended") {
        const report = calculateDividends(session.id, taxRate);
        return NextResponse.json({
          session: report.session,
          report,
          room: buildRoomState(session.id, { lite: true }),
        });
      }
      const updated = updateSessionTaxRate(session.id, taxRate);
      return NextResponse.json({
        session: updated,
        report: getDividendReport(session.id),
        room: buildRoomState(session.id, { lite: true }),
      });
    }

    if (action === "calculate") {
      const taxRate =
        body?.taxPercent == null
          ? session.taxRate
          : parseAuctionTaxPercent(body.taxPercent);
      if (taxRate == null) {
        return NextResponse.json(
          { error: "税率需在 0%–10% 之间" },
          { status: 400 },
        );
      }
      const report = calculateDividends(session.id, taxRate);
      return NextResponse.json({
        report,
        dividends: report.totals,
        session,
        room: buildRoomState(session.id, { lite: true }),
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
        room: buildRoomState(session.id, { lite: true }),
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
