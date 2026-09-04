import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createMember,
  listMembers,
  markMemberExited,
  renameMember,
  resetMemberPassword,
  restoreMember,
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
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "empty_name") {
      return NextResponse.json({ error: "请输入成员名称" }, { status: 400 });
    }
    if (code === "name_too_long") {
      return NextResponse.json(
        { error: "名字太长，最多 24 个字" },
        { status: 400 },
      );
    }
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

  if (body?.action === "rename" || typeof body?.name === "string") {
    try {
      const member = renameMember(id, String(body?.name ?? ""));
      if (!member) {
        return NextResponse.json({ error: "成员不存在" }, { status: 404 });
      }
      return NextResponse.json({ member });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "empty_name") {
        return NextResponse.json({ error: "请输入新名字" }, { status: 400 });
      }
      if (code === "name_too_long") {
        return NextResponse.json(
          { error: "名字太长，最多 24 个字" },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "成员名称已存在" }, { status: 409 });
    }
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
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
