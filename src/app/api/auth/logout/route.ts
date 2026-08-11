import { NextResponse } from "next/server";
import {
  clearAdminCookieOnResponse,
  clearMemberCookieOnResponse,
  getAdminSession,
  getMemberSession,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const scope = String(body?.scope ?? "all");

  // Read current sessions from the incoming request cookies first
  const memberSession = await getMemberSession();
  const adminSession = await getAdminSession();

  let member = memberSession
    ? {
        id: memberSession.id,
        name: memberSession.name,
        role: memberSession.role,
      }
    : null;
  let admin = adminSession ? { username: adminSession.username } : null;

  const response = NextResponse.json({ ok: true });

  if (scope === "admin" || scope === "all") {
    clearAdminCookieOnResponse(response);
    admin = null;
  }
  if (scope === "member" || scope === "all") {
    clearMemberCookieOnResponse(response);
    member = null;
  }

  const finalResponse = NextResponse.json({
    ok: true,
    member,
    admin,
    user: member ?? admin,
  });

  // Preserve Set-Cookie headers from the clear operations
  for (const cookie of response.cookies.getAll()) {
    finalResponse.cookies.set(cookie);
  }

  return finalResponse;
}
