import { NextResponse } from "next/server";
import {
  getAdminSession,
  getMemberSession,
  requireAdminSession,
} from "@/lib/auth";
import {
  createBoss,
  deleteBoss,
  getBossRoomState,
  listBosses,
  touchBossPresence,
  updateBoss,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const member = await getMemberSession();
  if (member) {
    touchBossPresence(member.id, member.name);
  }
  return NextResponse.json({
    room: getBossRoomState(),
    allBosses: (await getAdminSession()) ? listBosses(true) : undefined,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "请填写 BOSS 名称" }, { status: 400 });
  }

  try {
    const boss = createBoss({
      name,
      color: body?.color,
      spawnRate: body?.spawnRate ? Number(body.spawnRate) : undefined,
      intervalHours: body?.intervalHours
        ? Number(body.intervalHours)
        : undefined,
      dropsNote: body?.dropsNote,
    });
    return NextResponse.json(
      { boss, room: getBossRoomState(), allBosses: listBosses(true) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "BOSS 名称已存在" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ error: "缺少 BOSS ID" }, { status: 400 });
  }

  try {
    const boss = updateBoss(id, {
      name: body?.name,
      color: body?.color,
      spawnRate:
        body?.spawnRate !== undefined ? Number(body.spawnRate) : undefined,
      intervalHours:
        body?.intervalHours !== undefined
          ? Number(body.intervalHours)
          : undefined,
      dropsNote: body?.dropsNote,
      enabled: body?.enabled,
      lastKillAt: body?.lastKillAt,
      nextSpawnAt: body?.nextSpawnAt,
    });
    if (!boss) {
      return NextResponse.json({ error: "BOSS 不存在" }, { status: 404 });
    }
    return NextResponse.json({
      boss,
      room: getBossRoomState(),
      allBosses: listBosses(true),
    });
  } catch {
    return NextResponse.json({ error: "更新失败（名称可能重复）" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "缺少 BOSS ID" }, { status: 400 });
  }
  const ok = deleteBoss(id);
  if (!ok) {
    return NextResponse.json({ error: "BOSS 不存在" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    room: getBossRoomState(),
    allBosses: listBosses(true),
  });
}
