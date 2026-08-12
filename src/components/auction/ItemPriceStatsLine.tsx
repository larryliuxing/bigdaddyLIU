"use client";

import type { ItemPriceStats } from "@/lib/types";

function money(n: number) {
  return `¥${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

/** Compact historical price strip for listing / live auction. */
export function ItemPriceStatsLine({
  stats,
  className,
  variant = "inline",
  emptyLabel = "暂无同名成交记录",
}: {
  stats: ItemPriceStats | null | undefined;
  className?: string;
  /** `panel` = labeled 最高/最低/平均 row for the add-item form. */
  variant?: "inline" | "panel";
  emptyLabel?: string | null;
}) {
  if (!stats || stats.count <= 0) {
    if (emptyLabel == null) return null;
    return (
      <p className={`text-xs text-[var(--text-muted)] ${className ?? ""}`}>
        {emptyLabel}
      </p>
    );
  }

  if (variant === "panel") {
    return (
      <div
        className={`rounded-xl border border-[var(--border-soft)] bg-[#0f1320] px-3 py-2.5 ${className ?? ""}`}
      >
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          同名历史成交 · {stats.count} 次
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-[var(--text-muted)]">最高价</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--accent-gold)]">
              {money(stats.high)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)]">最低价</p>
            <p className="mt-0.5 text-sm font-semibold">{money(stats.low)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--text-muted)]">平均价</p>
            <p className="mt-0.5 text-sm font-semibold">{money(stats.avg)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <p className={`text-xs text-[var(--text-muted)] ${className ?? ""}`}>
      历史同名 {stats.count} 次成交 · 最高{" "}
      <span className="text-[var(--accent-gold)]">{money(stats.high)}</span>
      {" · "}最低 {money(stats.low)}
      {" · "}均价 {money(stats.avg)}
    </p>
  );
}
