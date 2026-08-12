"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Boss, BossRoomState, SessionUser } from "@/lib/types";
import {
  formatBeijingDateTime,
  formatCountdown,
} from "@/lib/auction/client";
import { TimerIcon } from "@/components/Icons";
import { BossDropsLightbox } from "@/components/boss/BossDropsViewer";
import {
  playLaiLaLaoDi,
  unlockBossSpawnSound,
} from "@/lib/boss/spawnSound";

const POLL_MS = 900;
const TICK_MS = 900;
const POPUP_MS = 2000;
const URGENT_SECONDS = 60;

const SPARKS = [
  { sx: "-48px", sy: "-36px", left: "48%", top: "40%", delay: "0ms" },
  { sx: "52px", sy: "-28px", left: "52%", top: "38%", delay: "40ms" },
  { sx: "-36px", sy: "44px", left: "46%", top: "48%", delay: "80ms" },
  { sx: "44px", sy: "40px", left: "54%", top: "50%", delay: "120ms" },
  { sx: "0px", sy: "-56px", left: "50%", top: "36%", delay: "60ms" },
  { sx: "-60px", sy: "8px", left: "42%", top: "44%", delay: "100ms" },
];

function BossCard({
  boss,
  member,
  voteNeed,
  onVote,
  busy,
  onOpenDrops,
  soundOn,
  onSpawnReady,
}: {
  boss: Boss;
  member: Extract<SessionUser, { type: "member" }> | null;
  voteNeed: number;
  onVote: (bossId: number, voteType: "killed" | "not_spawned") => void;
  busy: boolean;
  onOpenDrops: (boss: Boss) => void;
  soundOn: boolean;
  onSpawnReady: (boss: Boss) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [burstKey, setBurstKey] = useState(0);
  const prevRemain = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Arm once we have observed a positive countdown (avoid firing on first paint at 0)
  useEffect(() => {
    armed.current = false;
    prevRemain.current = null;
  }, [boss.nextSpawnAt]);

  const remain = boss.nextSpawnAt
    ? Math.max(
        0,
        Math.floor((new Date(boss.nextSpawnAt).getTime() - now) / 1000),
      )
    : null;
  const roundRemain = boss.activeRound?.expiresAt
    ? Math.max(
        0,
        Math.floor(
          (new Date(boss.activeRound.expiresAt).getTime() - now) / 1000,
        ),
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
    // remain === 0
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

  const round = boss.activeRound;
  const hasDrops = Boolean(boss.dropsImage || boss.dropsNote);
  const isReady = remain === 0 && Boolean(boss.nextSpawnAt);
  const isUrgent =
    remain != null && remain > 0 && remain <= URGENT_SECONDS;

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
          <h3 className="text-xl font-bold" style={{ color: boss.color }}>
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

      {boss.dropsImage && (
        <button
          type="button"
          className="mt-3 block w-full overflow-hidden rounded-xl border border-[var(--border-soft)] bg-black/40"
          onClick={() => onOpenDrops(boss)}
          title="点击放大查看掉落说明"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={boss.dropsImage}
            alt={`${boss.name} 掉落`}
            className="mx-auto max-h-28 object-contain"
          />
          <span className="block bg-black/50 px-2 py-1 text-center text-[10px] text-white/80">
            点击放大掉落说明
          </span>
        </button>
      )}

      <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
        <p>最后击杀 {formatBeijingDateTime(boss.lastKillAt)}</p>
        <p>下次刷新 {formatBeijingDateTime(boss.nextSpawnAt)}</p>
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

      {round && round.status === "open" && (
        <div className="mt-3 rounded-xl border border-[rgba(123,108,255,0.35)] bg-[#151a2c] px-3 py-2 text-sm">
          <p>
            投票中：
            <span className="font-medium text-[var(--accent-violet)]">
              {round.voteType === "killed" ? "已击杀" : "未刷新"}
            </span>
            {" · "}
            {round.voteCount}/{voteNeed} · 剩余{" "}
            <span className="tabular-nums">{roundRemain ?? 0}s</span>
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {round.votes.map((v) => v.memberName).join("、") || "等待同意"}
          </p>
        </div>
      )}

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

/** Member-facing BOSS timer. Admin CRUD lives under /admin/boss. */
export function BossTimerPanel({
  member,
  compact = false,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<BossRoomState | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<{
    text: string;
    tone: "ok" | "fail" | "info";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropsBoss, setDropsBoss] = useState<Boss | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const popupTimer = useRef<number | null>(null);
  const lastSystemId = useRef(0);
  const systemBootstrapped = useRef(false);
  const showPopupRef = useRef<(text: string, tone?: "ok" | "fail" | "info") => void>(
    () => {},
  );

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
    const unlock = () => unlockBossSpawnSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (popupTimer.current) window.clearTimeout(popupTimer.current);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/boss");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setRoom(data.room);
    };
    const timeout = window.setTimeout(() => {
      void tick();
    }, 0);
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    };
  }, []);

  // Surface system vote logs as 2s popups for everyone
  useEffect(() => {
    const systems =
      room?.chat?.filter((c) => c.memberName === "系统") ?? [];
    const last = systems[systems.length - 1];
    if (!systemBootstrapped.current) {
      systemBootstrapped.current = true;
      lastSystemId.current = last?.id ?? 0;
      return;
    }
    if (!last || last.id <= lastSystemId.current) return;
    lastSystemId.current = last.id;
    const fail = /未通过|超时|失败/.test(last.message);
    const ok = /成功生效|标记生效/.test(last.message);
    showPopup(last.message, fail ? "fail" : ok ? "ok" : "info");
  }, [room?.chat]);

  async function vote(bossId: number, voteType: "killed" | "not_spawned") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/boss/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bossId, voteType }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "投票失败";
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

      if (data.passed) {
        showPopup(
          lastSystem?.message || "投票成功，已更新计时",
          "ok",
        );
      } else {
        showPopup(
          lastSystem?.message ||
            `已投票 ${data.round.voteCount}/${data.room.voteNeed}，等待其他人同意`,
          "info",
        );
      }
    } catch {
      setError("网络错误");
      showPopup("网络错误，投票失败", "fail");
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

  const bosses = useMemo(() => room?.bosses ?? [], [room?.bosses]);
  const voteNeed = room?.voteNeed ?? 3;
  const systemLogs = useMemo(
    () => (room?.chat ?? []).filter((c) => c.memberName === "系统").slice(-8),
    [room?.chat],
  );

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
          <div className="flex flex-wrap gap-2">
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
            {!compact && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => router.push("/boss/float")}
              >
                悬浮窗
              </button>
            )}
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push(member ? "/home" : "/admin")}
            >
              返回导航
            </button>
          </div>
        </header>

        <p className="relative z-10 mb-3 text-xs text-[var(--text-muted)]">
          倒计时归零时播放「来啦老弟」并闪光特效；成员也可投票「已击杀 / 未刷新」（
          {voteNeed} 人在 {room?.voteWindowSeconds ?? 10} 秒内同意后生效）。
        </p>

        {error && (
          <p className="relative z-10 mb-2 text-sm text-[var(--accent-crimson)]">
            {error}
          </p>
        )}

        <section className="relative z-10 space-y-3 pb-28">
          {bosses.map((boss) => (
            <BossCard
              key={boss.id}
              boss={boss}
              member={member}
              voteNeed={voteNeed}
              onVote={vote}
              busy={busy}
              onOpenDrops={setDropsBoss}
              soundOn={soundOn}
              onSpawnReady={handleSpawnReady}
            />
          ))}
          {bosses.length === 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              暂无 BOSS，请管理员在后台添加
            </div>
          )}

          {systemLogs.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-4 py-3">
              <p className="mb-2 text-xs text-[var(--text-muted)]">投票日志</p>
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
            className={`fixed left-1/2 top-[28%] z-50 w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border px-5 py-4 text-center text-sm shadow-xl ${
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
