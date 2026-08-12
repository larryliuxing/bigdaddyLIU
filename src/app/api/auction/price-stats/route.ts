import { NextResponse } from "next/server";
import {
  getItemPriceStats,
  listItemSaleHistory,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = String(searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "缺少拍品名称" }, { status: 400 });
  }

  const stats = getItemPriceStats(name);
  const history = listItemSaleHistory(name, 12);
  return NextResponse.json({ stats, history });
}
