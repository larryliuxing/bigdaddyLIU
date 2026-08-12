import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createMember,
  listMembers,
  markMemberExited,
  resetMemberPassword,
  restoreMember,
  updateMember,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  return NextResponse.json({
    members: listMembers({ includeExited: true }),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "请输入成员名称" }, { status: 400 });
  }

  try {
    const member = createMember(name);
    return NextResponse.json({ member }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "成员名称已存在" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  }

  if (body?.action === "resetPassword") {
    const ok = resetMemberPassword(id);
    if (!ok) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "restore") {
    const ok = restoreMember(id);
    if (!ok) {
      return NextResponse.json(
        { error: "成员不存在或未清退" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const data: { name?: string } = {};
  if (typeof body?.name === "string") data.name = body.name;

  try {
    const member = updateMember(id, data);
    if (!member) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch {
    return NextResponse.json({ error: "成员名称已存在" }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "缺少成员 ID" }, { status: 400 });
  }

  try {
    const ok = markMemberExited(id);
    if (!ok) {
      return NextResponse.json(
        { error: "成员不存在或已清退" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/members DELETE]", id, message);
    return NextResponse.json(
      { error: "标记清退失败，请稍后重试" },
      { status: 500 },
    );
  }
}
