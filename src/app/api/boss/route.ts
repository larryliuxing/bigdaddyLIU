import { NextResponse } from "next/server";
import {
  getAdminSession,
  getMemberSession,
  requireAdminSession,
} from "@/lib/auth";
import {
  createBoss,
  deleteBoss,
  getBossDrops,
  getBossRoomState,
  listBosses,
  touchBossPresence,
  updateBoss,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dropsId = Number(searchParams.get("dropsId"));
  const full = searchParams.get("full") === "1";

  // On-demand drops image — keeps live polls light
  if (Number.isFinite(dropsId) && dropsId > 0) {
    const member = await getMemberSession();
    const admin = await getAdminSession();
    if (!member && !admin) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const drops = getBossDrops(dropsId);
    if (!drops) {
      return NextResponse.json({ error: "BOSS 不存在" }, { status: 404 });
    }
    return NextResponse.json(drops);
  }

  const member = await getMemberSession();
  if (member) {
    touchBossPresence(member.id, member.name);
  }

  const admin = await getAdminSession();
  // Default lite room (no base64 images). Admin settings page uses ?full=1.
  return NextResponse.json({
    room: getBossRoomState({ includeImages: full }),
    allBosses: admin
      ? listBosses(true, { includeImages: full })
      : undefined,
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
    const spawnRate =
      body?.spawnRate !== undefined && body?.spawnRate !== null
        ? Number(body.spawnRate)
        : undefined;
    const intervalHours =
      body?.intervalHours !== undefined && body?.intervalHours !== null
        ? Number(body.intervalHours)
        : undefined;
    if (
      (spawnRate !== undefined && Number.isNaN(spawnRate)) ||
      (intervalHours !== undefined && Number.isNaN(intervalHours))
    ) {
      return NextResponse.json({ error: "数值无效" }, { status: 400 });
    }

    const boss = createBoss({
      name,
      color: body?.color,
      spawnRate,
      intervalHours,
      dropsNote: body?.dropsNote,
      dropsImage:
        typeof body?.dropsImage === "string" ? body.dropsImage : null,
    });
    return NextResponse.json(
      {
        boss,
        room: getBossRoomState({ includeImages: false }),
        allBosses: listBosses(true, { includeImages: true }),
      },
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
      dropsImage:
        body?.dropsImage === undefined
          ? undefined
          : body.dropsImage === null
            ? null
            : String(body.dropsImage),
      enabled: body?.enabled,
      lastKillAt: body?.lastKillAt,
      nextSpawnAt: body?.nextSpawnAt,
    });
    if (!boss) {
      return NextResponse.json({ error: "BOSS 不存在" }, { status: 404 });
    }
    return NextResponse.json({
      boss,
      room: getBossRoomState({ includeImages: false }),
      allBosses: listBosses(true, { includeImages: true }),
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
    room: getBossRoomState({ includeImages: false }),
    allBosses: listBosses(true, { includeImages: true }),
  });
}
