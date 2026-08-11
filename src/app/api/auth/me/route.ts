import { NextResponse } from "next/server";
import { getAdminSession, getMemberSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    return NextResponse.json({ user: null, admin: null }, { status: 401 });
  }
  return NextResponse.json({ user: member, admin });
}
