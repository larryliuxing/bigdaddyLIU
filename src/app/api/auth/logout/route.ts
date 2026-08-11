import { NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  clearMemberSessionCookie,
  getAdminSession,
  getMemberSession,
} from "@/lib/auth";

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

  const member = await getMemberSession();
  const admin = await getAdminSession();

  return NextResponse.json({
    ok: true,
    member: member
      ? { id: member.id, name: member.name, role: member.role }
      : null,
    admin: admin ? { username: admin.username } : null,
    user: member ?? admin,
  });
}
