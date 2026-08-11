import { NextResponse } from "next/server";
import { listMembers } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const members = listMembers();
  return NextResponse.json({ members });
}
