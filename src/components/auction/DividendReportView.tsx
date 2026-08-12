"use client";

import type { DividendReport, Member } from "@/lib/types";

function money(n: number) {
  return `¥${n.toFixed(2)}`;
}

function NameText({
  name,
  belowThreshold,
}: {
  name: string;
  belowThreshold?: boolean;
}) {
  return (
    <span
      className={
        belowThreshold
          ? "font-medium text-[var(--accent-crimson)]"
          : "font-medium"
      }
      title={belowThreshold ? "战力低于合格线（排行榜 85% 均值）" : undefined}
    >
      {name}
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
  onAddTemporary,
  onDeleteTemporary,
  onUpdateTotalAmount,
  tempMemberId,
  tempAmount,
  onTempMemberIdChange,
  onTempAmountChange,
}: {
  report: DividendReport | null;
  members?: Member[];
  editable?: boolean;
  busy?: boolean;
  taxPercent?: number;
  onTaxPercentChange?: (v: number) => void;
  onCalculate?: () => void;
  onSetItemMembers?: (itemId: number, memberIds: number[]) => void;
  onAddTemporary?: () => void;
  onDeleteTemporary?: (id: number) => void;
  onUpdateTotalAmount?: (id: number, amount: number) => void;
  tempMemberId?: string;
  tempAmount?: number;
  onTempMemberIdChange?: (v: string) => void;
  onTempAmountChange?: (v: number) => void;
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
                  税率 %
                </span>
                <input
                  className="field !w-24"
                  type="number"
                  min={0}
                  max={50}
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
        {below.size > 0 && (
          <p className="mt-3 text-xs text-[var(--accent-crimson)]">
            标红名字为战力低于排行榜合格线（均值 85%），方便管理员核对是否纳入分红。
          </p>
        )}
      </section>

      {!report.calculated && report.itemGroups.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          尚未计算。管理员计算后，将按拍品逐条公示每人分红。
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
              {group.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <NameText
                    name={line.memberName}
                    belowThreshold={line.belowThreshold}
                  />
                  <span className="tabular-nums text-[var(--accent-gold)]">
                    {money(line.shareAmount)}
                  </span>
                </li>
              ))}
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
        <ul className="divide-y divide-[var(--border-soft)]">
          {report.totals.length === 0 && (
            <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
              暂无总表数据
            </li>
          )}
          {report.totals.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <NameText
                  name={entry.memberName}
                  belowThreshold={entry.belowThreshold}
                />
                {entry.isTemporary && (
                  <span className="ml-2 text-xs text-[var(--accent-amber)]">
                    临时
                  </span>
                )}
                {entry.note && (
                  <p className="text-xs text-[var(--text-muted)]">{entry.note}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editable && entry.isTemporary && onUpdateTotalAmount ? (
                  <input
                    className="field !w-28"
                    type="number"
                    step="0.01"
                    value={entry.amount}
                    onChange={(e) =>
                      onUpdateTotalAmount(entry.id, Number(e.target.value))
                    }
                  />
                ) : (
                  <span className="text-lg font-semibold text-[var(--accent-gold)]">
                    {money(entry.amount)}
                  </span>
                )}
                {editable && entry.isTemporary && onDeleteTemporary && (
                  <button
                    type="button"
                    className="btn-ghost text-xs text-[var(--accent-crimson)]"
                    disabled={busy}
                    onClick={() => onDeleteTemporary(entry.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editable && report.calculated && (
        <section className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-muted)]">
            总表临时加人
          </h3>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              className="field"
              value={tempMemberId ?? ""}
              onChange={(e) => onTempMemberIdChange?.(e.target.value)}
            >
              <option value="">选择成员</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {below.has(m.id) ? "（战力不合格）" : ""}
                </option>
              ))}
            </select>
            <input
              className="field sm:max-w-[140px]"
              type="number"
              step="0.01"
              placeholder="金额"
              value={tempAmount ?? 0}
              onChange={(e) => onTempAmountChange?.(Number(e.target.value))}
            />
            <button
              type="button"
              className="btn-primary sm:max-w-[120px]"
              disabled={
                busy ||
                !tempMemberId ||
                !(tempAmount != null && tempAmount > 0)
              }
              onClick={onAddTemporary}
            >
              添加
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
