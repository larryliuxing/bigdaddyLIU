import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import {
  claimMemberPassword,
  getMemberById,
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
  if (member.status === "exited") {
    return NextResponse.json(
      { error: "该成员已清退，无法登录" },
      { status: 403 },
    );
  }

  if (!member.password_hash) {
    const claimed = claimMemberPassword(memberId, password);
    if (!claimed) {
      // Another request set the password first — verify instead
      if (!verifyMemberPassword(memberId, password)) {
        return NextResponse.json(
          { error: "该身份刚被设置密码，请使用正确密码登录" },
          { status: 401 },
        );
      }
    }
  } else if (!verifyMemberPassword(memberId, password)) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const fresh = getMemberById(memberId)!;
  const response = NextResponse.json({
    ok: true,
    user: {
      id: fresh.id,
      name: fresh.name,
      role: fresh.role,
    },
  });

  await attachSessionCookie(
    response,
    {
      type: "member",
      id: fresh.id,
      name: fresh.name,
      role: fresh.role,
    },
    request,
  );

  return response;
}
