"use client";

import type { ItemPriceStats } from "@/lib/types";

function money(n: number) {
  return `¥${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

/** Compact historical price strip for listing / live auction. */
export function ItemPriceStatsLine({
  stats,
  className,
}: {
  stats: ItemPriceStats | null | undefined;
  className?: string;
}) {
  if (!stats || stats.count <= 0) {
    return (
      <p className={`text-xs text-[var(--text-muted)] ${className ?? ""}`}>
        暂无同名成交记录
      </p>
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
