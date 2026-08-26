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
} from "@/lib/auction/client";
import { qualityExtendHint } from "@/lib/auction/bidExtend";
import { GavelIcon } from "@/components/Icons";
import { DividendReportView } from "./DividendReportView";
import {
  AuctionItemLightbox,
  AuctionItemThumb,
} from "./AuctionItemImage";
import { ItemPriceStatsLine } from "./ItemPriceStatsLine";
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
  if (status === "active") return "竞拍中";
  if (status === "sold") return "已成交";
  if (status === "unsold") return "流拍";
  if (status === "cancelled") return "已取消";
  return "待开拍";
}

function AuctionLotCard({
  item,
  canBid,
  memberName,
  memberId,
  minBid,
  draftValue,
  bidding,
  onDraftChange,
  onBid,
  onOpenImage,
}: {
  item: AuctionItem;
  canBid: boolean;
  memberName?: string | null;
  memberId?: number | null;
  minBid: number;
  draftValue: string;
  bidding: boolean;
  onDraftChange: (value: string) => void;
  onBid: () => void;
  onOpenImage: (payload: {
    imageData: string;
    name: string;
    quality?: ItemQuality | null;
  }) => void;
}) {
  const q = qualityMeta(item.quality);
  const isMine = memberId != null && item.leadingBidderId === memberId;
  const extendHint = qualityExtendHint(item.quality);
  return (
    <article className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <AuctionItemThumb
          imageData={item.imageData}
          name={item.name}
          quality={item.quality}
          className="mx-auto h-28 w-28 sm:mx-0"
          onOpen={(payload) =>
            onOpenImage({
              ...payload,
              quality: item.quality,
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
                起拍 ¥{item.startPrice} · 加价 ¥{item.bidIncrement}
              </p>
              <ItemPriceStatsLine stats={item.priceStats} className="mt-1" />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                分红人员：
                {item.dividendMemberNames.length > 0
                  ? item.dividendMemberNames.join("、")
                  : "未设置"}
              </p>
              {extendHint && (
                <p className="mt-1 text-xs text-[var(--accent-gold)]">
                  {extendHint}
                </p>
              )}
            </div>
            <span
              className={
                canBid
                  ? "rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300"
                  : "rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-200"
              }
            >
              {canBid ? "竞拍中" : "待开拍"}
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-[var(--accent-gold)]">
            ¥{item.currentPrice}
          </p>
          {canBid ? (
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
          ) : (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              开拍前可查看拍品，到点后才能出价
            </p>
          )}
          {canBid ? (
            memberName ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="field"
                  type="number"
                  min={minBid}
                  step={item.bidIncrement}
                  value={draftValue}
                  onChange={(e) => onDraftChange(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-xl bg-[#e23d4a] px-5 py-3 text-sm font-semibold sm:min-w-[120px] disabled:opacity-50"
                  disabled={bidding}
                  onClick={onBid}
                >
                  {bidding ? "出价中…" : "出价"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                请以成员身份登录后出价
              </p>
            )
          ) : (
            <button
              type="button"
              className="mt-3 rounded-xl bg-[#e23d4a] px-5 py-3 text-sm font-semibold opacity-40 sm:min-w-[120px]"
              disabled
            >
              未开拍，暂不可出价
            </button>
          )}
        </div>
      </div>
    </article>
  );
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
  const previewItems = room?.items ?? [];

  function draftValue(item: AuctionItem) {
    const min = room?.minNextBids?.[item.id] ?? item.startPrice;
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
      setRoom((prev) => {
        if (!prev) return prev;
        const patchItem = (item: AuctionItem) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                currentPrice: amount,
                leadingBidderId: member.id,
                leadingBidderName: member.name,
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
            [itemId]:
              amount +
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
            <h2 className="text-sm font-medium">动态</h2>
            <div className="flex flex-wrap items-center gap-3">
              {(live || session?.status === "scheduled") && (
                <span className="rounded-lg border border-[var(--border-soft)] px-2.5 py-1 text-sm tabular-nums">
                  {live ? "本场剩余" : "距开始"}{" "}
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
          <ul className="space-y-1.5 text-sm text-[var(--text-muted)]">
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
            <div
              className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] text-center ${
                previewItems.length > 0 ? "px-5 py-6" : "py-16"
              }`}
            >
              {previewItems.length === 0 && <HourglassIcon />}
              <p
                className={`font-medium ${
                  previewItems.length > 0 ? "text-base" : "mt-4 text-lg"
                }`}
              >
                {previewItems.length > 0 ? "拍卖尚未开始" : "暂无进行中的拍卖"}
              </p>
              <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
                {session?.status === "scheduled" && session.scheduledStart
                  ? `预约 ${formatBeijingDateTime(session.scheduledStart)} 北京时间`
                  : "请等待管理员开始拍卖，或查看历史记录"}
              </p>
              {previewItems.length > 0 && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  本场 {previewItems.length}{" "}
                  件拍品可先查看，开拍后将同时竞拍，到点才能出价
                </p>
              )}
            </div>
          )}

          {waiting &&
            previewItems.map((item) => (
              <AuctionLotCard
                key={item.id}
                item={item}
                canBid={false}
                memberName={member?.name}
                memberId={member?.id}
                minBid={item.startPrice}
                draftValue={String(item.startPrice)}
                bidding={false}
                onDraftChange={() => undefined}
                onBid={() => undefined}
                onOpenImage={(payload) =>
                  setViewer({
                    ...payload,
                    detail: `起拍 ¥${item.startPrice} · 待开拍`,
                  })
                }
              />
            ))}

          {live && activeItems.length === 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] py-10 text-center text-[var(--text-muted)]">
              本场暂无竞拍中的拍品
            </div>
          )}

          {live &&
            activeItems.map((item) => {
              const min = room?.minNextBids?.[item.id] ?? item.startPrice;
              return (
                <AuctionLotCard
                  key={item.id}
                  item={item}
                  canBid
                  memberName={member?.name}
                  memberId={member?.id}
                  minBid={min}
                  draftValue={draftValue(item)}
                  bidding={biddingId === item.id}
                  onDraftChange={(value) =>
                    setBidDrafts((prev) => ({
                      ...prev,
                      [item.id]: { value, touched: true },
                    }))
                  }
                  onBid={() => placeBid(item.id)}
                  onOpenImage={(payload) =>
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
              );
            })}

          {session?.status === "ended" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-5 text-center">
                <p className="text-lg font-medium">本场拍卖已结束</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  下方为本场分红公示，所有人打开本场即可查看自己的分红。
                </p>
              </div>
              <DividendReportView
                report={room?.dividendReport ?? null}
                editable={false}
                highlightMemberId={member?.id ?? null}
              />
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
