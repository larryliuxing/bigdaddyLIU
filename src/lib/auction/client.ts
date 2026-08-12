"use client";

import { createWorker } from "tesseract.js";

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("chi_sim+eng");
  }
  return workerPromise;
}

export async function recognizeImageText(image: string | File | Blob) {
  const worker = await getWorker();
  const result = await worker.recognize(image);
  return result.data.text || "";
}

export const QUALITY_OPTIONS = [
  { value: "white", label: "白色", color: "#d1d5db" },
  { value: "green", label: "绿色", color: "#4ade80" },
  { value: "blue", label: "蓝色", color: "#60a5fa" },
  { value: "purple", label: "紫色", color: "#c084fc" },
  { value: "orange", label: "橙色", color: "#fb923c" },
  { value: "pink", label: "粉色", color: "#f472b6" },
] as const;

export function qualityMeta(quality: string) {
  return (
    QUALITY_OPTIONS.find((q) => q.value === quality) ?? QUALITY_OPTIONS[1]
  );
}

export function formatCountdown(totalSeconds: number | null) {
  if (totalSeconds == null) return "--:--";
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const BEIJING_TZ = "Asia/Shanghai";

/** Today's calendar date in Beijing as YYYY-MM-DD. */
export function beijingTodayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** HH:MM from an ISO timestamp, interpreted in Beijing time. */
export function beijingHmFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BEIJING_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Format ISO timestamp for display in Beijing time. */
export function formatBeijingDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", {
    timeZone: BEIJING_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Build an ISO timestamp for today (Beijing) at HH:MM Beijing time.
 * Always uses Asia/Shanghai regardless of the browser/server local zone.
 */
export function todayAtTime(hhmm: string) {
  const parts = hhmm.split(":").map(Number);
  const hh = Number.isFinite(parts[0]) ? parts[0] : 15;
  const mm = Number.isFinite(parts[1]) ? parts[1] : 0;
  const datePart = beijingTodayDate();
  const local = `${datePart}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
}
