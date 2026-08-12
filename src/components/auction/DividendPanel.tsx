"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DividendEntry, AuctionSession } from "@/lib/types";

/** Member-facing read-only dividend view. Admin calculate/adjust is on /auction/manage. */
export function DividendPanel() {
  const router = useRouter();
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [session, setSession] = useState<AuctionSession | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/auction/dividends");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setDividends(data.dividends || []);
      setSession(data.session || null);
    };
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, []);

  const total = dividends.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">拍卖</p>
            <h1 className="mt-1 text-2xl font-bold">分红统计</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              场次 #{session?.id ?? "-"} · 状态 {session?.status ?? "无"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/auction")}
            >
              拍卖大厅
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/home")}
            >
              返回导航
            </button>
          </div>
        </header>

        <p className="mb-4 text-sm text-[var(--text-muted)]">
          分红由管理员在后台计算与调整；成员仅可查看结果。
        </p>

        <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <span>分红明细（{dividends.length}）</span>
            <span>合计 ¥{total.toFixed(2)}</span>
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {dividends.length === 0 && (
              <li className="px-4 py-8 text-sm text-[var(--text-muted)]">
                暂无分红数据。拍卖结束后由管理员在后台计算。
              </li>
            )}
            {dividends.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {entry.memberName}
                    {entry.isTemporary && (
                      <span className="ml-2 text-xs text-[var(--accent-amber)]">
                        临时
                      </span>
                    )}
                  </p>
                  {entry.note && (
                    <p className="text-xs text-[var(--text-muted)]">{entry.note}</p>
                  )}
                </div>
                <p className="text-lg font-semibold text-[var(--accent-gold)]">
                  ¥{entry.amount.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
