import { NextResponse } from "next/server";
import { getAdminSession, getMemberSession } from "@/lib/auth";
import {
  addGuildFundEntry,
  deleteGuildFundEntry,
  getGuildFund,
} from "@/lib/db";
import { parseFundDeposit, parseFundTransferredAt } from "@/lib/fund";

export const runtime = "nodejs";

export async function GET() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  return NextResponse.json({
    fund: getGuildFund(),
    canEdit: Boolean(admin),
  });
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const amount = parseFundDeposit(body?.amount);
  if (amount == null) {
    return NextResponse.json(
      { error: "请输入转入金额，例如 1234567 或 100万" },
      { status: 400 },
    );
  }
  const transferredAt = parseFundTransferredAt(body?.transferredAt);
  if (!transferredAt) {
    return NextResponse.json(
      { error: "请填写这次转入的时间" },
      { status: 400 },
    );
  }
  try {
    const fund = addGuildFundEntry({
      amount,
      transferredAt,
      createdBy: admin.username,
    });
    return NextResponse.json({ ok: true, fund, canEdit: true });
  } catch {
    return NextResponse.json({ error: "记入失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!(id > 0)) {
    return NextResponse.json({ error: "缺少明细" }, { status: 400 });
  }
  const fund = deleteGuildFundEntry(id);
  if (!fund) {
    return NextResponse.json({ error: "这条明细不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, fund, canEdit: true });
}
