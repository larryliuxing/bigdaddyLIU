"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "@/lib/types";
import {
  recognizeParticipantNamesInRect,
  type RatioRect,
} from "@/lib/auction/participantOcr";
import { pairOcrNamesToMembers, findBestMemberForOcrName } from "@/lib/auction/nameMatch";
import { LockIcon } from "@/components/Icons";

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

type ReviewHit = {
  ocrName: string;
  suggestedId: number | null;
  overrideId: number | null;
};

function memberById(roster: Member[], id: number | null) {
  if (id == null) return null;
  return roster.find((m) => m.id === id) ?? null;
}

export function ParticipantOcrPanel({
  roster,
  selectedIds,
  onAddMember,
  onAddMembers,
  resetNonce,
}: {
  roster: Member[];
  selectedIds: number[];
  onAddMember: (id: number) => void;
  onAddMembers: (ids: number[]) => void;
  resetNonce: number;
}) {
  const pasteRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<File | string | null>(null);
  const [nameRect, setNameRect] = useState<RatioRect | null>(null);
  const [draftRect, setDraftRect] = useState<RatioRect | null>(null);
  const [frame, setFrame] = useState<{
    offsetX: number;
    offsetY: number;
    dispW: number;
    dispH: number;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hits, setHits] = useState<ReviewHit[]>([]);
  const [pickingName, setPickingName] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [status, setStatus] = useState("");
  const [recognizing, setRecognizing] = useState(false);

  useEffect(() => {
    setImageData(null);
    setImageSource(null);
    setNameRect(null);
    setDraftRect(null);
    setPreview(null);
    setHits([]);
    setPickingName(null);
    setPickQuery("");
    setStatus("");
  }, [resetNonce]);

  useEffect(() => {
    setHits((prev) =>
      prev.map((hit) => ({
        ...hit,
        suggestedId: findBestMemberForOcrName(hit.ocrName, roster)?.id ?? null,
      })),
    );
  }, [roster]);

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

  function handleImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(String(reader.result || ""));
      setImageSource(file);
      setNameRect(null);
      setDraftRect(null);
      setPreview(null);
      setHits([]);
      setPickingName(null);
      setStatus("请在截图上拖框圈出名称列（可圈整列或多个人名）");
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

  async function runOcr(rect: RatioRect) {
    if (!imageSource) return;
    setRecognizing(true);
    setStatus("正在识别框内人名…");
    setPickingName(null);
    try {
      const ocr = await recognizeParticipantNamesInRect(imageSource, rect);
      setPreview(ocr.previewDataUrl);
      const paired = pairOcrNamesToMembers(ocr.names, roster);
      setHits(
        paired.hits.map((hit) => ({
          ocrName: hit.ocrName,
          suggestedId: hit.member?.id ?? null,
          overrideId: null,
        })),
      );
      if (!paired.hits.length) {
        setStatus(
          ocr.text
            ? "框内读到了字，但没有拆出人名。请换个范围或手动从左侧名单点选。"
            : "框内未识别到人名，请重新拉框，或改从左侧名单点选。",
        );
        return;
      }
      const matchedCount = paired.hits.filter((h) => h.member).length;
      setStatus(
        `识别到 ${paired.hits.length} 个名字，其中 ${matchedCount} 个已匹配盟成员。对的按确定，不对可重选或手动选择。`,
      );
    } catch {
      setStatus("识别失败，请重新拉框或改从左侧名单点选");
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
      setStatus("请拖出一个框来圈住名称列");
      return;
    }
    setNameRect(box);
    void runOcr(box);
  }

  function resolvedId(hit: ReviewHit) {
    return hit.overrideId ?? hit.suggestedId;
  }

  function confirmHit(hit: ReviewHit) {
    const id = resolvedId(hit);
    if (id == null) return;
    onAddMember(id);
    setPickingName(null);
  }

  function pickMember(hit: ReviewHit, member: Member) {
    setHits((prev) =>
      prev.map((row) =>
        row.ocrName === hit.ocrName
          ? { ...row, overrideId: member.id }
          : row,
      ),
    );
    onAddMember(member.id);
    setPickingName(null);
    setPickQuery("");
  }

  function confirmAllMatched() {
    const ids = hits
      .map((hit) => resolvedId(hit))
      .filter((id): id is number => id != null);
    onAddMembers(ids);
    setPickingName(null);
  }

  const pickChoices = useMemo(() => {
    const q = pickQuery.trim();
    if (!q) return roster;
    return roster.filter((m) => m.name.includes(q));
  }, [roster, pickQuery]);

  const pendingCount = hits.filter(
    (hit) => resolvedId(hit) != null && !selectedIds.includes(resolvedId(hit)!),
  ).length;

  useEffect(() => {
    pasteRef.current?.focus();
  }, []);

  return (
    <div className="space-y-3">
      <div
        ref={pasteRef}
        tabIndex={0}
        onPaste={onPaste}
        className="rounded-lg border border-dashed border-[rgba(255,255,255,0.15)] px-3 py-3 outline-none focus:border-[rgba(123,108,255,0.5)]"
      >
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          粘贴游戏「参与者」截图后，自己拖框圈出名称列。每个人名会对上盟成员，核对后再加入分红。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="btn-ghost cursor-pointer text-xs">
            选择图片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImage(file);
                e.target.value = "";
              }}
            />
          </label>
          {imageData && (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                setImageData(null);
                setImageSource(null);
                setNameRect(null);
                setPreview(null);
                setHits([]);
                setStatus("");
              }}
            >
              清除图片
            </button>
          )}
        </div>
      </div>

      {imageData && (
        <div className="relative overflow-hidden rounded-xl border border-[var(--border-soft)] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageData}
            alt="参与者截图"
            className="mx-auto max-h-72 w-full object-contain"
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
      )}

      {preview && (
        <div className="rounded-lg bg-white px-2 py-1">
          <p className="mb-1 text-[10px] text-slate-500">识别区域</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="名称裁切"
            className="mx-auto max-h-24 object-contain"
          />
        </div>
      )}

      {nameRect && (
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={recognizing}
          onClick={() => void runOcr(nameRect)}
        >
          重新识别
        </button>
      )}

      {status && (
        <p className="text-xs text-[var(--accent-violet)]">{status}</p>
      )}

      {hits.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              识别结果 ({hits.length})
            </p>
            {pendingCount > 0 && (
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={confirmAllMatched}
              >
                确定全部已匹配 ({pendingCount})
              </button>
            )}
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {hits.map((hit) => {
              const member = memberById(roster, resolvedId(hit));
              const confirmed = member != null && selectedIds.includes(member.id);
              const picking = pickingName === hit.ocrName;
              return (
                <li
                  key={hit.ocrName}
                  className="rounded-lg border border-[var(--border-soft)] bg-[#151a2c] p-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        识别到
                      </p>
                      <p className="text-sm font-medium">{hit.ocrName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {confirmed
                          ? "已加入分红"
                          : member
                            ? "匹配成员"
                            : "未匹配"}
                      </p>
                      <p
                        className={`text-sm ${member ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                      >
                        {member ? member.name : "请手动选择"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {member && !confirmed && (
                      <button
                        type="button"
                        className="rounded-lg bg-[#2a3350] px-2.5 py-1 text-xs"
                        onClick={() => confirmHit(hit)}
                      >
                        确定
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => {
                        setPickingName(picking ? null : hit.ocrName);
                        setPickQuery("");
                      }}
                    >
                      {member ? "重选" : "手动选择"}
                    </button>
                  </div>
                  {picking && (
                    <div className="mt-2 space-y-2">
                      <input
                        className="field !py-2 text-sm"
                        value={pickQuery}
                        placeholder="搜索名字后点选"
                        onChange={(e) => setPickQuery(e.target.value)}
                      />
                      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                        {pickChoices.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">
                            没有叫这个名字的成员
                          </p>
                        ) : (
                          pickChoices.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className="member-chip !py-1.5"
                              onClick={() => pickMember(hit, m)}
                            >
                              <LockIcon />
                              <span className="text-xs">{m.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
