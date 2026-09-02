"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardStats } from "@/lib/types";
import {
  DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
  formatThresholdPercentLabel,
} from "@/lib/leaderboard/threshold";

function formatPower(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

export function AdminLeaderboardPanel({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [percent, setPercent] = useState(DEFAULT_LEADERBOARD_THRESHOLD_PERCENT);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/leaderboard/settings");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "加载失败");
      return;
    }
    setPercent(
      Number(data.thresholdPercent) || DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
    );
    if (data.board?.stats) setStats(data.board.stats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/leaderboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdPercent: percent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "保存失败");
        return;
      }
      setPercent(Number(data.thresholdPercent) || percent);
      if (data.board?.stats) setStats(data.board.stats);
      setMessage(
        `合格线已设为平均战力的 ${formatThresholdPercentLabel(data.thresholdPercent)}%`,
      );
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  const previewLine =
    stats && stats.count > 0
      ? Math.round(stats.average * (percent / 100))
      : null;

  return (
    <div className="app-shell">
      <div className="app-frame" style={{ width: "min(100%, 840px)" }}>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">后台管理</p>
            <h1 className="mt-1 text-2xl font-bold">排行榜设置</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              管理员：{adminName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/admin")}
            >
              返回后台
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/leaderboard")}
            >
              查看排行榜
            </button>
          </div>
        </header>

        {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}
        {error && (
          <p className="mb-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        )}

        <section className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            合格战力线
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            低于「全榜平均战斗力 ×
            该百分比」视为不合格：排行榜名字标红，拍卖分红名单里也会标出。
          </p>
          <form
            onSubmit={save}
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="block flex-1 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">
                平均数的百分比（1%–100%）
              </span>
              <input
                className="field"
                type="number"
                min={1}
                max={100}
                step={0.1}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
            </label>
            <button
              type="submit"
              className="btn-primary sm:max-w-[140px]"
              disabled={busy}
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </form>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {stats && stats.count > 0 ? (
              <>
                当前平均战力{" "}
                <span className="text-[var(--accent-gold)]">
                  {formatPower(stats.average)}
                </span>
                {" · "}
                按 {formatThresholdPercentLabel(percent)}% 计算，合格线约{" "}
                <span className="text-[var(--accent-gold)]">
                  {previewLine != null ? formatPower(previewLine) : "-"}
                </span>
                （低于此值不合格）
              </>
            ) : (
              "排行榜暂无数据时，保存后下次上榜即按新百分比计算。"
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
