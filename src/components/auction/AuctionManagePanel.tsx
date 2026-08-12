"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuctionItem, AuctionRoomState, Member } from "@/lib/types";
import { formatCountdown, todayAtTime } from "@/lib/auction/client";
import { qualityMeta } from "@/lib/auction/client";
import { AddAuctionItemForm } from "./AddAuctionItemForm";
import { hubPath } from "@/lib/nav";

export function AuctionManagePanel({
  initialMembers,
  adminName,
}: {
  initialMembers: Member[];
  adminName: string;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<AuctionRoomState | null>(null);
  const [startTime, setStartTime] = useState("15:00");
  const [duration, setDuration] = useState(30);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auction/session");
    const data = await res.json();
    if (res.ok) {
      setRoom(data.room);
      if (data.room?.settings?.defaultStartTime) {
        setStartTime(data.room.settings.defaultStartTime);
      }
      if (data.room?.session?.durationMinutes) {
        setDuration(data.room.session.durationMinutes);
      } else if (data.room?.settings?.durationMinutes) {
        setDuration(data.room.settings.durationMinutes);
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/auction/session");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setRoom(data.room);
      if (data.room?.settings?.defaultStartTime) {
        setStartTime(data.room.settings.defaultStartTime);
      }
      if (data.room?.session?.durationMinutes) {
        setDuration(data.room.session.durationMinutes);
      } else if (data.room?.settings?.durationMinutes) {
        setDuration(data.room.settings.durationMinutes);
      }
    };
    const timeout = window.setTimeout(() => {
      void tick();
    }, 0);
    const timer = window.setInterval(() => {
      void tick();
    }, 4000);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    };
  }, []);

  async function saveSchedule() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const scheduledStart = todayAtTime(startTime);
      const res = await fetch("/api/auction/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultStartTime: startTime,
          durationMinutes: duration,
          scheduledStart,
          sessionDurationMinutes: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存失败");
        return;
      }
      setRoom(data.room);
      setMessage(`已设置今日 ${startTime} 开始，时长 ${duration} 分钟`);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function sessionAction(action: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失败");
        return;
      }
      setRoom(data.room);
      const labels: Record<string, string> = {
        start: "拍卖已开始",
        next: "已进入下一件拍品",
        end: "拍卖已结束",
        create: "已创建新场次",
      };
      setMessage(labels[action] || "完成");
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: number) {
    if (!window.confirm("确认删除该拍品？")) return;
    const res = await fetch(`/api/auction/items?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    setRoom(data.room);
  }

  const session = room?.session;
  const items: AuctionItem[] = room?.items ?? [];

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">拍卖管理</p>
            <h1 className="mt-1 text-2xl font-bold">设置与拍品</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              管理员：{adminName} · 仅管理员可在此后台管理拍卖物品
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
              onClick={() => router.push("/auction/dividends")}
            >
              分红统计
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push(hubPath(false, true))}
            >
              返回导航
            </button>
          </div>
        </header>

        <section className="mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            场次时间（默认下午 15:00，时长 30 分钟）
          </h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">开始时间</span>
              <input
                className="field"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="block flex-1 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">时长（分钟）</span>
              <input
                className="field"
                type="number"
                min={5}
                max={180}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn-primary sm:max-w-[140px]"
              disabled={busy}
              onClick={saveSchedule}
            >
              保存时间
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-[#e23d4a] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy}
              onClick={() => sessionAction("start")}
            >
              立即开始拍卖
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={busy || session?.status !== "live"}
              onClick={() => sessionAction("next")}
            >
              下一件拍品
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={busy || session?.status !== "live"}
              onClick={() => sessionAction("end")}
            >
              结束拍卖
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={
                busy ||
                Boolean(session && session.status !== "ended")
              }
              onClick={() => sessionAction("create")}
            >
              新建场次
            </button>
          </div>

          <div className="mt-3 text-sm text-[var(--text-muted)]">
            当前状态：
            <span className="ml-1 text-[var(--text-primary)]">
              {session?.status ?? "无"}
            </span>
            {session?.status === "live" && (
              <span className="ml-3">
                剩余 {formatCountdown(room?.remainingSeconds ?? null)}
              </span>
            )}
            {session?.status === "scheduled" && session.scheduledStart && (
              <span className="ml-3">
                预约 {new Date(session.scheduledStart).toLocaleString()}
              </span>
            )}
          </div>
          {message && <p className="mt-2 text-sm text-emerald-400">{message}</p>}
          {error && (
            <p className="mt-2 text-sm text-[var(--accent-crimson)]">{error}</p>
          )}
        </section>

        <AddAuctionItemForm
          members={initialMembers}
          onCreated={() => {
            setMessage("拍品已添加");
            refresh();
          }}
        />

        <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            本场拍品（{items.length}）
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {items.length === 0 && (
              <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
                尚未添加拍品
              </li>
            )}
            {items.map((item) => {
              const q = qualityMeta(item.quality);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {item.imageData ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageData}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1c2230] text-xs text-[var(--text-muted)]">
                        无图
                      </div>
                    )}
                    <div>
                      <p className="font-medium">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: q.color }}
                        />
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        起拍 ¥{item.startPrice} · 加价 ¥{item.bidIncrement} ·{" "}
                        {item.status} · 分红 {item.dividendMemberIds.length} 人
                      </p>
                    </div>
                  </div>
                  {(item.status === "pending" || item.status === "cancelled") && (
                    <button
                      type="button"
                      className="btn-ghost text-sm text-[var(--accent-crimson)]"
                      onClick={() => removeItem(item.id)}
                    >
                      删除
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
