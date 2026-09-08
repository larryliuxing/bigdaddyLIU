"use client";

import { useEffect, useRef, useState } from "react";
import type { Boss } from "@/lib/types";
import { formatBeijingDateTime } from "@/lib/auction/client";
import {
  matchBossFromOcr,
  parseBossTimesFromOcr,
  splitKillAndAppearance,
  buildOcrTimerDraft,
  formatParsedBeijingTimes,
} from "@/lib/boss/ocrParse";
import {
  prewarmBossTimerOcr,
  recognizeBossNameAtRect,
  recognizeBossTimeAtRect,
} from "@/lib/boss/recognize";
import type { RatioRect } from "@/lib/boss/ocrCrops";

type DragStart = { x: number; y: number };

function clientToRatio(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
) {
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dispW = nw * scale;
  const dispH = nh * scale;
  const offsetX = (rect.width - dispW) / 2;
  const offsetY = (rect.height - dispH) / 2;
  const x = (clientX - rect.left - offsetX) / dispW;
  const y = (clientY - rect.top - offsetY) / dispH;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function rectFromPoints(a: DragStart, b: DragStart): RatioRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function boxStyle(
  box: RatioRect,
  frame: { offsetX: number; offsetY: number; dispW: number; dispH: number },
) {
  return {
    left: frame.offsetX + box.x * frame.dispW,
    top: frame.offsetY + box.y * frame.dispH,
    width: Math.max(2, box.w * frame.dispW),
    height: Math.max(2, box.h * frame.dispH),
  };
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
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<File | string | null>(null);
  const [step, setStep] = useState<"name" | "time">("name");
  const [nameRect, setNameRect] = useState<RatioRect | null>(null);
  const [timeRect, setTimeRect] = useState<RatioRect | null>(null);
  const [draftRect, setDraftRect] = useState<RatioRect | null>(null);
  const [frame, setFrame] = useState<{
    offsetX: number;
    offsetY: number;
    dispW: number;
    dispH: number;
  } | null>(null);
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
  const [nameManual, setNameManual] = useState(false);
  const [timeManual, setTimeManual] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");

  useEffect(() => {
    prewarmBossTimerOcr();
  }, []);

  function syncFrame() {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const scale = Math.min(rect.width / nw, rect.height / nh);
    setFrame({
      offsetX: (rect.width - nw * scale) / 2,
      offsetY: (rect.height - nh * scale) / 2,
      dispW: nw * scale,
      dispH: nh * scale,
    });
  }

  useEffect(() => {
    if (!imageData) return;
    syncFrame();
    const onResize = () => syncFrame();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [imageData]);

  function resetPair() {
    setStep("name");
    setNameRect(null);
    setTimeRect(null);
    setDraftRect(null);
    setOcrName("");
    setOcrTime("");
    setNamePreview(null);
    setTimePreview(null);
    setMatchedId(null);
    setPending(null);
    setNameManual(false);
    setTimeManual(false);
    setNameDraft("");
    setTimeDraft("");
  }

  function handleImage(file: File) {
    setError("");
    resetPair();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setImageData(dataUrl);
      setImageSource(file);
      setStatus("请在截图上拖框框出 BOSS 名字");
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
      ocrTime: formatParsedBeijingTimes(times) || timeText,
    };
  }

  function refreshPending(bossId: number | null, nameText: string, timeText: string) {
    const boss = bosses.find((b) => b.id === bossId);
    if (!boss || !timeText) {
      setPending(null);
      return;
    }
    const item = buildPending(boss, nameText, timeText);
    if (!item) {
      setPending(null);
      return;
    }
    setPending(item);
    setStatus(
      `识别结果：${item.bossName} · 击杀 ${formatBeijingDateTime(item.lastKillAt)} · 下次 ${formatBeijingDateTime(item.nextSpawnAt)}。核对后加入列表`,
    );
  }

  async function runNameOcr(rect: RatioRect) {
    if (!imageSource) return;
    setRecognizing(true);
    setError("");
    setStatus("正在识别 BOSS 名字…");
    try {
      const result = await recognizeBossNameAtRect(
        imageSource,
        rect,
        bosses.map((b) => b.name),
      );
      setOcrName(result.text);
      setNameDraft(result.text);
      setNamePreview(result.previewDataUrl);
      const hit = matchBossFromOcr(result.text, bosses);
      if (hit) {
        setMatchedId(hit.boss.id);
        setStep("time");
        setStatus(
          `已匹配「${hit.boss.name}」。请再拖框框出该行的击退时间`,
        );
        if (ocrTime) refreshPending(hit.boss.id, result.text, ocrTime);
      } else {
        setMatchedId(null);
        setStep("time");
        setStatus(
          result.text
            ? `识别为「${result.text.replace(/\s+/g, "")}」，未自动匹配。请手动选择或输入 BOSS，再拖出击退时间`
            : "未识别到名字，可重新拉框、重新识别，或手动输入",
        );
      }
    } catch {
      setStatus("名字识别失败，可重新拉框或手动输入");
    } finally {
      setRecognizing(false);
    }
  }

  async function runTimeOcr(rect: RatioRect) {
    if (!imageSource) return;
    setRecognizing(true);
    setError("");
    setStatus("正在识别击退时间…");
    try {
      const result = await recognizeBossTimeAtRect(imageSource, rect);
      setOcrTime(result.text);
      setTimeDraft(result.text);
      setTimePreview(result.previewDataUrl);
      if (!result.text) {
        setPending(null);
        setStatus("未识别到时间，请重新拉框、重新识别，或手动输入");
        return;
      }
      if (matchedId == null) {
        setPending(null);
        setStatus("已读到时间。请先选择或输入对应 BOSS");
        return;
      }
      refreshPending(matchedId, ocrName, result.text);
    } catch {
      setStatus("时间识别失败，可重新拉框或手动输入");
    } finally {
      setRecognizing(false);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imgRef.current || recognizing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = clientToRatio(imgRef.current, e.clientX, e.clientY);
    setDraftRect({
      x: dragStartRef.current.x,
      y: dragStartRef.current.y,
      w: 0,
      h: 0,
    });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || !imgRef.current) return;
    const now = clientToRatio(imgRef.current, e.clientX, e.clientY);
    setDraftRect(rectFromPoints(start, now));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setDraftRect(null);
    if (!start || !imgRef.current || recognizing) return;
    const end = clientToRatio(imgRef.current, e.clientX, e.clientY);
    const box = rectFromPoints(start, end);
    if (box.w < 0.012 || box.h < 0.008) {
      setStatus(
        step === "name"
          ? "请拖出一个框来圈住 BOSS 名字"
          : "请拖出一个框来圈住击退时间",
      );
      return;
    }
    if (step === "name") {
      setNameRect(box);
      void runNameOcr(box);
    } else {
      setTimeRect(box);
      void runTimeOcr(box);
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
      setStatus(`已选择「${boss.name}」。请拖框框出该行的击退时间`);
      return;
    }
    refreshPending(boss.id, ocrName || boss.name, ocrTime);
  }

  function applyManualName() {
    const typed = nameDraft.trim();
    if (!typed) {
      setError("请输入 BOSS 名字");
      return;
    }
    setOcrName(typed);
    const hit = matchBossFromOcr(typed, bosses);
    const exact = bosses.find((b) => b.name === typed);
    const boss = exact ?? hit?.boss;
    if (!boss) {
      setMatchedId(null);
      setError("没有叫这个名字的 BOSS，请对照下拉列表");
      return;
    }
    setError("");
    setMatchedId(boss.id);
    setNameManual(false);
    setStep("time");
    if (ocrTime) refreshPending(boss.id, typed, ocrTime);
    else setStatus(`已选择「${boss.name}」。请拖框框出击退时间`);
  }

  function applyManualTime() {
    const typed = timeDraft.trim();
    if (!typed) {
      setError("请输入时间，例如 2026年 09月 08日 05时 29分");
      return;
    }
    const times = parseBossTimesFromOcr(typed);
    if (!times.length) {
      setError("时间格式不对，请按 2026年 09月 08日 05时 29分 填写");
      return;
    }
    const formatted = formatParsedBeijingTimes(times);
    setOcrTime(formatted);
    setTimeDraft(formatted);
    setTimeManual(false);
    setError("");
    if (matchedId == null) {
      setStatus("时间已填。请先选择对应 BOSS");
      return;
    }
    refreshPending(matchedId, ocrName, formatted);
  }

  function addPendingToQueue() {
    if (!pending) return;
    setQueue((prev) => {
      const without = prev.filter((row) => row.bossId !== pending.bossId);
      return [...without, pending];
    });
    setStatus(`已加入「${pending.bossName}」。可继续拖框识别下一个 BOSS 名字`);
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
        上传战盟「首领」列表截图后，自己拖框圈住名字，再圈住击退时间。认错了可以重新识别或手动输入。核对后再写入。
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
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn-ghost text-xs ${step === "name" ? "text-[var(--text-primary)]" : ""}`}
              onClick={() => {
                setStep("name");
                setStatus("请拖框圈住 BOSS 名字");
              }}
            >
              拖选名字
            </button>
            <button
              type="button"
              className={`btn-ghost text-xs ${step === "time" ? "text-[var(--text-primary)]" : ""}`}
              onClick={() => {
                setStep("time");
                setStatus("请拖框圈住击退时间");
              }}
            >
              拖选时间
            </button>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-[var(--border-soft)] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageData}
              alt="BOSS 列表截图"
              className="mx-auto max-h-[520px] w-full object-contain"
              onLoad={syncFrame}
            />
            <div
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {frame && nameRect && (
              <span
                className="pointer-events-none absolute border-2 border-emerald-300 bg-emerald-400/10"
                style={boxStyle(nameRect, frame)}
              />
            )}
            {frame && timeRect && (
              <span
                className="pointer-events-none absolute border-2 border-amber-300 bg-amber-400/10"
                style={boxStyle(timeRect, frame)}
              />
            )}
            {frame && draftRect && (
              <span
                className="pointer-events-none absolute border-2 border-white/80 bg-white/10"
                style={boxStyle(draftRect, frame)}
              />
            )}
            {recognizing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 text-sm">
                识别中…
              </div>
            )}
          </div>
        </div>
      )}

      {status && (
        <p className="mt-2 text-xs text-[var(--accent-violet)]">{status}</p>
      )}
      {error && (
        <p className="mt-1 text-sm text-[var(--accent-crimson)]">{error}</p>
      )}

      {(ocrName || ocrTime || matchedId != null || nameRect || timeRect) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[#151a2c] p-3">
            <p className="text-[11px] text-[var(--text-muted)]">名字识别</p>
            {namePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={namePreview}
                alt="名字裁切"
                className="mt-2 max-h-16 rounded bg-black"
              />
            )}
            <p className="mt-1 text-sm font-medium">
              {ocrName || "尚未框选名字"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={!nameRect || recognizing}
                onClick={() => nameRect && void runNameOcr(nameRect)}
              >
                重新识别
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  setNameManual((v) => !v);
                  setNameDraft(ocrName);
                }}
              >
                手动输入
              </button>
            </div>
            {nameManual && (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  className="field !py-2 text-sm"
                  value={nameDraft}
                  placeholder="输入 BOSS 名字"
                  onChange={(e) => setNameDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={applyManualName}
                >
                  使用这个名字
                </button>
              </div>
            )}
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
                className="mt-2 max-h-16 rounded bg-black"
              />
            )}
            <p className="mt-1 whitespace-pre-wrap text-sm font-medium">
              {ocrTime || "尚未框选时间"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={!timeRect || recognizing}
                onClick={() => timeRect && void runTimeOcr(timeRect)}
              >
                重新识别
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  setTimeManual((v) => !v);
                  setTimeDraft(ocrTime);
                }}
              >
                手动输入
              </button>
            </div>
            {timeManual && (
              <div className="mt-2 flex flex-col gap-2">
                <input
                  className="field !py-2 text-sm"
                  value={timeDraft}
                  placeholder="2026年 09月 08日 05时 29分"
                  onChange={(e) => setTimeDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={applyManualTime}
                >
                  使用这个时间
                </button>
              </div>
            )}
            {selectedBoss && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
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
              重来
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
