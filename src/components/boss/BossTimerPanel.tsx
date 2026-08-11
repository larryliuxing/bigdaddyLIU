"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Boss, BossRoomState, SessionUser } from "@/lib/types";
import { formatCountdown } from "@/lib/auction/client";
import { AdminLoginModal } from "@/components/AdminLoginModal";
import { SettingsIcon, TimerIcon } from "@/components/Icons";

function formatTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BossCard({
  boss,
  member,
  voteNeed,
  onVote,
  busy,
}: {
  boss: Boss;
  member: Extract<SessionUser, { type: "member" }> | null;
  voteNeed: number;
  onVote: (bossId: number, voteType: "killed" | "not_spawned") => void;
  busy: boolean;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  void tick;
  const remain =
    boss.remainingSeconds == null
      ? null
      : Math.max(0, boss.remainingSeconds - tick);
  const roundRemain =
    boss.activeRound?.remainingSeconds == null
      ? null
      : Math.max(0, boss.activeRound.remainingSeconds - tick);

  // Reset local tick when server values refresh
  const syncKey = `${boss.remainingSeconds}-${boss.activeRound?.id}-${boss.activeRound?.remainingSeconds}`;
  const [lastSync, setLastSync] = useState(syncKey);
  if (lastSync !== syncKey) {
    setLastSync(syncKey);
    setTick(0);
  }

  const round = boss.activeRound;

  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4"
      style={{
        boxShadow: `inset 0 0 40px ${boss.color}22`,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-bold" style={{ color: boss.color }}>
            {boss.name}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {boss.spawnRate}% · {boss.intervalHours}小时
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-[#2b4d8f] px-3 py-1.5 text-xs font-medium text-white"
          title={boss.dropsNote || "掉落物"}
          onClick={() =>
            window.alert(boss.dropsNote || `${boss.name}：暂无掉落说明`)
          }
        >
          查询掉落物
        </button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
        <p>最后击杀 {formatTime(boss.lastKillAt)}</p>
        <p>下次刷新 {formatTime(boss.nextSpawnAt)}</p>
      </div>

      <div className="mt-4 text-center">
        <p className="text-4xl font-semibold tracking-wide tabular-nums">
          {formatCountdown(remain)}
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">距离刷新</p>
      </div>

      {round && round.status === "open" && (
        <div className="mt-3 rounded-xl border border-[rgba(123,108,255,0.35)] bg-[#151a2c] px-3 py-2 text-sm">
          <p>
            投票中：
            <span className="font-medium text-[var(--accent-violet)]">
              {round.voteType === "killed" ? "已击杀" : "未刷新"}
            </span>
            {" · "}
            {round.voteCount}/{voteNeed} · 剩余 {roundRemain ?? 0}s
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

export function BossTimerPanel({
  member,
  isAdmin,
  compact = false,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<BossRoomState | null>(null);
  const [allBosses, setAllBosses] = useState<Boss[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    color: "#c084fc",
    spawnRate: 50,
    intervalHours: 6,
    dropsNote: "",
  });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/boss");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setRoom(data.room);
      if (data.allBosses) setAllBosses(data.allBosses);
    };
    const timeout = window.setTimeout(() => {
      void tick();
    }, 0);
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    };
  }, []);

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
        setError(data.error || "投票失败");
        return;
      }
      setRoom(data.room);
      setToast(
        data.passed
          ? "投票通过，已更新计时"
          : `已投票 ${data.round.voteCount}/${data.room.voteNeed}`,
      );
      window.setTimeout(() => setToast(""), 1800);
    } catch {
      setError("网络错误");
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

  async function createBoss(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/boss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "添加失败");
      return;
    }
    setRoom(data.room);
    setAllBosses(data.allBosses || []);
    setForm({
      name: "",
      color: "#c084fc",
      spawnRate: 50,
      intervalHours: 6,
      dropsNote: "",
    });
    setToast("BOSS 已添加");
  }

  async function patchBoss(id: number, patch: Record<string, unknown>) {
    const res = await fetch("/api/boss", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "更新失败");
      return;
    }
    setRoom(data.room);
    setAllBosses(data.allBosses || []);
  }

  async function removeBoss(id: number) {
    if (!window.confirm("确认删除该 BOSS？")) return;
    const res = await fetch(`/api/boss?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    setRoom(data.room);
    setAllBosses(data.allBosses || []);
  }

  const bosses = useMemo(() => room?.bosses ?? [], [room?.bosses]);
  const voteNeed = room?.voteNeed ?? 3;
  const manageList = allBosses.length ? allBosses : bosses;

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
                已连接 · {member?.name ?? (isAdmin ? "管理员" : "游客")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
              onClick={() => router.push("/home")}
            >
              返回导航
            </button>
          </div>
        </header>

        <p className="relative z-10 mb-3 text-xs text-[var(--text-muted)]">
          任意成员点击「已击杀 / 未刷新」，{voteNeed} 人在{" "}
          {room?.voteWindowSeconds ?? 10} 秒内同意后生效并开启新一轮计时。
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
            />
          ))}
          {bosses.length === 0 && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              暂无 BOSS，请管理员在设置中添加
            </div>
          )}
        </section>

        {showSettings && isAdmin && (
          <section className="relative z-20 mb-24 rounded-2xl border border-[var(--border-soft)] bg-[#121826] p-4">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              BOSS 管理
            </h2>
            <form
              onSubmit={createBoss}
              className="mt-3 grid gap-2 sm:grid-cols-2"
            >
              <input
                className="field"
                placeholder="BOSS 名称"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="field"
                type="color"
                value={form.color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, color: e.target.value }))
                }
              />
              <input
                className="field"
                type="number"
                min={1}
                max={100}
                placeholder="刷新概率 %"
                value={form.spawnRate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    spawnRate: Number(e.target.value),
                  }))
                }
              />
              <input
                className="field"
                type="number"
                min={0.5}
                step={0.5}
                placeholder="间隔小时"
                value={form.intervalHours}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    intervalHours: Number(e.target.value),
                  }))
                }
              />
              <input
                className="field sm:col-span-2"
                placeholder="掉落说明"
                value={form.dropsNote}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dropsNote: e.target.value }))
                }
              />
              <button type="submit" className="btn-primary sm:col-span-2">
                添加 BOSS
              </button>
            </form>

            <ul className="mt-4 divide-y divide-[var(--border-soft)]">
              {manageList.map((boss) => (
                <li
                  key={boss.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium" style={{ color: boss.color }}>
                      {boss.name}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {boss.spawnRate}% / {boss.intervalHours}h ·{" "}
                      {boss.enabled ? "启用" : "停用"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() =>
                        patchBoss(boss.id, { enabled: !boss.enabled })
                      }
                    >
                      {boss.enabled ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs text-[var(--accent-crimson)]"
                      onClick={() => removeBoss(boss.id)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border-soft)] bg-[rgba(10,12,20,0.92)] px-3 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[960px] items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[var(--border-soft)] p-2.5 text-[var(--text-muted)]"
              title="设置"
              onClick={() => {
                if (isAdmin) setShowSettings((v) => !v);
                else setShowAdmin(true);
              }}
            >
              <SettingsIcon />
            </button>
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
              {[...(room?.chat ?? [])].slice(-5).map((msg) => (
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

        {toast && (
          <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--border-soft)] bg-[#1a2030] px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        )}

        {showAdmin && (
          <AdminLoginModal
            onClose={() => setShowAdmin(false)}
            onSuccess={() => {
              setShowAdmin(false);
              setShowSettings(true);
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
