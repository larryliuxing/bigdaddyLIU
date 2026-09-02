"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AuctionItem,
  AuctionSession,
  DividendReport,
  SessionUser,
} from "@/lib/types";
import {
  formatBeijingSessionLabel,
  qualityMeta,
} from "@/lib/auction/client";
import { DividendReportView } from "./DividendReportView";
import {
  AuctionItemLightbox,
  AuctionItemThumb,
  type AuctionItemViewerPayload,
} from "./AuctionItemImage";
import { ItemPriceStatsLine } from "./ItemPriceStatsLine";

export function AuctionHistory({
  member,
}: {
  member?: Extract<SessionUser, { type: "member" }> | null;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AuctionSession[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [report, setReport] = useState<DividendReport | null>(null);
  const [viewer, setViewer] = useState<AuctionItemViewerPayload | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/auction/dividends");
      const data = await res.json();
      if (!alive || !res.ok) return;
      const list = (data.sessions || []) as AuctionSession[];
      setSessions(list);
      if (list[0]) setSelectedId(list[0].id);
    };
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    const load = async () => {
      const [itemsRes, divRes] = await Promise.all([
        fetch(`/api/auction/items?sessionId=${selectedId}`),
        fetch(`/api/auction/dividends?sessionId=${selectedId}`),
      ]);
      const itemsData = await itemsRes.json();
      const divData = await divRes.json();
      if (!alive) return;
      if (itemsRes.ok) setItems(itemsData.items || []);
      if (divRes.ok) setReport((divData.report as DividendReport | null) ?? null);
    };
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [selectedId]);

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">拍卖</p>
            <h1 className="mt-1 text-2xl font-bold">历史记录</h1>
          </div>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => router.push("/auction")}
          >
            返回拍卖
          </button>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm ${
                selectedId === s.id
                  ? "bg-[#2a3350]"
                  : "border border-[var(--border-soft)] text-[var(--text-muted)]"
              }`}
              onClick={() => setSelectedId(s.id)}
            >
              #{s.id} ·{" "}
              {formatBeijingSessionLabel(s.scheduledStart || s.startedAt)}
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">暂无历史场次</p>
          )}
        </div>

        <section className="mb-5 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
            拍品结果（点击图片可放大查看属性）
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {items.length === 0 && (
              <li className="px-4 py-8 text-sm text-[var(--text-muted)]">
                该场次暂无拍品
              </li>
            )}
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <AuctionItemThumb
                  itemId={item.id}
                  imageData={item.imageData}
                  hasImage={item.hasImage}
                  name={item.name}
                  quality={item.quality}
                  className="h-14 w-14 shrink-0"
                  onOpen={(payload) =>
                    setViewer({
                      ...payload,
                      detail:
                        item.soldPrice != null
                          ? `成交 ¥${item.soldPrice}${
                              item.winnerName ? ` · ${item.winnerName}` : ""
                            }`
                          : item.status,
                    })
                  }
                />
                <div className="min-w-0">
                  <p className="font-medium">
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: qualityMeta(item.quality).color }}
                    />
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {item.status}
                    {item.soldPrice != null
                      ? ` · 成交 ¥${item.soldPrice} · ${item.winnerName ?? ""}`
                      : ""}
                  </p>
                  <ItemPriceStatsLine
                    stats={item.priceStats}
                    className="mt-1"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <DividendReportView
          report={report}
          editable={false}
          highlightMemberId={member?.id ?? null}
        />

        {viewer && (
          <AuctionItemLightbox
            open
            imageData={viewer.imageData}
            itemId={viewer.itemId}
            hasImage={viewer.hasImage}
            name={viewer.name}
            quality={viewer.quality}
            detail={viewer.detail}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
    </div>
  );
}
