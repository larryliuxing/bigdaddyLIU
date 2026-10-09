import { NextResponse } from "next/server";
import {
  getAdminSession,
  getMemberSession,
  requireAdminSession,
} from "@/lib/auth";
import {
  getItemById,
  readAuctionItemImage,
  writeAuctionItemImageFile,
} from "@/lib/db";
import {
  readJsonBodyCapped,
  sanitizeAuctionItemImage,
} from "@/lib/auction/itemImage";

export const runtime = "nodejs";

function decodeStoredImage(raw: string): { mime: string; body: Buffer } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/.exec(trimmed);
  if (dataUrl) {
    return {
      mime: dataUrl[1] || "image/jpeg",
      body: Buffer.from(dataUrl[2], "base64"),
    };
  }
  if (trimmed.startsWith("\x89PNG") || trimmed.startsWith("\xFF\xD8")) {
    return {
      mime: trimmed.startsWith("\x89PNG") ? "image/png" : "image/jpeg",
      body: Buffer.from(trimmed, "binary"),
    };
  }
  try {
    const body = Buffer.from(trimmed, "base64");
    if (body.length < 32) return null;
    const mime = body[0] === 0x89 ? "image/png" : "image/jpeg";
    return { mime, body };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const member = await getMemberSession();
  const admin = await getAdminSession();
  if (!member && !admin) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!(id > 0)) {
    return NextResponse.json({ error: "缺少拍品 ID" }, { status: 400 });
  }

  const stored = await readAuctionItemImage(id);
  if (!stored) {
    return new NextResponse(null, { status: 404 });
  }
  const decoded = decodeStoredImage(stored);
  if (!decoded) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(decoded.body), {
    headers: {
      "Content-Type": decoded.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function PUT(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "需要管理员登录" }, { status: 401 });
  }

  const parsed = await readJsonBodyCapped(request);
  if (parsed.tooLarge) {
    return NextResponse.json(
      { error: "拍品图片太大，拍品已添加，可稍后重新粘贴图片" },
      { status: 413 },
    );
  }
  const body = (parsed.body ?? null) as Record<string, unknown> | null;
  const id = Number(body?.id ?? new URL(request.url).searchParams.get("id"));
  if (!(id > 0)) {
    return NextResponse.json({ error: "缺少拍品 ID" }, { status: 400 });
  }

  const imageData = sanitizeAuctionItemImage(body?.imageData);
  if (!imageData) {
    return NextResponse.json(
      { error: "拍品图片无效或过大" },
      { status: 400 },
    );
  }
  if (!getItemById(id, { includeImages: false })) {
    return NextResponse.json({ error: "拍品不存在" }, { status: 404 });
  }

  await writeAuctionItemImageFile(id, imageData);
  const item = getItemById(id, { includeImages: false });
  if (!item) {
    return NextResponse.json({ error: "拍品不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}
