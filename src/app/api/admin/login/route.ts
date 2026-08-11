import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth";
import { verifyAdmin } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "请输入管理员账号和密码" },
      { status: 400 },
    );
  }

  const admin = verifyAdmin(username, password);
  if (!admin) {
    return NextResponse.json(
      { error: "管理员账号或密码错误" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: { type: "admin", username: admin.username },
  });

  await attachSessionCookie(
    response,
    {
      type: "admin",
      username: admin.username,
    },
    request,
  );

  return response;
}
