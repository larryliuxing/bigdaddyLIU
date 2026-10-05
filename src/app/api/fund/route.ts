import { NextResponse } from "next/server";
import { getAdminSession, getMemberSession } from "@/lib/auth";
import { getGuildFund, setGuildFund } from "@/lib/db";
import { parseFundAmount } from "@/lib/fund";

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

export async function PUT(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const amount = parseFundAmount(body?.amount);
  if (amount == null) {
    return NextResponse.json(
      { error: "请输入有效金额，例如 1234567 或 100万" },
      { status: 400 },
    );
  }
  const fund = setGuildFund(amount, admin.username);
  return NextResponse.json({ ok: true, fund, canEdit: true });
}
