"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DividendEntry, Member, AuctionSession } from "@/lib/types";
import { AdminLoginModal } from "@/components/AdminLoginModal";
import { hubPath } from "@/lib/nav";

export function DividendPanel({
  members,
  isAdmin,
}: {
  members: Member[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [session, setSession] = useState<AuctionSession | null>(null);
  const [calculated, setCalculated] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/auction/dividends");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setDividends(data.dividends || []);
      setSession(data.session || null);
      setCalculated(Boolean(data.room?.dividendsCalculated));
    };
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, []);

  async function calculate() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculate" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "计算失败");
        return;
      }
      setDividends(data.dividends);
      setCalculated(true);
      setMessage("分红已自动计算完成，可临时加人调整");
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function addTemporary() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTemporary",
          memberId: memberId ? Number(memberId) : null,
          memberName:
            members.find((m) => String(m.id) === memberId)?.name || "",
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setDividends(data.dividends);
      setMessage("已临时加人调整");
      setAmount(0);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function updateAmount(id: number, next: number) {
    const res = await fetch("/api/auction/dividends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateAmount", id, amount: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "更新失败");
      return;
    }
    setDividends(data.dividends);
  }

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
              onClick={() => router.push(hubPath(true, isAdmin))}
            >
              返回导航
            </button>
          </div>
        </header>

        {isAdmin ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-[#e23d4a] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy || session?.status !== "ended"}
              onClick={calculate}
            >
              {calculated ? "重新计算分红" : "自动计算分红"}
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => setShowAdmin(true)}
            >
              管理员登录以计算/调整
            </button>
          </div>
        )}

        {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}
        {error && (
          <p className="mb-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        )}

        <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            <span>分红明细（{dividends.length}）</span>
            <span>合计 ¥{total.toFixed(2)}</span>
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {dividends.length === 0 && (
              <li className="px-4 py-8 text-sm text-[var(--text-muted)]">
                暂无分红数据。拍卖结束后由管理员计算。
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
                {isAdmin ? (
                  <input
                    className="field !w-32"
                    type="number"
                    step="0.01"
                    value={entry.amount}
                    onChange={(e) =>
                      updateAmount(entry.id, Number(e.target.value))
                    }
                  />
                ) : (
                  <p className="text-lg font-semibold text-[var(--accent-gold)]">
                    ¥{entry.amount.toFixed(2)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isAdmin && calculated && (
          <section className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              临时加人调整
            </h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                className="field"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">选择成员</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                className="field sm:max-w-[140px]"
                type="number"
                step="0.01"
                placeholder="金额"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <button
                type="button"
                className="btn-primary sm:max-w-[120px]"
                disabled={busy || !memberId || !(amount > 0)}
                onClick={addTemporary}
              >
                添加
              </button>
            </div>
          </section>
        )}

        {showAdmin && (
          <AdminLoginModal
            onClose={() => setShowAdmin(false)}
            onSuccess={() => {
              setShowAdmin(false);
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
