"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GuildFund, SessionUser } from "@/lib/types";
import {
  formatFundAmount,
  formatFundUpdatedAt,
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
  const [amountInput, setAmountInput] = useState(
    fund.amount == null ? "" : String(fund.amount),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/fund", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "公示失败");
        return;
      }
      setFund(data.fund);
      setAmountInput(
        data.fund?.amount == null ? amountInput : String(data.fund.amount),
      );
      setMessage("已公示给全体成员");
      router.refresh();
    } catch {
      setError("网络错误，公示失败");
    } finally {
      setSaving(false);
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
            ? "输入当前金额后公示，全体成员都能在首页和本页看到。"
            : "管理员公示的战盟资金，全体成员可见。"}
        </p>

        <section className="mt-8 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-5 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">当前公示金额</p>
          <p className="mt-3 text-4xl font-extrabold tracking-wide text-[var(--accent-gold)] sm:text-5xl">
            {formatFundAmount(fund.amount)}
          </p>
          {fund.updatedAt ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {formatFundUpdatedAt(fund.updatedAt)}
              {fund.updatedBy ? ` · ${fund.updatedBy}` : ""}
            </p>
          ) : (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              管理员还没有公示金额
            </p>
          )}
        </section>

        {isAdmin && (
          <form
            onSubmit={publish}
            className="mt-6 space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[rgba(21,25,37,0.9)] p-4"
          >
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              管理员公示
            </h2>
            <input
              className="field"
              inputMode="decimal"
              placeholder="例如 1234567 或 100万"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              maxLength={24}
              autoComplete="off"
            />
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "公示中…" : "公示金额"}
            </button>
            {error ? (
              <p className="text-sm text-[var(--accent-crimson)]">{error}</p>
            ) : null}
            {message ? (
              <p className="text-sm text-[var(--accent-gold)]">{message}</p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
