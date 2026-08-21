import { extractCombatPower } from "@/lib/leaderboard/parse";

const OCR_URL =
  process.env.GUILD_OCR_URL?.trim() || "http://127.0.0.1:8765/ocr/power";

export type ServerPowerOcrResult = {
  ok: boolean;
  combatPower: number | null;
  powerTop: number | null;
  powerTopText: string;
  text: string;
  ms?: number;
  error?: string;
};

/**
 * Call the local PP-OCR service for top-left combat power.
 */
export async function recognizePowerViaServer(
  imageData: string,
): Promise<ServerPowerOcrResult> {
  let res: Response;
  try {
    res = await fetch(OCR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return {
      ok: false,
      combatPower: null,
      powerTop: null,
      powerTopText: "",
      text: "",
      error: "战力识别服务未启动，请联系管理员检查 guild-ocr",
    };
  }

  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    text?: string;
    lines?: string[];
    ms?: number;
    error?: string;
  } | null;

  if (!res.ok || !data) {
    return {
      ok: false,
      combatPower: null,
      powerTop: null,
      powerTopText: "",
      text: "",
      error: data?.error || "战力识别服务异常",
    };
  }

  const text = String(data.text || (data.lines || []).join("\n"));
  const combatPower = extractCombatPower(text);
  if (combatPower == null) {
    return {
      ok: false,
      combatPower: null,
      powerTop: null,
      powerTopText: text,
      text,
      ms: data.ms,
      error: "未识别到左上角战力数字，请截取包含左上战力的完整界面",
    };
  }

  return {
    ok: true,
    combatPower,
    powerTop: combatPower,
    powerTopText: text,
    text,
    ms: data.ms,
  };
}
