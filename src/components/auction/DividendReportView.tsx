"use client";

import type { DividendReport, Member } from "@/lib/types";

function money(n: number) {
  return `¥${n.toFixed(2)}`;
}

function NameText({
  name,
  belowThreshold,
  isSelf,
  thresholdPercent,
}: {
  name: string;
  belowThreshold?: boolean;
  isSelf?: boolean;
  thresholdPercent?: number;
}) {
  const percentLabel =
    thresholdPercent != null && Number.isFinite(thresholdPercent)
      ? Number.isInteger(thresholdPercent)
        ? String(thresholdPercent)
        : thresholdPercent.toFixed(1)
      : null;
  return (
    <span
      className={
        belowThreshold
          ? "font-medium text-[var(--accent-crimson)]"
          : isSelf
            ? "font-medium text-[var(--accent-gold)]"
            : "font-medium"
      }
      title={
        belowThreshold
          ? percentLabel
            ? `战力低于合格线（排行榜 ${percentLabel}% 均值）`
            : "战力低于排行榜合格线"
          : undefined
      }
    >
      {name}
      {isSelf ? "（我）" : ""}
      {belowThreshold ? " · 战力不合格" : ""}
    </span>
  );
}

export function DividendReportView({
  report,
  members = [],
  editable = false,
  busy = false,
  taxPercent,
  onTaxPercentChange,
  onCalculate,
  onSetItemMembers,
  highlightMemberId,
}: {
  report: DividendReport | null;
  members?: Member[];
  editable?: boolean;
  busy?: boolean;
  taxPercent?: number;
  onTaxPercentChange?: (v: number) => void;
  onCalculate?: () => void;
  onSetItemMembers?: (itemId: number, memberIds: number[]) => void;
  /** Logged-in member — highlight their shares so everyone can find their payout. */
  highlightMemberId?: number | null;
}) {
  if (!report) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        暂无分红公示。拍卖结束后由管理员计算并留存。
      </p>
    );
  }

  const below = new Set(report.belowThresholdMemberIds);
  const summary = report.summary;
  const thresholdPercent = report.thresholdPercent;
  const thresholdLabel =
    thresholdPercent != null && Number.isFinite(thresholdPercent)
      ? Number.isInteger(thresholdPercent)
        ? String(thresholdPercent)
        : thresholdPercent.toFixed(1)
      : null;
  const myTotal =
    highlightMemberId != null
      ? report.totals.find((t) => t.memberId === highlightMemberId)
      : undefined;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              本场分红总览（公开留存）
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              税率 {(summary.taxRate * 100).toFixed(1)}% · 成交{" "}
              {summary.soldCount} 件 · 分红池为税后金额
            </p>
          </div>
          {editable && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-[var(--text-muted)]">
                  本场税率 %（0–10）
                </span>
                <input
                  className="field !w-24"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={taxPercent ?? summary.taxRate * 100}
                  onChange={(e) =>
                    onTaxPercentChange?.(Number(e.target.value))
                  }
                />
              </label>
              <button
                type="button"
                className="rounded-xl bg-[#e23d4a] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={onCalculate}
              >
                {report.calculated ? "按当前税率重算" : "计算分红"}
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-xl bg-[#121826] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">成交总额</p>
            <p className="font-semibold text-[var(--accent-gold)]">
              {money(summary.grossSales)}
            </p>
          </div>
          <div className="rounded-xl bg-[#121826] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">税收</p>
            <p className="font-semibold">{money(summary.taxTotal)}</p>
          </div>
          <div className="rounded-xl bg-[#121826] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">分红池</p>
            <p className="font-semibold">{money(summary.dividendPool)}</p>
          </div>
          <div className="rounded-xl bg-[#121826] px-3 py-2">
            <p className="text-xs text-[var(--text-muted)]">实发合计</p>
            <p className="font-semibold">{money(summary.payoutTotal)}</p>
          </div>
        </div>
        {myTotal && (
          <div className="mt-3 rounded-xl border border-[rgba(232,168,74,0.35)] bg-[rgba(232,168,74,0.08)] px-3 py-2.5">
            <p className="text-xs text-[var(--text-muted)]">我的本场分红合计</p>
            <p className="text-lg font-semibold text-[var(--accent-gold)]">
              {money(myTotal.amount)}
            </p>
          </div>
        )}
        {highlightMemberId != null && report.calculated && !myTotal && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            你未出现在本场分红名单中。
          </p>
        )}
        {below.size > 0 && (
          <p className="mt-3 text-xs text-[var(--accent-crimson)]">
            标红名字为战力低于排行榜合格线
            {thresholdLabel ? `（均值 ${thresholdLabel}%）` : ""}
            ，方便管理员核对是否纳入分红。
          </p>
        )}
      </section>

      {!report.calculated && report.itemGroups.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          尚未计算。管理员计算后，打开本场拍卖即可查看每人分红。
        </p>
      )}

      {report.itemGroups.map((group) => {
        const selected = new Set(
          group.lines.map((l) => l.memberId).filter(Boolean) as number[],
        );
        return (
          <section
            key={group.itemId}
            className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]"
          >
            <div className="border-b border-[var(--border-soft)] px-4 py-3">
              <h3 className="font-semibold">{group.itemName}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                成交 {money(group.soldPrice)} · 税{" "}
                {money(group.taxAmount)}（{(group.taxRate * 100).toFixed(1)}%）
                · 分红池 {money(group.poolAmount)} · {group.lines.length} 人平分
              </p>
            </div>
            <ul className="divide-y divide-[var(--border-soft)]">
              {group.lines.map((line) => {
                const isSelf =
                  highlightMemberId != null &&
                  line.memberId === highlightMemberId;
                return (
                  <li
                    key={line.id}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                      isSelf ? "bg-[rgba(232,168,74,0.08)]" : ""
                    }`}
                  >
                    <NameText
                      name={line.memberName}
                      belowThreshold={line.belowThreshold}
                      isSelf={isSelf}
                      thresholdPercent={thresholdPercent}
                    />
                    <span className="tabular-nums text-[var(--accent-gold)]">
                      {money(line.shareAmount)}
                    </span>
                  </li>
                );
              })}
              {group.lines.length === 0 && (
                <li className="px-4 py-4 text-sm text-[var(--text-muted)]">
                  该拍品暂无分红成员
                </li>
              )}
            </ul>
            {editable && onSetItemMembers && (
              <div className="border-t border-[var(--border-soft)] px-4 py-3">
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  调整本拍品分红成员（可增删，战力不合格已标红）
                </p>
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {members.map((m) => {
                    const active = selected.has(m.id);
                    const bad = below.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`rounded-lg border px-2.5 py-1 text-xs ${
                          active
                            ? "border-[rgba(123,108,255,0.55)] bg-[#2a3350]"
                            : "border-[var(--border-soft)] bg-[#121826]"
                        } ${bad ? "text-[var(--accent-crimson)]" : ""}`}
                        disabled={busy}
                        onClick={() => {
                          const next = new Set(selected);
                          if (active) next.delete(m.id);
                          else next.add(m.id);
                          onSetItemMembers(group.itemId, [...next]);
                        }}
                      >
                        {m.name}
                        {bad ? "!" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3 text-sm">
          <h2 className="font-medium">综合分红总表</h2>
          <span className="text-[var(--text-muted)]">
            合计 {money(summary.payoutTotal)}
          </span>
        </div>
        <p className="border-b border-[var(--border-soft)] px-4 py-2 text-xs text-[var(--text-muted)]">
          总表由各拍品分红自动汇总，仅可在上方单件拍品中增删成员。
        </p>
        <ul className="divide-y divide-[var(--border-soft)]">
          {report.totals.length === 0 && (
            <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
              暂无总表数据
            </li>
          )}
          {report.totals.map((entry) => {
            const isSelf =
              highlightMemberId != null &&
              entry.memberId === highlightMemberId;
            return (
              <li
                key={entry.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  isSelf ? "bg-[rgba(232,168,74,0.08)]" : ""
                }`}
              >
                <NameText
                  name={entry.memberName}
                  belowThreshold={entry.belowThreshold}
                  isSelf={isSelf}
                  thresholdPercent={thresholdPercent}
                />
                <span className="text-lg font-semibold text-[var(--accent-gold)]">
                  {money(entry.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
