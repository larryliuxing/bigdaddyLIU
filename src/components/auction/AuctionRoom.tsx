"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuctionRoomState, SessionUser } from "@/lib/types";
import { formatCountdown, qualityMeta } from "@/lib/auction/client";
import { GavelIcon } from "@/components/Icons";

function HourglassIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h10M7 21h10M8 3c0 4 3 5.5 4 7s4 3 4 7M16 3c0 4-3 5.5-4 7s-4 3-4 7"
        stroke="#8b93a7"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AuctionRoom({
  member,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<AuctionRoomState | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const remainingActive = remaining != null;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/auction/session");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setRoom(data.room);
      setRemaining(data.room.remainingSeconds);
    };
    const timeout = window.setTimeout(() => {
      void tick();
    }, 0);
    const timer = window.setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!remainingActive) return;
    const timer = window.setInterval(() => {
      setRemaining((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remainingActive]);

  const minBid = room?.minNextBid ?? 0;

  const activeItemId = room?.activeItem?.id ?? null;
  const [bidDraft, setBidDraft] = useState({
    itemId: null as number | null,
    value: "",
    touched: false,
  });
  const draftForItem =
    bidDraft.itemId === activeItemId
      ? bidDraft
      : { itemId: activeItemId, value: "", touched: false };
  const bidAmountValue = draftForItem.touched
    ? draftForItem.value
    : minBid
      ? String(minBid)
      : "";

  async function placeBid() {
    setError("");
    const amount = Number(bidAmountValue);
    const res = await fetch("/api/auction/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, isAnonymous: anonymous }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "出价失败");
      return;
    }
    setRoom(data.room);
    setRemaining(data.room.remainingSeconds);
    setBidDraft({ itemId: activeItemId, value: "", touched: false });
    setToast("出价成功");
    if (soundOn) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.04;
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => setToast(""), 1600);
  }

  const session = room?.session;
  const active = room?.activeItem;
  const live = session?.status === "live";
  const waiting = !session || session.status === "draft" || session.status === "scheduled";

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <div className="grid-bg" />

        <header className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="feature-icon !h-9 !w-9" style={{ background: "#3a1f1f" }}>
              <GavelIcon />
            </span>
            <h1 className="text-xl font-bold">拍卖</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push(member ? "/home" : "/admin")}
            >
              返回导航
            </button>
            <span className="rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-[var(--text-muted)]">
              当前身份：{member?.name ?? "未登录"}
            </span>
            <label className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              匿名模式
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push("/auction/history")}
            >
              历史
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push("/auction/dividends")}
            >
              分红统计
            </button>
          </div>
        </header>

        <section className="relative z-10 mb-4 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.92)] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">动态</h2>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => setSoundOn(e.target.checked)}
              />
              出价提示音
              <span className="ml-2 opacity-70">最近最多 8 条</span>
            </label>
          </div>
          <ul className="space-y-1.5 text-sm text-[var(--text-muted)]">
            {(room?.recentEvents ?? []).length === 0 && (
              <li>暂无动态</li>
            )}
            {(room?.recentEvents ?? []).map((ev) => (
              <li key={ev.id}>
                <span className="mr-2 text-xs opacity-70">
                  {new Date(ev.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {ev.message}
              </li>
            ))}
          </ul>
        </section>

        <section className="relative z-10 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-5">
          {waiting && !active && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <HourglassIcon />
              <p className="mt-4 text-lg font-medium">暂无进行中的拍卖</p>
              <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
                请等待管理员开始拍卖，或查看历史记录
                {session?.status === "scheduled" && session.scheduledStart
                  ? `（预约 ${new Date(session.scheduledStart).toLocaleString()}）`
                  : ""}
              </p>
            </div>
          )}

          {live && active && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">当前拍品</p>
                  <h3 className="mt-1 text-2xl font-bold">
                    <span
                      className="mr-2 inline-block h-3 w-3 rounded-full"
                      style={{ background: qualityMeta(active.quality).color }}
                    />
                    {active.name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    起拍 ¥{active.startPrice} · 加价 ¥{active.bidIncrement}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-soft)] px-4 py-2 text-center">
                  <p className="text-xs text-[var(--text-muted)]">本场剩余</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatCountdown(remaining)}
                  </p>
                </div>
              </div>

              {active.imageData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.imageData}
                  alt={active.name}
                  className="mx-auto max-h-56 rounded-xl object-contain"
                />
              )}

              <div className="rounded-xl bg-[#121826] px-4 py-3">
                <p className="text-sm text-[var(--text-muted)]">当前价</p>
                <p className="text-3xl font-bold text-[var(--accent-gold)]">
                  ¥{active.currentPrice}
                </p>
              </div>

              {member ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="field"
                    type="number"
                    min={minBid}
                    step={active.bidIncrement}
                    value={bidAmountValue}
                    onChange={(e) =>
                      setBidDraft({
                        itemId: activeItemId,
                        value: e.target.value,
                        touched: true,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-[#e23d4a] px-5 py-3 text-sm font-semibold sm:min-w-[120px]"
                    onClick={placeBid}
                  >
                    出价
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  请以成员身份登录后出价
                </p>
              )}
              {error && (
                <p className="text-sm text-[var(--accent-crimson)]">{error}</p>
              )}
            </div>
          )}

          {session?.status === "ended" && (
            <div className="py-10 text-center">
              <p className="text-lg font-medium">本场拍卖已结束</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                可前往分红统计查看结果
              </p>
              <button
                type="button"
                className="btn-primary mt-4 max-w-xs"
                onClick={() => router.push("/auction/dividends")}
              >
                查看分红
              </button>
            </div>
          )}

          {live && !active && (
            <div className="py-10 text-center text-[var(--text-muted)]">
              等待管理员切换下一件拍品…
            </div>
          )}
        </section>

        <p className="relative z-10 mt-6 text-center text-xs text-[var(--text-muted)]">
          不提倡倒爷。
        </p>

        {toast && (
          <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--border-soft)] bg-[#1a2030] px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
