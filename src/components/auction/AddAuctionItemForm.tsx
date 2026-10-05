"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemCatalogEntry, ItemPriceStats, ItemQuality, Member } from "@/lib/types";
import { compressAuctionItemImage } from "@/lib/auction/itemImageClient";
import { LockIcon } from "@/components/Icons";
import { ItemPriceStatsLine } from "./ItemPriceStatsLine";
import { ParticipantOcrPanel } from "./ParticipantOcrPanel";
import { QUALITY_OPTIONS, qualityMeta } from "@/lib/auction/client";
import { isOrdinaryPinkAuction, isPinkAuction } from "@/lib/auction/pink";

interface AddAuctionItemFormProps {
  members: Member[];
  sessionId: number;
  onCreated: () => void;
}

async function attachAuctionItemScreenshot(
  itemId: number,
  imageData: string,
): Promise<boolean> {
  try {
    const compressed = await compressAuctionItemImage(imageData);
    if (!compressed) return false;
    const res = await fetch(`/api/auction/item-image?id=${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: compressed }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
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
  const [bidMin, setBidMin] = useState(10);
  const [bidMax, setBidMax] = useState(100);
  const [imageData, setImageData] = useState<string | null>(null);
  const [roster, setRoster] = useState(members);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [tab, setTab] = useState<"members" | "ocr">("members");
  const [memberQuery, setMemberQuery] = useState("");
  const [ocrResetNonce, setOcrResetNonce] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshingRoster, setRefreshingRoster] = useState(false);
  const [priceStats, setPriceStats] = useState<ItemPriceStats | null>(null);
  const [priceStatsLoading, setPriceStatsLoading] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ItemCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const pasteRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceStatsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setRoster(members);
  }, [members]);

  const selectedMembers = useMemo(
    () => roster.filter((m) => selectedIds.includes(m.id)),
    [roster, selectedIds],
  );

  const visibleRoster = useMemo(() => {
    const q = memberQuery.trim();
    if (!q) return roster;
    return roster.filter((m) => m.name.includes(q));
  }, [roster, memberQuery]);

  async function refreshRoster() {
    setRefreshingRoster(true);
    setError("");
    try {
      const res = await fetch("/api/admin/members");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "刷新成员名单失败",
        );
        return;
      }
      const next = ((data.members || []) as Member[]).filter(
        (m) => m.status !== "exited",
      );
      setRoster(next);
    } catch {
      setError("刷新成员名单失败");
    } finally {
      setRefreshingRoster(false);
    }
  }

  function toggleMember(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function addMember(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function addMembers(ids: number[]) {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      ids.forEach((id) => set.add(id));
      return [...set];
    });
  }

  function applyCatalog(entry: ItemCatalogEntry) {
    setName(entry.name);
    setQuality(entry.quality);
    setStartPrice(Math.max(1, Math.round(entry.lastStartPrice) || 5));
    setBidIncrement(Math.max(1, Math.round(entry.lastBidIncrement) || 5));
    if (entry.lastBidMin != null && entry.lastBidMin > 0) {
      setBidMin(Math.round(entry.lastBidMin));
    }
    if (entry.lastBidMax != null && entry.lastBidMax > 0) {
      setBidMax(Math.round(entry.lastBidMax));
    }
    setCatalogOpen(false);
    setHighlight(0);
  }

  async function handleImagePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        const compressed = await compressAuctionItemImage(dataUrl);
        setImageData(compressed);
      };
      reader.readAsDataURL(file);
      return;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setCatalogOpen(false);
    priceStatsAbortRef.current?.abort();
    setPriceStatsLoading(false);
    const pendingImage = imageData;
    try {
      const res = await fetch("/api/auction/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name,
          quality,
          startPrice: isPinkAuction(quality) ? bidMin : startPrice,
          bidIncrement: isPinkAuction(quality) ? 1 : bidIncrement,
          bidMin: isPinkAuction(quality) ? bidMin : null,
          bidMax: isPinkAuction(quality) ? bidMax : null,
          dividendMemberIds: selectedIds,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      const itemId = Number(data?.item?.id);
      setName("");
      setQuality("green");
      setStartPrice(5);
      setBidIncrement(5);
      setBidMin(10);
      setBidMax(100);
      setImageData(null);
      setSelectedIds([]);
      setMemberQuery("");
      setOcrResetNonce((n) => n + 1);
      setPriceStats(null);
      setPriceStatsLoading(false);
      setCatalogItems([]);
      onCreated();
      if (pendingImage && itemId > 0) {
        void attachAuctionItemScreenshot(itemId, pendingImage).then(
          (attached) => {
            if (attached) onCreated();
          },
        );
      }
    } catch (err) {
      const timedOut =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      setError(
        timedOut
          ? "添加超时。请去掉拍品图片后重试，或换一张更小的装备截图"
          : "网络错误",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!catalogOpen) return;
    let alive = true;
    const ac = new AbortController();
    setCatalogLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auction/item-catalog?q=${encodeURIComponent(name.trim())}`,
          { signal: ac.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setCatalogItems([]);
          return;
        }
        const items = Array.isArray(data.items)
          ? (data.items as ItemCatalogEntry[])
          : [];
        setCatalogItems(items);
        setHighlight(0);
      } catch {
        if (alive) setCatalogItems([]);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [name, catalogOpen]);

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setPriceStats(null);
      setPriceStatsLoading(false);
      return;
    }
    let alive = true;
    setPriceStatsLoading(true);
    const ac = new AbortController();
    priceStatsAbortRef.current = ac;
    const timer = window.setTimeout(async () => {
      const kill = window.setTimeout(() => ac.abort(), 2500);
      try {
        const res = await fetch(
          `/api/auction/price-stats?name=${encodeURIComponent(trimmed)}`,
          { signal: ac.signal },
        );
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setPriceStats(null);
          return;
        }
        setPriceStats((data.stats as ItemPriceStats | null) ?? null);
      } catch {
        if (alive) setPriceStats(null);
      } finally {
        window.clearTimeout(kill);
        if (alive) setPriceStatsLoading(false);
      }
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [name]);

  function catalogHint(entry: ItemCatalogEntry) {
    const qualityLabel = qualityMeta(entry.quality).label;
    const pricePart = isPinkAuction(entry.quality)
      ? `低¥${entry.lastBidMin ?? entry.lastStartPrice} · 高¥${entry.lastBidMax ?? "-"}`
      : `起拍¥${entry.lastStartPrice} · 加价¥${entry.lastBidIncrement}`;
    const soldPart =
      entry.lastSoldPrice != null ? ` · 上次成交¥${entry.lastSoldPrice}` : "";
    return `${qualityLabel} · ${pricePart}${soldPart}`;
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!catalogOpen || catalogItems.length === 0) {
      if (e.key === "ArrowDown") setCatalogOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(catalogItems.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = catalogItems[highlight] ?? catalogItems[0];
      if (entry) applyCatalog(entry);
    } else if (e.key === "Escape") {
      setCatalogOpen(false);
    }
  }

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
        <div className="relative sm:col-span-2">
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--text-muted)]">拍品名称</span>
            <input
              ref={nameInputRef}
              className="field"
              value={name}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setCatalogOpen(true);
              }}
              onFocus={() => setCatalogOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setCatalogOpen(false), 180);
              }}
              onKeyDown={onNameKeyDown}
              placeholder="输入或从拍品库搜名字点选"
            />
          </label>
          {catalogOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[#121826] shadow-lg">
              {catalogLoading && catalogItems.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  正在搜索拍品库…
                </p>
              ) : catalogItems.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  {name.trim()
                    ? "拍品库没有这个名字，添加后会自动记住"
                    : "拍品库暂无记录，添加过的拍品下次可搜名字带出价格"}
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto py-1">
                  {catalogItems.map((entry, index) => {
                    const active = index === highlight;
                    return (
                      <li key={`${entry.name}-${index}`}>
                        <button
                          type="button"
                          className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                            active ? "bg-[#2a3350]" : "hover:bg-[#1b2336]"
                          }`}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onMouseEnter={() => setHighlight(index)}
                          onClick={() => applyCatalog(entry)}
                        >
                          <span
                            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              background: qualityMeta(entry.quality).color,
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm">
                              {entry.name}
                            </span>
                            <span className="block text-[11px] text-[var(--text-muted)]">
                              {catalogHint(entry)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {name.trim().length < 2 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              从拍品库点选会带出上次起拍价 / 加价 / 颜色；填写名称后显示同名历史成交价
            </p>
          ) : priceStatsLoading ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              正在查询同名成交价…
            </p>
          ) : (
            <ItemPriceStatsLine
              stats={priceStats}
              variant="panel"
              className="mt-2"
              emptyLabel="暂无同名成交记录（尚无历史最高/最低/平均价）"
            />
          )}
        </div>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs text-[var(--text-muted)]">拍品颜色</span>
          <div className="flex flex-wrap gap-2">
            {QUALITY_OPTIONS.map((opt) => {
              const active = quality === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    active
                      ? "border-white/35 bg-[#2a3350]"
                      : "border-[var(--border-soft)] bg-[#121826] text-[var(--text-muted)]"
                  }`}
                  onClick={() => setQuality(opt.value)}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ background: opt.color }}
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {isPinkAuction(quality) && (
            <p className="text-xs leading-relaxed text-[var(--accent-violet)]">
              特殊粉色：仅所选参与者可出价（有高低限价，全场可见）；时间到后匿名投票，票多者得，按此人出价结算。同票比价，价也相同则掷 1–100 点（不可重复）。
            </p>
          )}
          {isOrdinaryPinkAuction(quality) && (
            <p className="text-xs leading-relaxed text-[var(--accent-violet)]">
              普通粉色：仅所选分红成员可出价。其他人看不到出价按钮，会显示「您未参与此boss战斗，无法出价」。
            </p>
          )}
        </label>
        {isPinkAuction(quality) ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">低限价 ¥</span>
              <input
                className="field"
                type="number"
                min={1}
                step={1}
                value={bidMin}
                onChange={(e) => setBidMin(Number(e.target.value))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">高限价 ¥</span>
              <input
                className="field"
                type="number"
                min={1}
                step={1}
                value={bidMax}
                onChange={(e) => setBidMax(Number(e.target.value))}
              />
            </label>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-xs text-[var(--text-muted)]">拍品图片</span>
        <div
          ref={pasteRef}
          tabIndex={0}
          onPaste={handleImagePaste}
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
              <p className="text-[11px] text-[var(--text-muted)]">
                仅展示，不再识别名称。可再粘贴替换
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              点击此区域后 Ctrl+V 粘贴装备图（可选，不识别名称）
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">
            {isPinkAuction(quality)
              ? "参与者（可出价/投票）"
              : isOrdinaryPinkAuction(quality)
                ? "参与者（可出价）"
                : "分红成员"}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            已选 {selectedMembers.length}
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs ${tab === "members" ? "bg-[#2a3350] text-white" : "text-[var(--text-muted)]"}`}
                onClick={() => setTab("members")}
              >
                成员名单 ({roster.length})
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-xs ${tab === "ocr" ? "bg-[#2a3350] text-white" : "text-[var(--text-muted)]"}`}
                onClick={() => setTab("ocr")}
              >
                粘贴图片识别
              </button>
              <button
                type="button"
                className="btn-ghost ml-auto text-xs"
                disabled={refreshingRoster}
                onClick={() => void refreshRoster()}
                title="拉取最新盟成员，已点选的人不会被取消"
              >
                {refreshingRoster ? "刷新中…" : "刷新名单"}
              </button>
            </div>

            {tab === "members" ? (
              <div className="space-y-2">
                <input
                  className="field !py-2 text-sm"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="搜索名字，人多时更快找到"
                />
                <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  {visibleRoster.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      {roster.length === 0
                        ? "暂无成员"
                        : "没有叫这个名字的成员"}
                    </p>
                  ) : (
                    visibleRoster.map((member) => {
                      const active = selectedIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={`member-chip !py-2 ${active ? "!border-[rgba(123,108,255,0.55)] !bg-[#2a3350]" : ""}`}
                          onClick={() => toggleMember(member.id)}
                        >
                          <LockIcon />
                          <span className="text-sm">{member.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <ParticipantOcrPanel
                roster={roster}
                selectedIds={selectedIds}
                onAddMember={addMember}
                onAddMembers={addMembers}
                resetNonce={ocrResetNonce}
              />
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3">
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              {isPinkAuction(quality) || isOrdinaryPinkAuction(quality)
                ? `参与者 (${selectedMembers.length})`
                : `参与分红 (${selectedMembers.length})`}
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
