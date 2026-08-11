import { NextResponse } from "next/server";
import { clearAdminSessionCookie, clearMemberSessionCookie, getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const scope = String(body?.scope ?? "all");

  if (scope === "admin") {
    await clearAdminSessionCookie();
  } else if (scope === "member") {
    await clearMemberSessionCookie();
  } else {
    await clearAdminSessionCookie();
    await clearMemberSessionCookie();
  }

  return NextResponse.json({ ok: true, user: await getSession() });
}
