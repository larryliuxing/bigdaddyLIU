"use client";

import { useEffect, useRef, useState } from "react";
import type { Boss } from "@/lib/types";
import { formatBeijingDateTime } from "@/lib/auction/client";
import {
  matchBossFromOcr,
  parseBossTimesFromOcr,
  splitKillAndAppearance,
  buildOcrTimerDraft,
} from "@/lib/boss/ocrParse";
import {
  prewarmBossTimerOcr,
  recognizeBossNameAtClick,
  recognizeBossTimeAtClick,
} from "@/lib/boss/recognize";

function clickToImageRatio(e: React.MouseEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dispW = nw * scale;
  const dispH = nh * scale;
  const offsetX = (rect.width - dispW) / 2;
  const offsetY = (rect.height - dispH) / 2;
  const x = (e.clientX - rect.left - offsetX) / dispW;
  const y = (e.clientY - rect.top - offsetY) / dispH;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x, y };
}

function remainHint(nextIso: string, nowMs: number) {
  const ms = new Date(nextIso).getTime() - nowMs;
  if (ms <= 0) return "刷新时间已过，写入后计时器显示「已刷新」";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `倒计时约 ${h} 小时 ${m} 分`;
}

export type OcrTimerItem = {
  key: string;
  bossId: number;
  bossName: string;
  lastKillAt: string;
  nextSpawnAt: string;
  source: "appearance" | "interval";
  overdue: boolean;
  ocrName: string;
  ocrTime: string;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BossTimerOcrPanel({
  bosses,
  onApply,
}: {
  bosses: Boss[];
  onApply: (item: {
    bossId: number;
    lastKillAt: string;
    nextSpawnAt: string;
  }) => Promise<boolean>;
}) {
  const pasteRef = useRef<HTMLDivElement>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<File | string | null>(null);
  const [step, setStep] = useState<"name" | "time">("name");
  const [nameMark, setNameMark] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [timeMark, setTimeMark] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [ocrName, setOcrName] = useState("");
  const [ocrTime, setOcrTime] = useState("");
  const [namePreview, setNamePreview] = useState<string | null>(null);
  const [timePreview, setTimePreview] = useState<string | null>(null);
  const [matchedId, setMatchedId] = useState<number | null>(null);
  const [pending, setPending] = useState<OcrTimerItem | null>(null);
  const [queue, setQueue] = useState<OcrTimerItem[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  useEffect(() => {
    prewarmBossTimerOcr();
  }, []);

  function resetPair() {
    setStep("name");
    setNameMark(null);
    setTimeMark(null);
    setOcrName("");
    setOcrTime("");
    setNamePreview(null);
    setTimePreview(null);
    setMatchedId(null);
    setPending(null);
  }

  function handleImage(file: File) {
    setError("");
    resetPair();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setImageData(dataUrl);
      setImageSource(file);
      setStatus("请先点击左侧 BOSS 名字");
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (file) handleImage(file);
      return;
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImage(file);
    e.target.value = "";
  }

  function buildPending(
    boss: Boss,
    nameText: string,
    timeText: string,
  ): OcrTimerItem | null {
    const times = parseBossTimesFromOcr(timeText);
    const { kill, appearance } = splitKillAndAppearance(times);
    if (!kill) return null;
    const planned = buildOcrTimerDraft({
      killIso: kill.iso,
      appearanceIso: appearance?.iso ?? null,
      intervalHours: boss.intervalHours,
    });
    if (!planned.ok) {
      setError(planned.error);
      return null;
    }
    return {
      key: newKey(),
      bossId: boss.id,
      bossName: boss.name,
      lastKillAt: planned.lastKillAt,
      nextSpawnAt: planned.nextSpawnAt,
      source: planned.source,
      overdue: planned.overdue,
      ocrName: nameText,
      ocrTime: timeText,
    };
  }

  async function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!imageSource || !imageData || recognizing) return;
    const ratio = clickToImageRatio(e);
    if (!ratio) {
      setStatus("请点在截图画面内");
      return;
    }
    setRecognizing(true);
    setError("");
    try {
      if (step === "name") {
        setNameMark(ratio);
        setStatus("正在识别 BOSS 名字…");
        const result = await recognizeBossNameAtClick(
          imageSource,
          ratio.x,
          ratio.y,
        );
        setOcrName(result.text);
        setNamePreview(result.previewDataUrl);
        const hit = matchBossFromOcr(result.text, bosses);
        if (hit) {
          setMatchedId(hit.boss.id);
          setStep("time");
          setTimeMark(null);
          setOcrTime("");
          setTimePreview(null);
          setPending(null);
          setStatus(
            `已匹配「${hit.boss.name}」。请再点击该行的击退时间（上面那行）`,
          );
        } else {
          setMatchedId(null);
          setStep("time");
          setStatus(
            result.text
              ? `识别为「${result.text.replace(/\s+/g, "")}」，未自动匹配。请在下方选择 BOSS，再点击击退时间`
              : "未识别到名字，请对准 BOSS 名称再点，或手动选择后再点击退时间",
          );
        }
        return;
      }

      setTimeMark(ratio);
      setStatus("正在识别击退时间…");
      const result = await recognizeBossTimeAtClick(
        imageSource,
        ratio.x,
        ratio.y,
      );
      setOcrTime(result.text);
      setTimePreview(result.previewDataUrl);
      const boss = bosses.find((b) => b.id === matchedId);
      if (!boss) {
        setPending(null);
        setStatus("请先选择对应的 BOSS，然后可再点一次击退时间");
        return;
      }
      const item = buildPending(boss, ocrName, result.text);
      if (!item) {
        setPending(null);
        setStatus("未识别到「年 月 日 时 分」，请对准击退时间再点一次");
        return;
      }
      setPending(item);
      setStatus(
        `识别结果：${item.bossName} · 击杀 ${formatBeijingDateTime(item.lastKillAt)} · 下次 ${formatBeijingDateTime(item.nextSpawnAt)}。核对后加入列表`,
      );
    } catch {
      setStatus(step === "name" ? "名字识别失败，请再点一次" : "时间识别失败，请再点一次");
    } finally {
      setRecognizing(false);
    }
  }

  function onPickBoss(id: number) {
    const boss = bosses.find((b) => b.id === id);
    setMatchedId(id || null);
    if (!boss) {
      setPending(null);
      return;
    }
    if (!ocrTime) {
      setStatus(`已选择「${boss.name}」。请点击该行的击退时间`);
      return;
    }
    const item = buildPending(boss, ocrName, ocrTime);
    if (item) {
      setPending(item);
      setStatus(
        `识别结果：${item.bossName} · 击杀 ${formatBeijingDateTime(item.lastKillAt)} · 下次 ${formatBeijingDateTime(item.nextSpawnAt)}`,
      );
    }
  }

  function addPendingToQueue() {
    if (!pending) return;
    setQueue((prev) => {
      const without = prev.filter((row) => row.bossId !== pending.bossId);
      return [...without, pending];
    });
    setStatus(`已加入「${pending.bossName}」。可继续点下一个 BOSS 名字`);
    resetPair();
  }

  async function applyOne(item: OcrTimerItem) {
    setApplyingKey(item.key);
    setError("");
    try {
      const ok = await onApply({
        bossId: item.bossId,
        lastKillAt: item.lastKillAt,
        nextSpawnAt: item.nextSpawnAt,
      });
      if (!ok) return;
      setQueue((prev) => prev.filter((row) => row.key !== item.key));
      if (pending?.key === item.key) setPending(null);
    } finally {
      setApplyingKey(null);
    }
  }

  async function applyAll() {
    if (!queue.length) return;
    setBusy(true);
    setError("");
    try {
      const remaining: OcrTimerItem[] = [];
      for (const item of queue) {
        const ok = await onApply({
          bossId: item.bossId,
          lastKillAt: item.lastKillAt,
          nextSpawnAt: item.nextSpawnAt,
        });
        if (!ok) remaining.push(item);
      }
      setQueue(remaining);
      if (!remaining.length) {
        setStatus("已把识别结果写入计时器");
      }
    } finally {
      setBusy(false);
    }
  }

  const nowMs = Date.now();
  const selectedBoss = bosses.find((b) => b.id === matchedId) ?? null;

  return (
    <section className="mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
      <h2 className="text-sm font-medium text-[var(--text-muted)]">
        截图识别批量改时间
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
        上传战盟「首领」列表截图：先点 BOSS 名字，再点该行「击退时间」。有出没时间会一并读入；没有刷新的按击杀时间 + 该 BOSS 间隔小时相对现在倒计时。核对后再写入。
      </p>

      <div
        ref={pasteRef}
        tabIndex={0}
        onPaste={onPaste}
        className="mt-3 rounded-xl border border-dashed border-[var(--border-soft)] bg-[#0f1320] px-3 py-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-ghost cursor-pointer text-xs">
            选择图片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
          </label>
          <span className="text-xs text-[var(--text-muted)]">
            也可直接粘贴截图
          </span>
          {imageData && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                setImageData(null);
                setImageSource(null);
                resetPair();
                setStatus("");
              }}
            >
              清除图片
            </button>
          )}
        </div>
      </div>

      {imageData && (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageData}
            alt="BOSS 列表截图"
            className="mx-auto max-h-[520px] w-full cursor-crosshair object-contain"
            onClick={onImageClick}
          />
          {nameMark && (
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-300 bg-emerald-400/40"
              style={{ left: `${nameMark.x * 100}%`, top: `${nameMark.y * 100}%` }}
            />
          )}
          {timeMark && (
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 bg-amber-400/40"
              style={{ left: `${timeMark.x * 100}%`, top: `${timeMark.y * 100}%` }}
            />
          )}
          {recognizing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm">
              识别中…
            </div>
          )}
        </div>
      )}

      {status && (
        <p className="mt-2 text-xs text-[var(--accent-violet)]">{status}</p>
      )}
      {error && (
        <p className="mt-1 text-sm text-[var(--accent-crimson)]">{error}</p>
      )}

      {(ocrName || ocrTime || matchedId != null) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[#151a2c] p-3">
            <p className="text-[11px] text-[var(--text-muted)]">名字识别</p>
            {namePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={namePreview}
                alt="名字裁切"
                className="mt-2 max-h-16 rounded bg-white"
              />
            )}
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {ocrName || "尚未点击"}
            </p>
            <label className="mt-2 block space-y-1">
              <span className="text-[11px] text-[var(--text-muted)]">
                对应 BOSS
              </span>
              <select
                className="field !py-2 text-sm"
                value={matchedId ?? ""}
                onChange={(e) => onPickBoss(Number(e.target.value))}
              >
                <option value="">请选择</option>
                {bosses.map((boss) => (
                  <option key={boss.id} value={boss.id}>
                    {boss.name}（间隔 {boss.intervalHours} 小时）
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="rounded-xl bg-[#151a2c] p-3">
            <p className="text-[11px] text-[var(--text-muted)]">时间识别</p>
            {timePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={timePreview}
                alt="时间裁切"
                className="mt-2 max-h-16 rounded bg-white"
              />
            )}
            <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-muted)]">
              {ocrTime || "尚未点击击退时间"}
            </p>
            {selectedBoss && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                后台间隔 {selectedBoss.intervalHours} 小时
              </p>
            )}
          </div>
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-[#14241c] p-3">
          <p className="text-sm font-medium text-emerald-200">核对识别结果</p>
          <p className="mt-1 text-sm">
            {pending.bossName}
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              {pending.source === "appearance"
                ? "出没时间来自截图"
                : `由击杀时间 + ${selectedBoss?.intervalHours ?? ""} 小时推算`}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            击杀 {formatBeijingDateTime(pending.lastKillAt)} · 下次刷新{" "}
            {formatBeijingDateTime(pending.nextSpawnAt)}
          </p>
          <p className="mt-1 text-xs text-emerald-200/80">
            {remainHint(pending.nextSpawnAt, nowMs)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold"
              onClick={addPendingToQueue}
            >
              加入待写入
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={applyingKey === pending.key}
              onClick={() => void applyOne(pending)}
            >
              {applyingKey === pending.key ? "写入中…" : "只写入这一条"}
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={resetPair}
            >
              重点
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              待写入 {queue.length} 条
            </p>
            <button
              type="button"
              className="rounded-xl bg-[#3b82f6] px-3 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy}
              onClick={() => void applyAll()}
            >
              {busy ? "写入中…" : "确认写入全部"}
            </button>
          </div>
          <ul className="mt-2 divide-y divide-[var(--border-soft)] rounded-xl border border-[var(--border-soft)]">
            {queue.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{item.bossName}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    击杀 {formatBeijingDateTime(item.lastKillAt)} · 下次{" "}
                    {formatBeijingDateTime(item.nextSpawnAt)}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {remainHint(item.nextSpawnAt, nowMs)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={applyingKey === item.key || busy}
                    onClick={() => void applyOne(item)}
                  >
                    写入
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs text-[var(--accent-crimson)]"
                    onClick={() =>
                      setQueue((prev) =>
                        prev.filter((row) => row.key !== item.key),
                      )
                    }
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
