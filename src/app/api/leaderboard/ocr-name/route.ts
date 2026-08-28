import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_IMAGE_CHARS = 3_500_000;

function runHudNameOcr(payload: { image?: string; images?: string[] }) {
  const script = path.join(process.cwd(), "scripts/ocr_hud_name.py");
  return new Promise<{ text: string; error?: string }>((resolve) => {
    const child = spawn("python3", [script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 20_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ text: "" });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout || "{}") as {
          text?: string;
          error?: string;
        };
        resolve({
          text: String(parsed.text ?? "").trim(),
          error: parsed.error,
        });
      } catch {
        resolve({ text: "", error: stderr.slice(0, 200) || "ocr-parse" });
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function POST(request: Request) {
  const member = await requireMemberSession();
  if (!member) {
    return NextResponse.json({ error: "请先选择身份登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const image = typeof body?.image === "string" ? body.image : "";
  const extra = Array.isArray(body?.images)
    ? body.images.filter((v: unknown) => typeof v === "string")
    : [];
  const images = [image, ...extra].filter(
    (v: string) => v.startsWith("data:image/") && v.length < MAX_IMAGE_CHARS,
  );
  if (!images.length) {
    return NextResponse.json({ text: "" });
  }

  const result = await runHudNameOcr({ image: images[0], images: images.slice(1) });
  return NextResponse.json({ text: result.text || "" });
}
