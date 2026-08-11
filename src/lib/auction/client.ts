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

export function todayAtTime(hhmm: string) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(hh || 15, mm || 0, 0, 0);
  return d.toISOString();
}
