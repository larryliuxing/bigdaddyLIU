"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AuctionItem,
  AuctionRoomState,
  ItemQuality,
  SessionUser,
} from "@/lib/types";
import {
  formatCountdown,
  qualityMeta,
  formatBeijingDateTime,
  auctionItemStatusLabel,
} from "@/lib/auction/client";
import { GavelIcon } from "@/components/Icons";
import { DividendReportView } from "./DividendReportView";
import {
  AuctionItemLightbox,
  AuctionItemThumb,
} from "./AuctionItemImage";
import { ItemPriceStatsLine } from "./ItemPriceStatsLine";
import { isOrdinaryPinkAuction, isPinkAuction, isParticipantOnlyAuction, ORDINARY_PINK_BID_DENIED } from "@/lib/auction/pink";
import {
  buildNowPlayingDanmaku,
  parseFanfareKind,
  playBidFanfare,
  unlockBidFanfare,
} from "@/lib/auction/bidFanfare";

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

function itemStatusLabel(status: AuctionItem["status"]) {
  return auctionItemStatusLabel(status);
}

/** Keep previously loaded images when applying a lite room payload. */
function mergeRoomKeepImages(
  prev: AuctionRoomState | null,
  next: AuctionRoomState,
): AuctionRoomState {
  if (!prev) return next;
  const previousMap = new Map(prev.items.map((item) => [item.id, item]));
  const patch = (items: AuctionItem[]) =>
    items.map((item) => {
      const previous = previousMap.get(item.id);
      return {
        ...item,
        imageData: item.imageData ?? previous?.imageData ?? null,
        dividendMemberIds:
          item.dividendMemberIds.length > 0
            ? item.dividendMemberIds
            : (previous?.dividendMemberIds ?? []),
        dividendMemberNames:
          item.dividendMemberNames.length > 0
            ? item.dividendMemberNames
            : (previous?.dividendMemberNames ?? []),
        priceStats: item.priceStats ?? previous?.priceStats ?? null,
      };
    });
  return {
    ...next,
    items: patch(next.items),
    activeItems: patch(next.activeItems),
    activeItem: next.activeItem
      ? patch([next.activeItem])[0]
      : null,
  };
}

export function AuctionRoom({
  member,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<AuctionRoomState | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [bidDrafts, setBidDrafts] = useState<
    Record<number, { value: string; touched: boolean }>
  >({});
  const [biddingId, setBiddingId] = useState<number | null>(null);
  const [pinkBusy, setPinkBusy] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{
    imageData: string;
    name: string;
    quality?: ItemQuality | null;
    detail?: string | null;
  } | null>(null);
  const [danmaku, setDanmaku] = useState<
    Array<{ id: string; text: string; top: number; variant: "bid" | "track" }>
  >([]);
  const staticItemsKeyRef = useRef("");
  const staticSessionStatusRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastEventIdRef = useRef(0);
  const eventsBootstrapped = useRef(false);
  const remainingActive = remaining != null;
  const DANMAKU_MS = 12000;

  function pushDanmaku(
    text: string,
    key: string,
    variant: "bid" | "track",
    top: number,
  ) {
    setDanmaku((prev) => [
      ...prev.filter((d) => d.id !== key).slice(-10),
      { id: key, text, top, variant },
    ]);
    window.setTimeout(() => {
      setDanmaku((prev) => prev.filter((d) => d.id !== key));
    }, DANMAKU_MS);
  }

  useEffect(() => {
    const unlock = () => {
      void unlockBidFanfare();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Play fanfare + dual danmaku for everyone when a high bid lands
  useEffect(() => {
    const events = room?.recentEvents ?? [];
    if (!events.length) return;
    const newestFirst = events;
    const maxId = Math.max(...newestFirst.map((e) => e.id));
    if (!eventsBootstrapped.current) {
      eventsBootstrapped.current = true;
      lastEventIdRef.current = maxId;
      return;
    }
    const fresh = newestFirst
      .filter((e) => e.id > lastEventIdRef.current)
      .sort((a, b) => a.id - b.id);
    lastEventIdRef.current = maxId;
    for (const ev of fresh) {
      const tier = parseFanfareKind(ev.kind);
      if (!tier) continue;
      const lane = 12 + Math.floor(Math.random() * 28);
      pushDanmaku(ev.message, `bid-${ev.id}`, "bid", lane);
      pushDanmaku(
        buildNowPlayingDanmaku(tier),
        `track-${ev.id}`,
        "track",
        Math.min(70, lane + 18),
      );
      if (soundOn) void playBidFanfare(tier);
    }
  }, [room?.recentEvents, soundOn]);

  useEffect(() => {
    let alive = true;
    let timer: number | null = null;
    const liveRef = { current: false };

    const loadImages = async (sessionId: number) => {
      const res = await fetch(
        `/api/auction/session?sessions=0&images=1&sessionId=${sessionId}`,
      );
      const data = await res.json();
      if (!alive || !res.ok || data.sessionId !== sessionId) return;
      const imageMap = new Map<number, string | null>(
        (data.images || []).map(
          (image: { id: number; imageData: string | null }) => [
            image.id,
            image.imageData,
          ],
        ),
      );
      setRoom((prev) => {
        if (!prev || prev.session?.id !== sessionId) return prev;
        const patch = (items: AuctionItem[]) =>
          items.map((item) => ({
            ...item,
            imageData: imageMap.get(item.id) ?? item.imageData,
          }));
        return {
          ...prev,
          items: patch(prev.items),
          activeItems: patch(prev.activeItems),
          activeItem: prev.activeItem
            ? patch([prev.activeItem])[0]
            : null,
        };
      });
    };

    const bootstrap = async () => {
      const res = await fetch(
        "/api/auction/session?sessions=0&bootstrap=1",
      );
      const data = await res.json();
      if (!alive || !res.ok) return null;
      liveRef.current = data.room?.session?.status === "live";
      staticItemsKeyRef.current = (data.room?.items ?? [])
        .map((item: AuctionItem) => item.id)
        .join(",");
      staticSessionStatusRef.current = data.room?.session?.status ?? null;
      setRoom(data.room);
      setRemaining(data.room.remainingSeconds);
      if (data.room?.session?.id) {
        void loadImages(data.room.session.id);
      }
      return data.room as AuctionRoomState;
    };

    const tick = async () => {
      const res = await fetch(
        "/api/auction/session?sessions=0&lite=1",
      );
      const data = await res.json();
      if (!alive || !res.ok) return;
      const nextKey = (data.room?.items ?? [])
        .map((item: AuctionItem) => item.id)
        .join(",");
      const nextStatus = data.room?.session?.status ?? null;
      if (
        nextKey !== staticItemsKeyRef.current ||
        nextStatus !== staticSessionStatusRef.current
      ) {
        await bootstrap();
        return;
      }
      liveRef.current = data.room?.session?.status === "live";
      setRoom((prev) => mergeRoomKeepImages(prev, data.room));
      setRemaining(data.room.remainingSeconds);
    };

    const schedule = () => {
      timer = window.setTimeout(() => {
        void tick().finally(() => {
          if (alive) schedule();
        });
      }, liveRef.current ? 800 : 2500);
    };

    void bootstrap().finally(() => {
      if (alive) schedule();
    });

    return () => {
      alive = false;
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!remainingActive) return;
    const timer = window.setInterval(() => {
      setRemaining((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remainingActive]);

  const session = room?.session;
  const live = session?.status === "live";
  const waiting =
    !session || session.status === "draft" || session.status === "scheduled";
  const activeItems = room?.activeItems ?? [];

  function draftValue(item: AuctionItem) {
    const min = isPinkAuction(item.quality)
      ? (item.bidMin ?? item.startPrice)
      : (room?.minNextBids?.[item.id] ?? item.startPrice);
    const draft = bidDrafts[item.id];
    if (draft?.touched) return draft.value;
    return String(min);
  }

  function playBidSound() {
    if (!soundOn) return;
    try {
      const ctx =
        audioCtxRef.current ??
        new AudioContext();
      audioCtxRef.current = ctx;
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

  async function placeBid(itemId: number) {
    setError("");
    setBiddingId(itemId);
    const target =
      activeItems.find((i) => i.id === itemId) ||
      ({ id: itemId, startPrice: 0 } as AuctionItem);
    const amount = Number(draftValue(target));

    // Optimistic local bump so the bidder sees the new price immediately.
    if (member && Number.isFinite(amount) && amount > 0) {
      const pink = isPinkAuction(target.quality);
      setRoom((prev) => {
        if (!prev) return prev;
        const patchItem = (item: AuctionItem) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                currentPrice: pink
                  ? Math.max(item.currentPrice, amount)
                  : amount,
                leadingBidderId: member.id,
                leadingBidderName: member.name,
                standingBids: pink
                  ? [
                      ...(item.standingBids ?? []).filter(
                        (bid) => bid.memberId !== member.id,
                      ),
                      {
                        memberId: member.id,
                        memberName: member.name,
                        amount,
                      },
                    ].sort((a, b) => b.amount - a.amount || a.memberId - b.memberId)
                  : item.standingBids,
              };
        return {
          ...prev,
          items: prev.items.map(patchItem),
          activeItems: prev.activeItems.map(patchItem),
          activeItem: prev.activeItem
            ? patchItem(prev.activeItem)
            : null,
          minNextBids: {
            ...prev.minNextBids,
            [itemId]: pink
              ? (target.bidMin ?? target.startPrice)
              : amount +
                (prev.activeItems.find((i) => i.id === itemId)?.bidIncrement ??
                  target.bidIncrement ??
                  5),
          },
        };
      });
      setBidDrafts((prev) => ({
        ...prev,
        [itemId]: { value: "", touched: false },
      }));
    }

    try {
      const res = await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "出价失败");
        // Refresh authoritative state after rejected optimistic update
        const refresh = await fetch(
          "/api/auction/session?sessions=0&lite=1",
        );
        const refreshData = await refresh.json();
        if (refresh.ok) {
          setRoom((prev) => mergeRoomKeepImages(prev, refreshData.room));
          setRemaining(refreshData.room.remainingSeconds);
        }
        return;
      }
      setRoom((prev) => mergeRoomKeepImages(prev, data.room));
      setRemaining(data.room.remainingSeconds);
      setToast(
        data.bid?.memberName
          ? `${data.bid.memberName} 出价 ¥${data.bid.amount}`
          : "出价成功",
      );
      // Tiny beep only for normal bids; high tiers use fanfare via event sync
      if (!(data.bid?.amount > 300)) playBidSound();
      window.setTimeout(() => setToast(""), 1600);
    } finally {
      setBiddingId(null);
    }
  }

  async function votePink(itemId: number, candidateId: number) {
    setError("");
    setPinkBusy(itemId);
    try {
      const res = await fetch("/api/auction/pink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", itemId, candidateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "投票失败");
        return;
      }
      setRoom((prev) => mergeRoomKeepImages(prev, data.room));
      setToast("已投票（匿名）");
      window.setTimeout(() => setToast(""), 1600);
    } finally {
      setPinkBusy(null);
    }
  }

  async function rollPink(itemId: number) {
    setError("");
    setPinkBusy(itemId);
    try {
      const res = await fetch("/api/auction/pink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "roll", itemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "掷点失败");
        return;
      }
      setRoom((prev) => mergeRoomKeepImages(prev, data.room));
      setToast(`掷出 ${data.points} 点`);
      window.setTimeout(() => setToast(""), 1800);
    } finally {
      setPinkBusy(null);
    }
  }

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <div className="grid-bg" />

        <header className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="feature-icon !h-9 !w-9"
              style={{ background: "#3a1f1f" }}
            >
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
              分红公示
            </button>
          </div>
        </header>

        <section className="relative z-10 mb-4 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.92)] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-medium">动态</h2>
              <span className="text-xs text-[var(--text-muted)]">可滚动回看</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(live || session?.status === "scheduled") && (
                <span className="rounded-lg border border-[var(--border-soft)] px-2.5 py-1 text-sm tabular-nums">
                  {room?.remainingLabel ?? (live ? "本场剩余" : "距开始")}{" "}
                  <strong>{formatCountdown(remaining)}</strong>
                </span>
              )}
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={soundOn}
                  onChange={(e) => {
                    setSoundOn(e.target.checked);
                    if (e.target.checked) void unlockBidFanfare();
                  }}
                />
                出价音效
              </label>
            </div>
          </div>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-1 text-sm text-[var(--text-muted)] sm:max-h-72">
            {(room?.recentEvents ?? []).length === 0 && <li>暂无动态</li>}
            {(room?.recentEvents ?? []).map((ev) => (
              <li
                key={ev.id}
                className={
                  parseFanfareKind(ev.kind)
                    ? "font-medium text-[var(--accent-gold)]"
                    : undefined
                }
              >
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

        {error && (
          <p className="relative z-10 mb-3 text-sm text-[var(--accent-crimson)]">
            {error}
          </p>
        )}

        <section className="relative z-10 space-y-3">
          {waiting && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] py-16 text-center">
              <HourglassIcon />
              <p className="mt-4 text-lg font-medium">暂无进行中的拍卖</p>
              <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
                请等待管理员开始拍卖，或查看历史记录
                {session?.status === "scheduled" && session.scheduledStart
                  ? `（预约 ${formatBeijingDateTime(session.scheduledStart)} 北京时间）`
                  : ""}
              </p>
              {(room?.items?.length ?? 0) > 0 && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  本场已备拍品 {room!.items.length} 件，开拍后将同时竞拍
                </p>
              )}
            </div>
          )}

          {live && activeItems.length === 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] py-10 text-center text-[var(--text-muted)]">
              本场暂无竞拍中的拍品
            </div>
          )}

          {live &&
            activeItems.map((item) => {
              const q = qualityMeta(item.quality);
              const min = room?.minNextBids?.[item.id] ?? item.startPrice;
              const isMine =
                member != null && item.leadingBidderId === member.id;
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <AuctionItemThumb
                      imageData={item.imageData}
                      name={item.name}
                      quality={item.quality}
                      className="mx-auto h-28 w-28 sm:mx-0"
                      onOpen={(payload) =>
                        setViewer({
                          ...payload,
                          detail: `当前 ¥${item.currentPrice}${
                            item.leadingBidderName
                              ? ` · ${item.leadingBidderName}`
                              : ""
                          }`,
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-bold">
                            <span
                              className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                              style={{ background: q.color }}
                            />
                            {item.name}
                          </h3>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {isPinkAuction(item.quality)
                              ? `特殊粉色限价 ¥${item.bidMin ?? item.startPrice}～¥${item.bidMax ?? "-"} · 仅参与者可出价`
                              : isOrdinaryPinkAuction(item.quality)
                                ? `普通粉色 · 起拍 ¥${item.startPrice} · 加价 ¥${item.bidIncrement} · 仅参与者可出价`
                                : `起拍 ¥${item.startPrice} · 加价 ¥${item.bidIncrement}`}
                          </p>
                          <ItemPriceStatsLine
                            stats={item.priceStats}
                            className="mt-1"
                          />
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {isParticipantOnlyAuction(item.quality)
                              ? "参与者："
                              : "分红人员："}
                            {item.dividendMemberNames.length > 0
                              ? item.dividendMemberNames.join("、")
                              : "未设置"}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
                          {itemStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-3 text-2xl font-bold text-[var(--accent-gold)]">
                        ¥{item.currentPrice}
                      </p>
                      {!isPinkAuction(item.quality) && (
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {item.leadingBidderName ? (
                            <>
                              当前出价：
                              <span
                                className={
                                  isMine
                                    ? "font-medium text-[var(--accent-gold)]"
                                    : "font-medium text-[var(--text-primary)]"
                                }
                              >
                                {item.leadingBidderName}
                                {isMine ? "（我）" : ""}
                              </span>
                            </>
                          ) : (
                            "暂无出价"
                          )}
                        </p>
                      )}
                      {isPinkAuction(item.quality) &&
                        (item.standingBids?.length ?? 0) > 0 && (
                          <ul className="mt-2 space-y-1 text-sm">
                            {item.standingBids!.map((bid) => (
                              <li key={bid.memberId}>
                                <span
                                  className={
                                    member?.id === bid.memberId
                                      ? "text-[var(--accent-gold)]"
                                      : ""
                                  }
                                >
                                  {bid.memberName}
                                  {member?.id === bid.memberId ? "（我）" : ""}
                                </span>
                                {" · "}¥{bid.amount}
                              </li>
                            ))}
                          </ul>
                        )}
                      {item.status === "active" && member && (
                        isParticipantOnlyAuction(item.quality) &&
                        item.dividendMemberIds.length > 0 &&
                        !item.dividendMemberIds.includes(member.id) ? (
                          <p className="mt-3 text-sm text-[var(--text-muted)]">
                            {isOrdinaryPinkAuction(item.quality)
                              ? ORDINARY_PINK_BID_DENIED
                              : "仅本拍品参与者可以出价"}
                          </p>
                        ) : (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <input
                              className="field"
                              type="number"
                              min={
                                isPinkAuction(item.quality)
                                  ? (item.bidMin ?? item.startPrice)
                                  : min
                              }
                              max={
                                isPinkAuction(item.quality)
                                  ? (item.bidMax ?? undefined)
                                  : undefined
                              }
                              step={
                                isPinkAuction(item.quality)
                                  ? 1
                                  : item.bidIncrement
                              }
                              value={draftValue(item)}
                              onChange={(e) =>
                                setBidDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    value: e.target.value,
                                    touched: true,
                                  },
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="rounded-xl bg-[#e23d4a] px-5 py-3 text-sm font-semibold sm:min-w-[120px] disabled:opacity-50"
                              disabled={biddingId === item.id}
                              onClick={() => placeBid(item.id)}
                            >
                              {biddingId === item.id ? "出价中…" : "出价"}
                            </button>
                          </div>
                        )
                      )}
                      {item.status === "active" && !member && (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          请以成员身份登录后出价
                        </p>
                      )}
                      {item.status === "voting" && (
                        <div className="mt-3 space-y-2">
                          <p className="text-sm text-[var(--accent-violet)]">
                            匿名投票中
                            {item.voteNeed
                              ? ` · ${item.voteCastCount ?? 0}/${item.voteNeed}`
                              : ""}
                            {item.voteEndsAt
                              ? ` · 截止 ${formatBeijingDateTime(item.voteEndsAt)}`
                              : ""}
                          </p>
                          {member &&
                          item.dividendMemberIds.includes(member.id) ? (
                            <div className="flex flex-wrap gap-2">
                              {(item.standingBids ?? []).map((bid) => {
                                const mine =
                                  item.myVoteCandidateId === bid.memberId;
                                return (
                                  <button
                                    key={bid.memberId}
                                    type="button"
                                    className={`rounded-xl px-3 py-2 text-sm ${
                                      mine
                                        ? "bg-[#2a3350] text-white"
                                        : "btn-ghost"
                                    }`}
                                    disabled={pinkBusy === item.id}
                                    onClick={() =>
                                      votePink(item.id, bid.memberId)
                                    }
                                  >
                                    {bid.memberName} ¥{bid.amount}
                                    {mine ? " · 已选" : ""}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-[var(--text-muted)]">
                              仅参与者可投票，其他人可看出价
                            </p>
                          )}
                        </div>
                      )}
                      {item.status === "rolling" && (
                        <div className="mt-3 space-y-2">
                          <p className="text-sm text-[var(--accent-gold)]">
                            同票同价，掷 1–100 点（不可重复，先掷到先占有）
                          </p>
                          <ul className="text-sm text-[var(--text-muted)]">
                            {(item.rolls ?? []).map((row) => (
                              <li key={row.memberId}>
                                {row.memberName}：{row.points} 点
                              </li>
                            ))}
                          </ul>
                          {member &&
                          item.tiedMemberIds?.includes(member.id) &&
                          item.myRollPoints == null ? (
                            <button
                              type="button"
                              className="rounded-xl bg-[#e23d4a] px-5 py-3 text-sm font-semibold disabled:opacity-50"
                              disabled={pinkBusy === item.id}
                              onClick={() => rollPink(item.id)}
                            >
                              {pinkBusy === item.id ? "掷点中…" : "掷点"}
                            </button>
                          ) : item.myRollPoints != null ? (
                            <p className="text-sm">
                              你掷出 {item.myRollPoints} 点
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

          {session?.status === "ended" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-5 text-center">
                <p className="text-lg font-medium">本场拍卖已结束</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  下方为本场拍品结果与分红公示，打开本场即可查看成交与自己的分红。
                </p>
              </div>
              {(room?.items?.length ?? 0) > 0 && (
                <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
                  <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-medium">
                    拍品结果
                  </div>
                  <ul className="divide-y divide-[var(--border-soft)]">
                    {room!.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <AuctionItemThumb
                            imageData={item.imageData}
                            name={item.name}
                            quality={item.quality}
                            className="h-12 w-12 shrink-0"
                            onOpen={(payload) =>
                              setViewer({
                                ...payload,
                                detail:
                                  item.soldPrice != null
                                    ? `成交 ¥${item.soldPrice}${
                                        item.winnerName
                                          ? ` · ${item.winnerName}`
                                          : ""
                                      }`
                                    : itemStatusLabel(item.status),
                              })
                            }
                          />
                          <span className="truncate">
                            <span
                              className="mr-2 inline-block h-2 w-2 rounded-full"
                              style={{
                                background: qualityMeta(item.quality).color,
                              }}
                            />
                            {item.name}
                          </span>
                        </div>
                        <span className="shrink-0 text-[var(--text-muted)]">
                          {itemStatusLabel(item.status)}
                          {item.soldPrice != null
                            ? ` · ¥${item.soldPrice}`
                            : ""}
                          {item.winnerName ? ` · ${item.winnerName}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <DividendReportView
                report={room?.dividendReport ?? null}
                editable={false}
                highlightMemberId={member?.id ?? null}
              />
            </div>
          )}
        </section>

        <p className="relative z-10 mt-6 text-center text-xs text-[var(--text-muted)]">
          不提倡倒爷。本场拍品同时竞拍；出价实名显示。
        </p>

        {toast && (
          <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--border-soft)] bg-[#1a2030] px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        )}

        <div className="pointer-events-none fixed inset-x-0 top-14 z-[60] h-56 overflow-hidden">
          {danmaku.map((d) => (
            <div
              key={d.id}
              className={`auction-danmaku absolute whitespace-nowrap rounded-full border px-4 py-2 font-bold shadow-lg ${
                d.variant === "track"
                  ? "border-[rgba(123,108,255,0.45)] bg-[rgba(30,24,55,0.88)] text-[var(--accent-violet)]"
                  : "border-[rgba(232,168,74,0.45)] bg-[rgba(28,22,12,0.88)] text-[var(--accent-gold)]"
              }`}
              style={{ top: `${d.top}%` }}
            >
              {d.text}
            </div>
          ))}
        </div>

        {viewer && (
          <AuctionItemLightbox
            open
            imageData={viewer.imageData}
            name={viewer.name}
            quality={viewer.quality}
            detail={viewer.detail}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
    </div>
  );
}
