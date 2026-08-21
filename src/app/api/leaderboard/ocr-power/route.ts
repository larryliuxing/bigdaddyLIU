import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";
import { recognizePowerViaServer } from "@/lib/leaderboard/serverPowerOcr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const imageData = typeof body?.imageData === "string" ? body.imageData : "";
  if (!imageData || imageData.length < 32) {
    return NextResponse.json({ error: "缺少截图数据" }, { status: 400 });
  }
  if (imageData.length > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "截图过大" }, { status: 400 });
  }

  const result = await recognizePowerViaServer(imageData);
  if (!result.ok || result.combatPower == null) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error || "识别失败",
        powerTopText: result.powerTopText,
        text: result.text,
        ms: result.ms,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    combatPower: result.combatPower,
    powerTop: result.powerTop,
    powerTopText: result.powerTopText,
    text: result.text,
    ms: result.ms,
  });
}
