"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardEntry, LeaderboardStats } from "@/lib/types";
import {
  DEFAULT_LEADERBOARD_THRESHOLD_PERCENT,
  formatThresholdPercentLabel,
} from "@/lib/leaderboard/threshold";

function formatPower(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

function formatUpdatedAt(raw: string) {
  const iso = /T/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw || "-";
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function AdminLeaderboardPanel({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [percent, setPercent] = useState(DEFAULT_LEADERBOARD_THRESHOLD_PERCENT);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{
    name: string;
    power: number;
    loading: boolean;
    imageData: string | null;
    error: string | null;
  } | null>(null);

  const applyBoard = useCallback(
    (board: { entries?: LeaderboardEntry[]; stats?: LeaderboardStats } | null) => {
      if (!board) return;
      setEntries(board.entries ?? []);
      if (board.stats) setStats(board.stats);
    },
    [],
  );

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
    applyBoard(data.board ?? null);
  }, [applyBoard]);

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
      applyBoard(data.board ?? null);
      setMessage(
        `合格线已设为平均战力的 ${formatThresholdPercentLabel(data.thresholdPercent)}%`,
      );
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry: LeaderboardEntry) {
    if (
      !window.confirm(
        `确认移除「${entry.memberName}」的排行榜记录（战力 ${formatPower(entry.combatPower)}）？移除后该成员可重新上传。`,
      )
    ) {
      return;
    }
    setRemovingId(entry.memberId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/leaderboard?memberId=${entry.memberId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "移除失败");
        return;
      }
      applyBoard(data.board ?? null);
      setMessage(`已移除「${entry.memberName}」的上榜记录`);
      setViewer((cur) => (cur?.name === entry.memberName ? null : cur));
    } catch {
      setError("网络错误，移除失败");
    } finally {
      setRemovingId(null);
    }
  }

  async function openScreenshot(entry: LeaderboardEntry) {
    if (!entry.hasImage) return;
    setViewer({
      name: entry.memberName,
      power: entry.combatPower,
      loading: true,
      imageData: null,
      error: null,
    });
    try {
      const res = await fetch(
        `/api/leaderboard/image?memberId=${entry.memberId}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setViewer({
          name: entry.memberName,
          power: entry.combatPower,
          loading: false,
          imageData: null,
          error: typeof data.error === "string" ? data.error : "加载截图失败",
        });
        return;
      }
      setViewer({
        name: entry.memberName,
        power: entry.combatPower,
        loading: false,
        imageData: data.imageData,
        error: null,
      });
    } catch {
      setViewer({
        name: entry.memberName,
        power: entry.combatPower,
        loading: false,
        imageData: null,
        error: "网络错误",
      });
    }
  }

  const previewLine =
    stats && stats.count > 0
      ? Math.round(stats.average * (percent / 100))
      : null;

  const keyword = filter.trim();
  const visible = keyword
    ? entries.filter((entry) => entry.memberName.includes(keyword))
    : entries;

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

        <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-[var(--text-muted)]">
                已上榜记录
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                传错战力或点错角色名时，可在这里去掉该成员记录，对方再重新上传。
                {stats ? ` 当前 ${stats.count} 人` : ""}
              </p>
            </div>
            <input
              className="field sm:max-w-[200px]"
              placeholder="按名字筛选"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {entries.length === 0 ? (
            <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
              暂无上榜记录
            </p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-8 text-sm text-[var(--text-muted)]">
              没有匹配「{keyword}」的上榜成员
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-soft)]">
              {visible.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="mr-2 text-xs text-[var(--text-muted)]">
                        #{entry.rank}
                      </span>
                      <span
                        className={
                          entry.belowThreshold
                            ? "text-[var(--accent-crimson)]"
                            : ""
                        }
                      >
                        {entry.memberName}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      战力 {formatPower(entry.combatPower)}
                      {" · "}
                      {formatUpdatedAt(entry.updatedAt)}
                      {entry.belowThreshold ? " · 低于合格线" : ""}
                      {!entry.hasImage ? " · 无截图" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      disabled={!entry.hasImage}
                      title={
                        entry.hasImage ? "查看上传截图" : "该成员暂无上传截图"
                      }
                      onClick={() => void openScreenshot(entry)}
                    >
                      查看截图
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-sm text-[var(--accent-crimson)]"
                      disabled={removingId === entry.memberId}
                      onClick={() => void removeEntry(entry)}
                    >
                      {removingId === entry.memberId ? "移除中…" : "移除记录"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {viewer && (
        <div
          className="overlay"
          role="presentation"
          onClick={() => setViewer(null)}
        >
          <div
            className="modal-panel w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-[#151925] p-4 shadow-[var(--shadow-glow)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${viewer.name} 的战力截图`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{viewer.name}</h3>
                <p className="mt-1 text-sm text-[var(--accent-gold)]">
                  战斗力 {formatPower(viewer.power)}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => setViewer(null)}
              >
                关闭
              </button>
            </div>
            {viewer.loading && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                加载截图中…
              </p>
            )}
            {viewer.error && (
              <p className="py-6 text-center text-sm text-[var(--accent-crimson)]">
                {viewer.error}
              </p>
            )}
            {viewer.imageData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewer.imageData}
                alt={`${viewer.name} 上传的战力截图`}
                className="max-h-[70vh] w-full rounded-xl bg-black object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
