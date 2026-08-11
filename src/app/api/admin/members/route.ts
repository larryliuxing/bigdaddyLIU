import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import {
  createMember,
  deleteMember,
  listMembers,
  resetMemberPassword,
  updateMember,
} from "@/lib/db";
import type { MemberRole } from "@/lib/types";

export const runtime = "nodejs";

const ROLES: MemberRole[] = ["normal", "officer", "leader"];

function isRole(value: unknown): value is MemberRole {
  return typeof value === "string" && ROLES.includes(value as MemberRole);
}

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  return NextResponse.json({ members: listMembers() });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const role = isRole(body?.role) ? body.role : "normal";

  if (!name) {
    return NextResponse.json({ error: "请输入成员名称" }, { status: 400 });
  }

  try {
    const member = createMember(name, role);
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

  const data: { name?: string; role?: MemberRole } = {};
  if (typeof body?.name === "string") data.name = body.name;
  if (isRole(body?.role)) data.role = body.role;

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

  const ok = deleteMember(id);
  if (!ok) {
    return NextResponse.json({ error: "成员不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
