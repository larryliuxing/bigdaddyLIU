"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuildFund, GuildFundEntry, SessionUser } from "@/lib/types";
import {
  beijingDateAndTimeFromIso,
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const entries = fund.entries ?? [];
  const deletions = fund.deletions ?? [];

  function applyFund(next: GuildFund) {
    setFund(next);
    router.refresh();
  }

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
      applyFund(data.fund);
      setAmountInput("");
      setMessage("已记入明细，余额已更新");
    } catch {
      setError("网络错误，记入失败");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(entry: GuildFundEntry) {
    const when = beijingDateAndTimeFromIso(entry.transferredAt);
    setEditingId(entry.id);
    setPendingDeleteId(null);
    setEditDate(when?.date ?? "");
    setEditTime(when?.time ?? "");
    setEditAmount(String(entry.amount));
    setError("");
    setMessage("");
  }

  async function saveEdit(id: number) {
    const transferredAt = fundTransferredAtIso(editDate, editTime);
    if (!transferredAt) {
      setError("请填写这次转入的时间");
      return;
    }
    setError("");
    setMessage("");
    setBusyId(id);
    try {
      const res = await fetch("/api/fund", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          amount: editAmount,
          transferredAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "调整失败");
        return;
      }
      applyFund(data.fund);
      setEditingId(null);
      setMessage("已调整这条明细，余额已更新");
    } catch {
      setError("网络错误，调整失败");
    } finally {
      setBusyId(null);
    }
  }

  function beginDelete(id: number) {
    setPendingDeleteId(id);
    setEditingId(null);
    setNoteDraft("");
    setError("");
    setMessage("");
  }

  async function confirmDelete(id: number) {
    const note = noteDraft.trim();
    if (!note) {
      setError("请填写删除备注，全体成员都会看到");
      return;
    }
    setError("");
    setMessage("");
    setBusyId(id);
    try {
      const res = await fetch("/api/fund", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "删除失败");
        return;
      }
      applyFund(data.fund);
      setPendingDeleteId(null);
      setNoteDraft("");
      setMessage("已删除，备注已公示");
    } catch {
      setError("网络错误，删除失败");
    } finally {
      setBusyId(null);
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
            ? "每笔记下转入时间和金额。可以调整明细，删除时必须写备注，删除记录全体成员可见。"
            : "余额、转入明细和删除记录都对全体成员公示。"}
        </p>

        <section className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-5 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">战盟基金余额</p>
          <p className="mt-3 text-4xl font-extrabold tracking-wide text-[var(--accent-gold)] sm:text-5xl">
            {formatFundAmount(fund.amount)}
          </p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {entries.length > 0
              ? `共 ${entries.length} 笔转入`
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
          </form>
        )}

        {error ? (
          <p className="mt-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-[var(--accent-gold)]">{message}</p>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
            转入明细
          </div>
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
              还没有记录。管理员记入后，这里会列出每次什么时间存了多少。
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-soft)]">
              {entries.map((entry) => {
                const editing = editingId === entry.id;
                const confirmingDelete = pendingDeleteId === entry.id;
                return (
                  <li key={entry.id} className="px-4 py-3 text-sm">
                    {editing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="field"
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                          <input
                            className="field"
                            type="time"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                          />
                        </div>
                        <input
                          className="field"
                          inputMode="decimal"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          maxLength={24}
                        />
                        <div className="flex gap-3 text-xs">
                          <button
                            type="button"
                            className="text-[var(--accent-gold)]"
                            disabled={busyId === entry.id}
                            onClick={() => void saveEdit(entry.id)}
                          >
                            {busyId === entry.id ? "保存中…" : "保存调整"}
                          </button>
                          <button
                            type="button"
                            className="text-[var(--text-muted)]"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--text-muted)]">
                          {formatFundUpdatedAt(entry.transferredAt)}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums text-[var(--accent-gold)]">
                            {formatFundAmount(entry.amount)}
                          </span>
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                onClick={() => beginEdit(entry)}
                              >
                                调整
                              </button>
                              <button
                                type="button"
                                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-crimson)]"
                                onClick={() => beginDelete(entry.id)}
                              >
                                删除
                              </button>
                            </>
                          ) : null}
                        </span>
                      </div>
                    )}
                    {confirmingDelete ? (
                      <div className="mt-2 space-y-2">
                        <input
                          className="field"
                          placeholder="删除备注，全体成员可见"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          maxLength={80}
                          autoComplete="off"
                        />
                        <div className="flex gap-3 text-xs">
                          <button
                            type="button"
                            className="text-[var(--accent-crimson)]"
                            disabled={busyId === entry.id}
                            onClick={() => void confirmDelete(entry.id)}
                          >
                            {busyId === entry.id ? "删除中…" : "确认删除并公示备注"}
                          </button>
                          <button
                            type="button"
                            className="text-[var(--text-muted)]"
                            onClick={() => setPendingDeleteId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
            删除记录
          </div>
          {deletions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
              还没有删除。管理员删除转入时要写备注，这里会公示给全体成员。
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-soft)]">
              {deletions.map((entry) => (
                <li key={entry.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[var(--text-muted)]">
                        {formatFundUpdatedAt(entry.deletedAt)} 删除
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        原转入 {formatFundUpdatedAt(entry.transferredAt)}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--text-muted)] line-through">
                      {formatFundAmount(entry.amount)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="text-[var(--text-muted)]">备注：</span>
                    {entry.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
