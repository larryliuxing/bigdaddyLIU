"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Boss, BossRoomState, SessionUser } from "@/lib/types";
import {
  formatBeijingDateTime,
  formatCountdown,
} from "@/lib/auction/client";
import { TimerIcon } from "@/components/Icons";
import { BossDropsLightbox } from "@/components/boss/BossDropsViewer";
import {
  playLaiLaLaoDi,
  resetBossSpawnSoundCache,
  unlockBossSpawnSound,
} from "@/lib/boss/spawnSound";

const POLL_MS = 1500;
const TICK_MS = 1000;
const POPUP_MS = 4000;
const URGENT_SECONDS = 60;

const SPARKS = [
  { sx: "-48px", sy: "-36px", left: "48%", top: "40%", delay: "0ms" },
  { sx: "52px", sy: "-28px", left: "52%", top: "38%", delay: "40ms" },
  { sx: "-36px", sy: "44px", left: "46%", top: "48%", delay: "80ms" },
  { sx: "44px", sy: "40px", left: "54%", top: "50%", delay: "120ms" },
];

function lastMarkText(boss: Boss) {
  if (!boss.lastMark) return null;
  const kind = boss.lastMark.voteType === "killed" ? "已击杀" : "未刷新";
  const names =
    boss.lastMark.members.map((m) => m.memberName).join("、") || "未知";
  return `上次${kind}：${names} · ${formatBeijingDateTime(boss.lastMark.at)}`;
}

function BossCard({
  boss,
  member,
  onVote,
  busy,
  onOpenDrops,
  soundOn,
  onSpawnReady,
  now,
}: {
  boss: Boss;
  member: Extract<SessionUser, { type: "member" }> | null;
  onVote: (bossId: number, voteType: "killed" | "not_spawned") => void;
  busy: boolean;
  onOpenDrops: (boss: Boss) => void;
  soundOn: boolean;
  onSpawnReady: (boss: Boss) => void;
  now: number;
}) {
  const [burstKey, setBurstKey] = useState(0);
  const prevRemain = useRef<number | null>(null);
  const armed = useRef(false);
  const lastSpawnAt = useRef(boss.nextSpawnAt);

  if (lastSpawnAt.current !== boss.nextSpawnAt) {
    lastSpawnAt.current = boss.nextSpawnAt;
    armed.current = false;
    prevRemain.current = null;
  }

  const remain = boss.nextSpawnAt
    ? Math.max(
        0,
        Math.floor((new Date(boss.nextSpawnAt).getTime() - now) / 1000),
      )
    : null;

  useEffect(() => {
    if (remain == null) {
      prevRemain.current = null;
      return;
    }
    if (remain > 0) {
      armed.current = true;
      prevRemain.current = remain;
      return;
    }
    if (
      armed.current &&
      prevRemain.current != null &&
      prevRemain.current > 0
    ) {
      armed.current = false;
      setBurstKey((k) => k + 1);
      onSpawnReady(boss);
      if (soundOn) playLaiLaLaoDi();
    }
    prevRemain.current = 0;
  }, [remain, boss, soundOn, onSpawnReady]);

  // Clear burst DOM after animation to avoid lingering overlays
  useEffect(() => {
    if (!burstKey) return;
    const t = window.setTimeout(() => setBurstKey(0), 2300);
    return () => window.clearTimeout(t);
  }, [burstKey]);

  const mark = lastMarkText(boss);
  const hasDrops = Boolean(boss.hasDropsImage || boss.dropsImage || boss.dropsNote);
  const isReady = remain === 0 && Boolean(boss.nextSpawnAt);
  const isUrgent = remain != null && remain > 0 && remain <= URGENT_SECONDS;

  return (
    <article
      className={`boss-card rounded-2xl p-4 ${isReady ? "is-ready" : ""} ${isUrgent ? "is-urgent" : ""}`}
      style={{ ["--boss-fx" as string]: boss.color }}
    >
      {burstKey > 0 && (
        <>
          <span key={`burst-${burstKey}`} className="boss-burst" />
          {SPARKS.map((s, i) => (
            <span
              key={`spark-${burstKey}-${i}`}
              className="boss-spark"
              style={{
                left: s.left,
                top: s.top,
                ["--sx" as string]: s.sx,
                ["--sy" as string]: s.sy,
                animationDelay: s.delay,
              }}
            />
          ))}
          <span key={`banner-${burstKey}`} className="boss-ready-banner">
            来啦老弟！
          </span>
        </>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            className="text-3xl font-extrabold tracking-wide sm:text-4xl"
            style={{ color: boss.color }}
          >
            {boss.name}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            刷新概率 {boss.spawnRate}% · 间隔 {boss.intervalHours} 小时
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-[#2b4d8f] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          disabled={!hasDrops}
          title={hasDrops ? "查看掉落说明" : "暂无掉落说明"}
          onClick={() => onOpenDrops(boss)}
        >
          查询掉落物
        </button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
        <p>最后击杀 {formatBeijingDateTime(boss.lastKillAt)}</p>
        <p>下次刷新 {formatBeijingDateTime(boss.nextSpawnAt)}</p>
        {mark ? (
          <p className="text-[var(--text-primary)]">{mark}</p>
        ) : (
          <p>还没有人点过这个 BOSS</p>
        )}
      </div>

      <div className="mt-4 text-center">
        <p
          className={`boss-countdown text-4xl font-semibold tracking-wide tabular-nums ${isReady ? "text-[var(--accent-gold)]" : ""}`}
        >
          {isReady ? "已刷新" : formatCountdown(remain)}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {!boss.nextSpawnAt
            ? "尚未设置刷新时间"
            : isReady
              ? "来啦老弟 · 可出发"
              : isUrgent
                ? "即将刷新！"
                : "距离刷新"}
        </p>
      </div>

      {member && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl bg-[#e23d4a] px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => onVote(boss.id, "killed")}
          >
            已击杀
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--border-soft)] bg-[#1c2230] px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
            disabled={busy}
            onClick={() => onVote(boss.id, "not_spawned")}
          >
            未刷新
          </button>
        </div>
      )}
    </article>
  );
}

function isTerminalVoteLog(message: string) {
  return /成功生效|已生效|已按当前时间|超时未通过|投票失败/.test(message);
}

/** Member-facing BOSS timer. Admin CRUD lives under /admin/boss. */
export function BossTimerPanel({
  member,
  compact = false,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
  compact?: boolean;
}) {
  const [room, setRoom] = useState<BossRoomState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<{
    text: string;
    tone: "ok" | "fail" | "info";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropsBoss, setDropsBoss] = useState<Boss | null>(null);
  const [dropsLoading, setDropsLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const popupTimer = useRef<number | null>(null);
  const lastSystemId = useRef(0);
  const systemBootstrapped = useRef(false);
  const showPopupRef = useRef<
    (text: string, tone?: "ok" | "fail" | "info") => void
  >(() => {});
  const aliveRef = useRef(true);

  function showPopup(text: string, tone: "ok" | "fail" | "info" = "info") {
    if (popupTimer.current) window.clearTimeout(popupTimer.current);
    setPopup({ text, tone });
    popupTimer.current = window.setTimeout(() => {
      setPopup(null);
      popupTimer.current = null;
    }, POPUP_MS);
  }
  showPopupRef.current = showPopup;

  const handleSpawnReady = useRef((boss: Boss) => {
    showPopupRef.current(`「${boss.name}」来啦老弟！`, "ok");
  }).current;

  useEffect(() => {
    aliveRef.current = true;
    const unlock = () => unlockBossSpawnSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      aliveRef.current = false;
      window.removeEventListener("pointerdown", unlock);
      if (popupTimer.current) window.clearTimeout(popupTimer.current);
    };
  }, []);

  // Shared clock — one timer for all cards
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Lite poll (no drops images) with abort + overlap guard
  useEffect(() => {
    let alive = true;
    let inFlight: AbortController | null = null;

    const tick = async () => {
      if (inFlight) return;
      const ctrl = new AbortController();
      inFlight = ctrl;
      try {
        const res = await fetch("/api/boss", { signal: ctrl.signal });
        const data = await res.json();
        if (!alive || !res.ok) return;
        setRoom(data.room);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      } finally {
        inFlight = null;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      alive = false;
      inFlight?.abort();
      window.clearInterval(timer);
    };
  }, []);

  // Only toast NEW terminal vote results (never replay history on enter)
  useEffect(() => {
    if (!room) return;
    const systems = room.chat?.filter((c) => c.memberName === "系统") ?? [];
    const last = systems[systems.length - 1];
    if (!systemBootstrapped.current) {
      systemBootstrapped.current = true;
      lastSystemId.current = last?.id ?? 0;
      return;
    }
    if (!last || last.id <= lastSystemId.current) return;
    lastSystemId.current = last.id;
    if (!isTerminalVoteLog(last.message)) return;
    const fail = /未通过|超时|失败/.test(last.message);
    showPopup(last.message, fail ? "fail" : "ok");
  }, [room]);

  async function openDrops(boss: Boss) {
    if (!boss.hasDropsImage && !boss.dropsImage && !boss.dropsNote) return;
    setDropsLoading(true);
    try {
      if (boss.dropsImage) {
        setDropsBoss(boss);
        return;
      }
      const res = await fetch(`/api/boss?dropsId=${boss.id}`);
      const data = await res.json();
      if (!res.ok) {
        showPopup(data.error || "加载掉落失败", "fail");
        return;
      }
      setDropsBoss({
        ...boss,
        dropsImage: data.dropsImage ?? null,
        dropsNote: data.dropsNote ?? boss.dropsNote,
        hasDropsImage: Boolean(data.dropsImage),
      });
    } catch {
      showPopup("加载掉落失败", "fail");
    } finally {
      setDropsLoading(false);
    }
  }

  async function vote(bossId: number, voteType: "killed" | "not_spawned") {
    setBusy(true);
    setError("");
    unlockBossSpawnSound();
    try {
      const res = await fetch("/api/boss/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bossId, voteType }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "标记失败";
        setError(msg);
        showPopup(msg, "fail");
        return;
      }
      setRoom(data.room);
      const systems =
        (data.room?.chat as BossRoomState["chat"] | undefined)?.filter(
          (c) => c.memberName === "系统",
        ) ?? [];
      const lastSystem = systems[systems.length - 1];
      if (lastSystem) lastSystemId.current = lastSystem.id;

      const label = voteType === "killed" ? "已击杀" : "未刷新";
      showPopup(
        lastSystem?.message ||
          `已标记「${label}」，倒计时已按当前时间重开`,
        "ok",
      );
    } catch {
      setError("网络错误");
      showPopup("网络错误，标记失败", "fail");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const res = await fetch("/api/boss/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: chatInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "发送失败");
      return;
    }
    setChatInput("");
    setRoom(data.room);
  }

  function goHome() {
    aliveRef.current = false;
    if (popupTimer.current) {
      window.clearTimeout(popupTimer.current);
      popupTimer.current = null;
    }
    setPopup(null);
    setDropsBoss(null);
    // Hard navigate so a jammed React tree cannot block leaving
    window.location.assign(member ? "/home" : "/admin");
  }

  const systemLogs = useMemo(
    () => (room?.chat ?? []).filter((c) => c.memberName === "系统").slice(-8),
    [room?.chat],
  );

  const bosses = useMemo(() => {
    const list = [...(room?.bosses ?? [])];
    const remainOf = (boss: Boss) => {
      if (!boss.nextSpawnAt) return null;
      return Math.max(
        0,
        Math.floor((new Date(boss.nextSpawnAt).getTime() - now) / 1000),
      );
    };
    list.sort((a, b) => {
      const ra = remainOf(a);
      const rb = remainOf(b);
      if (ra == null && rb == null) {
        return a.sortOrder - b.sortOrder || a.id - b.id;
      }
      if (ra == null) return 1;
      if (rb == null) return -1;
      if (ra !== rb) return ra - rb;
      return a.sortOrder - b.sortOrder || a.id - b.id;
    });
    return list;
  }, [room?.bosses, now]);

  return (
    <div className="app-shell">
      <div className={compact ? "app-frame" : "auction-frame"}>
        <div className="grid-bg" />

        <header className="relative z-10 mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="feature-icon !h-9 !w-9"
                style={{ background: "#243048" }}
              >
                <TimerIcon />
              </span>
              <h1 className="text-2xl font-bold">内部计时器</h1>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#1c2230] px-2.5 py-1 text-[var(--text-muted)]">
                在线 {room?.onlineCount ?? 0} 人
              </span>
              <span className="rounded-full bg-[#1f3d2d] px-2.5 py-1 text-emerald-300">
                已连接 · {member?.name ?? "游客"}
              </span>
            </div>
          </div>
          <div className="relative z-20 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => {
                unlockBossSpawnSound();
                setSoundOn((v) => !v);
              }}
              title={soundOn ? "关闭刷新音效" : "开启刷新音效"}
            >
              {soundOn ? "音效开" : "音效关"}
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => {
                resetBossSpawnSoundCache();
                void playLaiLaLaoDi();
              }}
              title="试听来啦老弟音效"
            >
              试听
            </button>
            {!compact && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  window.location.assign("/boss/float");
                }}
              >
                悬浮窗
              </button>
            )}
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={goHome}
            >
              返回导航
            </button>
          </div>
        </header>

        <p className="relative z-10 mb-3 text-xs text-[var(--text-muted)]">
          点「已击杀」或「未刷新」会按当前时间加上刷新间隔立刻开始倒计时。倒计时归零播放「来啦老弟」。
        </p>

        {error && (
          <p className="relative z-10 mb-2 text-sm text-[var(--accent-crimson)]">
            {error}
          </p>
        )}

        <section className="relative z-10 space-y-3 pb-28">
          {!room && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              加载中…
            </div>
          )}
          {room &&
            bosses.map((boss) => (
              <BossCard
                key={boss.id}
                boss={boss}
                member={member}
                onVote={vote}
                busy={busy || dropsLoading}
                onOpenDrops={openDrops}
                soundOn={soundOn}
                onSpawnReady={handleSpawnReady}
                now={now}
              />
            ))}
          {room && bosses.length === 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              暂无 BOSS，请管理员在后台添加
            </div>
          )}

          {systemLogs.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-4 py-3">
              <p className="mb-2 text-xs text-[var(--text-muted)]">系统日志</p>
              <ul className="space-y-1 text-xs text-[var(--text-muted)]">
                {systemLogs.map((msg) => (
                  <li key={msg.id}>
                    <span className="text-[var(--accent-violet)]">系统</span>：
                    {msg.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-soft)] bg-[rgba(10,12,20,0.92)] px-3 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[960px] items-center gap-2">
            <form onSubmit={sendChat} className="flex min-w-0 flex-1 gap-2">
              <input
                className="field !py-2.5"
                placeholder="发送弹幕..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={!member}
              />
              <button
                type="submit"
                className="rounded-xl bg-[#3b82f6] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={!member}
              >
                发送
              </button>
            </form>
          </div>
          {(room?.chat?.length ?? 0) > 0 && (
            <div className="mx-auto mt-2 max-h-20 w-full max-w-[960px] overflow-y-auto text-xs text-[var(--text-muted)]">
              {[...(room?.chat ?? [])]
                .filter((m) => m.memberName !== "系统")
                .slice(-5)
                .map((msg) => (
                  <p key={msg.id}>
                    <span className="text-[var(--text-primary)]">
                      {msg.memberName}
                    </span>
                    ：{msg.message}
                  </p>
                ))}
            </div>
          )}
        </div>

        {popup && (
          <div
            className={`pointer-events-none fixed left-1/2 top-[28%] z-50 w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border px-5 py-4 text-center text-sm shadow-xl ${
              popup.tone === "ok"
                ? "border-emerald-500/40 bg-[#14241c] text-emerald-200"
                : popup.tone === "fail"
                  ? "border-[rgba(226,61,74,0.45)] bg-[#2a1518] text-[#ffb4ba]"
                  : "border-[var(--border-soft)] bg-[#1a2030] text-[var(--text-primary)]"
            }`}
            role="status"
          >
            {popup.text}
          </div>
        )}

        <BossDropsLightbox
          open={Boolean(dropsBoss)}
          onClose={() => setDropsBoss(null)}
          name={dropsBoss?.name || ""}
          imageData={dropsBoss?.dropsImage || null}
          note={dropsBoss?.dropsNote}
        />
      </div>
    </div>
  );
}
