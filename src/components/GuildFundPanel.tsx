"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuildFund, SessionUser } from "@/lib/types";
import {
  beijingNowDateAndTime,
  formatFundAmount,
  formatFundUpdatedAt,
  fundTransferredAtIso,
} from "@/lib/fund";

export function GuildFundPanel({
  member,
  isAdmin,
  initialFund,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
  isAdmin: boolean;
  initialFund: GuildFund;
}) {
  const router = useRouter();
  const [fund, setFund] = useState(initialFund);
  const initialWhen = beijingNowDateAndTime();
  const [dateInput, setDateInput] = useState(initialWhen.date);
  const [timeInput, setTimeInput] = useState(initialWhen.time);
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function recordDeposit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const transferredAt = fundTransferredAtIso(dateInput, timeInput);
    if (!transferredAt) {
      setError("请填写这次转入的时间");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountInput, transferredAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "记入失败");
        return;
      }
      setFund(data.fund);
      setAmountInput("");
      setMessage("已记入明细，余额已更新");
      router.refresh();
    } catch {
      setError("网络错误，记入失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: number) {
    if (!window.confirm("删掉这条转入记录？余额会一起减去。")) return;
    setError("");
    setMessage("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/fund?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "删除失败");
        return;
      }
      setFund(data.fund);
      setMessage("已删除这条明细");
      router.refresh();
    } catch {
      setError("网络错误，删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <header className="relative mb-6 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ghost rounded-full px-3 text-sm"
            onClick={() => router.push(member ? "/home" : "/admin")}
          >
            返回导航
          </button>
          <p className="text-xs text-[var(--text-muted)]">
            {member?.name ?? (isAdmin ? "管理员" : "")}
          </p>
        </header>

        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent-gold)]">
          Guild Fund
        </p>
        <h1 className="mt-1 text-2xl font-bold">战盟基金</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          {isAdmin
            ? "每笔记下转入时间和金额，上面的余额是全部明细相加。"
            : "管理员记下的战盟基金余额和转入明细，全体成员可见。"}
        </p>

        <section className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-5 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">战盟基金余额</p>
          <p className="mt-3 text-4xl font-extrabold tracking-wide text-[var(--accent-gold)] sm:text-5xl">
            {formatFundAmount(fund.amount)}
          </p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {fund.entries.length > 0
              ? `共 ${fund.entries.length} 笔转入`
              : "还没有转入记录"}
          </p>
        </section>

        {isAdmin && (
          <form
            onSubmit={recordDeposit}
            className="mt-6 space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[rgba(21,25,37,0.9)] p-4"
          >
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              记一笔转入
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-[var(--text-muted)]">转入日期</span>
                <input
                  className="field"
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[var(--text-muted)]">转入时间</span>
                <input
                  className="field"
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  required
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-[var(--text-muted)]">转入金额</span>
              <input
                className="field"
                inputMode="decimal"
                placeholder="例如 1234567 或 100万"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                maxLength={24}
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "记入中…" : "记入明细"}
            </button>
            {error ? (
              <p className="text-sm text-[var(--accent-crimson)]">{error}</p>
            ) : null}
            {message ? (
              <p className="text-sm text-[var(--accent-gold)]">{message}</p>
            ) : null}
          </form>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
            转入明细
          </div>
          {fund.entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
              还没有记录。管理员记入后，这里会列出每次什么时间存了多少。
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-soft)]">
              {fund.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="text-[var(--text-muted)]">
                    {formatFundUpdatedAt(entry.transferredAt)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums text-[var(--accent-gold)]">
                      {formatFundAmount(entry.amount)}
                    </span>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-crimson)]"
                        disabled={deletingId === entry.id}
                        onClick={() => void removeEntry(entry.id)}
                      >
                        {deletingId === entry.id ? "删除中…" : "删除"}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
