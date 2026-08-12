"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemQuality, Member } from "@/lib/types";
import { QUALITY_OPTIONS, qualityMeta } from "@/lib/auction/client";
import { recognizeItemName } from "@/lib/auction/itemOcr";
import { recognizeImageText } from "@/lib/auction/client";
import { LockIcon } from "@/components/Icons";

function roleClass(role: Member["role"]) {
  if (role === "leader") return "role-leader";
  if (role === "officer") return "role-officer";
  return "";
}

interface AddAuctionItemFormProps {
  members: Member[];
  sessionId: number;
  onCreated: () => void;
}

export function AddAuctionItemForm({
  members,
  sessionId,
  onCreated,
}: AddAuctionItemFormProps) {
  const [name, setName] = useState("");
  const [quality, setQuality] = useState<ItemQuality>("green");
  const [startPrice, setStartPrice] = useState(5);
  const [bidIncrement, setBidIncrement] = useState(5);
  const [imageData, setImageData] = useState<string | null>(null);
  const [namePreview, setNamePreview] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tab, setTab] = useState<"members" | "ocr">("members");
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pasteRef = useRef<HTMLDivElement>(null);
  const memberPasteRef = useRef<HTMLDivElement>(null);

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.includes(m.id)),
    [members, selectedIds],
  );

  function toggleMember(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleImagePaste(
    e: React.ClipboardEvent,
    mode: "item" | "members",
  ) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;

      if (mode === "item") {
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || "");
          setImageData(dataUrl);
          setNamePreview(null);
          setOcrStatus("正在识别顶部装备名称…");
          try {
            const result = await recognizeItemName(file);
            setNamePreview(result.previewDataUrl);
            if (result.name) {
              setName(result.name);
              setOcrStatus(`已识别名称：${result.name}`);
            } else {
              setOcrStatus("未识别到顶部名称，请手动填写");
            }
            if (result.quality) {
              setQuality(result.quality);
            }
          } catch {
            setOcrStatus("识别失败，可手动填写名称");
          }
        };
        reader.readAsDataURL(file);
        return;
      }

      // members OCR
      setOcrStatus("正在识别参与者名单…");
      try {
        const text = await recognizeImageText(file);
        const res = await fetch("/api/auction/ocr-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) {
          setOcrStatus(data.error || "匹配失败");
          return;
        }
        const matched: Member[] = data.matched || [];
        setSelectedIds((prev) => {
          const set = new Set(prev);
          matched.forEach((m) => set.add(m.id));
          return [...set];
        });
        const extra = (data.unrecognized as string[]) || [];
        setOcrStatus(
          `识别到 ${matched.length} 名成员` +
            (extra.length ? `，未入库：${extra.slice(0, 5).join("、")}` : "") +
            "。其余请从左侧手动点选补全。",
        );
        setTab("members");
      } catch {
        setOcrStatus("识别失败，请改用成员名单手动选择");
      }
      return;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auction/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name,
          quality,
          startPrice,
          bidIncrement,
          imageData,
          dividendMemberIds: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setName("");
      setQuality("green");
      setStartPrice(5);
      setBidIncrement(5);
      setImageData(null);
      setNamePreview(null);
      setSelectedIds([]);
      setOcrStatus("");
      onCreated();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    pasteRef.current?.focus();
  }, []);

  const q = qualityMeta(quality);

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">添加拍品</h2>
        <span className="text-xs text-[var(--text-muted)]">+ 添加拍品</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--text-muted)]">拍品名称</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="粘贴装备图后自动识别顶部名称"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--text-muted)]">品质</span>
          <div className="relative">
            <select
              className="field appearance-none pr-8"
              value={quality}
              onChange={(e) => setQuality(e.target.value as ItemQuality)}
            >
              {QUALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
              style={{ background: q.color }}
            />
          </div>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--text-muted)]">起拍价 ¥</span>
          <input
            className="field"
            type="number"
            min={1}
            step={1}
            value={startPrice}
            onChange={(e) => setStartPrice(Number(e.target.value))}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--text-muted)]">加价幅度 ¥</span>
          <input
            className="field"
            type="number"
            min={1}
            step={1}
            value={bidIncrement}
            onChange={(e) => setBidIncrement(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-[var(--text-muted)]">拍品图片</span>
        <div
          ref={pasteRef}
          tabIndex={0}
          onPaste={(e) => handleImagePaste(e, "item")}
          className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#0f1320] px-4 text-center outline-none focus:border-[rgba(123,108,255,0.5)]"
        >
          {imageData ? (
            <div className="flex w-full flex-col items-center gap-2 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageData}
                alt="拍品"
                className="max-h-40 rounded-lg object-contain"
              />
              {namePreview && (
                <div className="w-full rounded-lg bg-white px-2 py-1">
                  <p className="mb-1 text-[10px] text-slate-500">
                    名称识别区域
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={namePreview}
                    alt="名称裁切"
                    className="mx-auto max-h-10 object-contain"
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              点击此区域后 Ctrl+V 粘贴装备详情图（自动识别顶部彩色名称）
            </p>
          )}
        </div>
        {ocrStatus && (
          <p className="text-xs text-[var(--text-muted)]">{ocrStatus}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">分红成员</span>
          <span className="text-xs text-[var(--text-muted)]">
            已选 {selectedMembers.length}
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3">
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs ${tab === "members" ? "bg-[#2a3350] text-white" : "text-[var(--text-muted)]"}`}
                onClick={() => setTab("members")}
              >
                成员名单 ({members.length})
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs ${tab === "ocr" ? "bg-[#2a3350] text-white" : "text-[var(--text-muted)]"}`}
                onClick={() => setTab("ocr")}
              >
                粘贴图片识别
              </button>
            </div>

            {tab === "members" ? (
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {members.map((member) => {
                  const active = selectedIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`member-chip !py-2 ${active ? "!border-[rgba(123,108,255,0.55)] !bg-[#2a3350]" : ""}`}
                      onClick={() => toggleMember(member.id)}
                    >
                      <LockIcon />
                      <span className={`text-sm ${roleClass(member.role)}`}>
                        {member.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                ref={memberPasteRef}
                tabIndex={0}
                onPaste={(e) => handleImagePaste(e, "members")}
                className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-[rgba(255,255,255,0.15)] px-3 text-center text-sm text-[var(--text-muted)] outline-none focus:border-[rgba(123,108,255,0.5)]"
              >
                粘贴游戏「参与者」截图，自动识别名字并勾选；
                <br />
                未识别到的请切回成员名单手动补选
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3">
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              参与分红 ({selectedMembers.length})
            </p>
            {selectedMembers.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                请从左侧点选或识别图片
              </p>
            ) : (
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {selectedMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="rounded-lg bg-[#24304a] px-2.5 py-1 text-xs"
                    onClick={() => toggleMember(m.id)}
                    title="点击移除"
                  >
                    {m.name} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--accent-crimson)]">{error}</p>}

      <button
        type="submit"
        className="rounded-xl bg-[#e23d4a] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        disabled={loading}
      >
        {loading ? "添加中…" : "添加拍品"}
      </button>
    </form>
  );
}
