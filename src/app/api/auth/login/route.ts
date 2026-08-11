import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import {
  getMemberById,
  setMemberPassword,
  verifyMemberPassword,
} from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const memberId = Number(body?.memberId);
  const password = String(body?.password ?? "");

  if (!memberId || !password) {
    return NextResponse.json(
      { error: "请选择身份并输入密码" },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "密码至少需要 6 位" },
      { status: 400 },
    );
  }

  const member = getMemberById(memberId);
  if (!member) {
    return NextResponse.json({ error: "身份不存在" }, { status: 404 });
  }

  if (!member.password_hash) {
    setMemberPassword(memberId, password);
  } else if (!verifyMemberPassword(memberId, password)) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  await setSessionCookie({
    type: "member",
    id: member.id,
    name: member.name,
    role: member.role,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: member.id,
      name: member.name,
      role: member.role,
    },
  });
}
