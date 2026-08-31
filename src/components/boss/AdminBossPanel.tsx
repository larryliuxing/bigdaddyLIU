"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Boss } from "@/lib/types";
import {
  beijingDateFromIso,
  beijingHmFromIso,
  beijingTodayDate,
  formatBeijingDateTime,
  fromBeijingDateAndTime,
} from "@/lib/auction/client";
import {
  computeTimerFromKill,
  computeTimerFromNextSpawn,
} from "@/lib/boss/timer";
import {
  BossDropsLightbox,
  BossDropsPasteZone,
} from "@/components/boss/BossDropsViewer";

const BOSS_COLORS = [
  { id: "purple", label: "紫色", value: "#c084fc" },
  { id: "pink", label: "粉色", value: "#f472b6" },
] as const;

function normalizeBossColor(color: string | null | undefined) {
  const c = (color || "").toLowerCase();
  if (c === "#f472b6" || c === "pink") return "#f472b6";
  return "#c084fc";
}

function BossColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const selected = normalizeBossColor(value);
  return (
    <div className="flex flex-wrap gap-2">
      {BOSS_COLORS.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.id}
            type="button"
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
              active
                ? "border-white/35 bg-[#2a3350]"
                : "border-[var(--border-soft)] bg-[#121826] text-[var(--text-muted)]"
            }`}
            onClick={() => onChange(opt.value)}
          >
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ background: opt.value }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

type BossForm = {
  name: string;
  color: string;
  spawnRate: number;
  intervalHours: number;
  dropsNote: string;
  dropsImage: string | null;
};

const emptyForm = (): BossForm => ({
  name: "",
  color: "#c084fc",
  spawnRate: 50,
  intervalHours: 6,
  dropsNote: "",
  dropsImage: null,
});

function bossToForm(boss: Boss): BossForm {
  return {
    name: boss.name,
    color: normalizeBossColor(boss.color),
    spawnRate: boss.spawnRate,
    intervalHours: boss.intervalHours,
    dropsNote: boss.dropsNote || "",
    dropsImage: boss.dropsImage,
  };
}

function hasDropsPreview(boss: Boss) {
  return Boolean(boss.hasDropsImage || boss.dropsImage || boss.dropsNote);
}

export function AdminBossPanel({
  adminName,
  initialBosses = [],
}: {
  adminName: string;
  initialBosses?: Boss[];
}) {
  const router = useRouter();
  const [bosses, setBosses] = useState<Boss[]>(initialBosses);
  const [listLoading, setListLoading] = useState(initialBosses.length === 0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<BossForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<BossForm>(emptyForm);
  const [editImageLoading, setEditImageLoading] = useState(false);
  /** When false, save must omit dropsImage so we don't wipe the stored blob. */
  const [editDropsReady, setEditDropsReady] = useState(true);
  const [timerDrafts, setTimerDrafts] = useState<
    Record<
      number,
      {
        killDate: string;
        killTime: string;
        nextDate: string;
        nextTime: string;
      }
    >
  >(() => {
    const drafts: Record<
      number,
      {
        killDate: string;
        killTime: string;
        nextDate: string;
        nextTime: string;
      }
    > = {};
    for (const boss of initialBosses) {
      drafts[boss.id] = {
        killDate: boss.lastKillAt
          ? beijingDateFromIso(boss.lastKillAt)
          : beijingTodayDate(),
        killTime: boss.lastKillAt ? beijingHmFromIso(boss.lastKillAt) : "12:00",
        nextDate: boss.nextSpawnAt
          ? beijingDateFromIso(boss.nextSpawnAt)
          : beijingTodayDate(),
        nextTime: boss.nextSpawnAt
          ? beijingHmFromIso(boss.nextSpawnAt)
          : "18:00",
      };
    }
    return drafts;
  });
  const [preview, setPreview] = useState<{
    name: string;
    image: string | null;
    note: string | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [timerBusy, setTimerBusy] = useState<{
    bossId: number;
    action: "kill" | "next";
  } | null>(null);
  const [timerFlash, setTimerFlash] = useState<{
    bossId: number;
    action: "kill" | "next";
    text: string;
  } | null>(null);
  const timerFlashTimer = useRef<number | null>(null);
  const editingIdRef = useRef<number | null>(null);

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  function flashTimerOk(
    bossId: number,
    action: "kill" | "next",
    text: string,
  ) {
    if (timerFlashTimer.current) window.clearTimeout(timerFlashTimer.current);
    setTimerFlash({ bossId, action, text });
    timerFlashTimer.current = window.setTimeout(() => {
      setTimerFlash(null);
      timerFlashTimer.current = null;
    }, 2200);
  }

  useEffect(() => {
    return () => {
      if (timerFlashTimer.current) window.clearTimeout(timerFlashTimer.current);
    };
  }, []);

  function draftFromBoss(boss: Boss) {
    return {
      killDate: boss.lastKillAt
        ? beijingDateFromIso(boss.lastKillAt)
        : beijingTodayDate(),
      killTime: boss.lastKillAt ? beijingHmFromIso(boss.lastKillAt) : "12:00",
      nextDate: boss.nextSpawnAt
        ? beijingDateFromIso(boss.nextSpawnAt)
        : beijingTodayDate(),
      nextTime: boss.nextSpawnAt ? beijingHmFromIso(boss.nextSpawnAt) : "18:00",
    };
  }

  function updateTimerDraft(
    bossId: number,
    patch: Partial<{
      killDate: string;
      killTime: string;
      nextDate: string;
      nextTime: string;
    }>,
  ) {
    setTimerDrafts((prev) => ({
      ...prev,
      [bossId]: {
        ...(prev[bossId] || {
          killDate: beijingTodayDate(),
          killTime: "12:00",
          nextDate: beijingTodayDate(),
          nextTime: "18:00",
        }),
        ...patch,
      },
    }));
  }

  async function refresh() {
    setListLoading(true);
    try {
      // Lite list — no base64 drops images (load via ?dropsId= when needed)
      const res = await fetch("/api/boss");
      const data = await res.json();
      if (!res.ok) return;
      const list = (data.allBosses || data.room?.bosses || []) as Boss[];
      setBosses(list);
      setTimerDrafts((prev) => {
        const next = { ...prev };
        for (const boss of list) {
          if (!next[boss.id]) next[boss.id] = draftFromBoss(boss);
        }
        return next;
      });
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchDrops(bossId: number) {
    const res = await fetch(`/api/boss?dropsId=${bossId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "加载掉落失败",
      );
    }
    return data as {
      dropsImage?: string | null;
      dropsNote?: string | null;
      name?: string;
    };
  }

  async function openPreview(boss: Boss) {
    if (!hasDropsPreview(boss)) return;
    if (boss.dropsImage || (!boss.hasDropsImage && boss.dropsNote)) {
      setPreview({
        name: boss.name,
        image: boss.dropsImage,
        note: boss.dropsNote,
      });
      return;
    }
    setPreviewLoading(true);
    try {
      const data = await fetchDrops(boss.id);
      setPreview({
        name: boss.name,
        image: data.dropsImage ?? null,
        note: data.dropsNote ?? boss.dropsNote,
      });
      setBosses((prev) =>
        prev.map((b) =>
          b.id === boss.id
            ? {
                ...b,
                dropsImage: data.dropsImage ?? null,
                dropsNote: data.dropsNote ?? b.dropsNote,
                hasDropsImage: Boolean(data.dropsImage),
              }
            : b,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载掉落失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function startEdit(boss: Boss) {
    setEditingId(boss.id);
    setEditForm(bossToForm(boss));
    if (boss.dropsImage || !boss.hasDropsImage) {
      setEditDropsReady(true);
      setEditImageLoading(false);
      return;
    }
    setEditDropsReady(false);
    setEditImageLoading(true);
    try {
      const data = await fetchDrops(boss.id);
      if (editingIdRef.current !== boss.id) return;
      setEditForm((f) => ({
        ...f,
        dropsImage: data.dropsImage ?? null,
        dropsNote: data.dropsNote ?? f.dropsNote,
      }));
      setEditDropsReady(true);
      setBosses((prev) =>
        prev.map((b) =>
          b.id === boss.id
            ? {
                ...b,
                dropsImage: data.dropsImage ?? null,
                hasDropsImage: Boolean(data.dropsImage),
              }
            : b,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载掉落图片失败");
      // Keep editDropsReady false so save won't clear the stored image
    } finally {
      setEditImageLoading(false);
    }
  }

  async function createBoss(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/boss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        color: normalizeBossColor(form.color),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "添加失败");
      return;
    }
    setBosses(data.allBosses || []);
    setForm(emptyForm());
    setMessage("BOSS 已添加（固有属性已保存，可在列表中设置击杀/刷新时间）");
  }

  async function patchBoss(id: number, patch: Record<string, unknown>) {
    setError("");
    setMessage("");
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
    setBosses(data.allBosses || []);
    return true;
  }

  async function saveInherent(bossId: number) {
    const patch: Record<string, unknown> = {
      name: editForm.name,
      color: normalizeBossColor(editForm.color),
      spawnRate: editForm.spawnRate,
      intervalHours: editForm.intervalHours,
      dropsNote: editForm.dropsNote || null,
    };
    if (editDropsReady) {
      patch.dropsImage = editForm.dropsImage;
    }
    const ok = await patchBoss(bossId, patch);
    if (ok) {
      setEditingId(null);
      setMessage("固有属性已更新");
    }
  }

  async function applyKillTime(boss: Boss) {
    const draft = timerDrafts[boss.id] || draftFromBoss(boss);
    const killIso = fromBeijingDateAndTime(draft.killDate, draft.killTime);
    const computed = computeTimerFromKill(killIso, boss.intervalHours);
    if (!computed.ok) {
      setError(computed.error);
      setMessage("");
      return;
    }
    const { lastKillAt, nextSpawnAt } = computed;
    setTimerBusy({ bossId: boss.id, action: "kill" });
    try {
      const ok = await patchBoss(boss.id, { lastKillAt, nextSpawnAt });
      if (ok) {
        setTimerDrafts((prev) => ({
          ...prev,
          [boss.id]: {
            ...draft,
            nextDate: beijingDateFromIso(nextSpawnAt),
            nextTime: beijingHmFromIso(nextSpawnAt),
          },
        }));
        const tip = `已记击杀 · 下次刷新 ${formatBeijingDateTime(nextSpawnAt)}（+${boss.intervalHours}h）`;
        setMessage(tip);
        flashTimerOk(boss.id, "kill", tip);
      }
    } finally {
      setTimerBusy(null);
    }
  }

  async function applyNextSpawn(boss: Boss) {
    const draft = timerDrafts[boss.id] || draftFromBoss(boss);
    const nextIso = fromBeijingDateAndTime(draft.nextDate, draft.nextTime);
    const { lastKillAt, nextSpawnAt } = computeTimerFromNextSpawn(
      nextIso,
      boss.intervalHours,
    );
    setTimerBusy({ bossId: boss.id, action: "next" });
    try {
      const ok = await patchBoss(boss.id, { lastKillAt, nextSpawnAt });
      if (ok) {
        setTimerDrafts((prev) => ({
          ...prev,
          [boss.id]: {
            ...draft,
            killDate: beijingDateFromIso(lastKillAt),
            killTime: beijingHmFromIso(lastKillAt),
            nextDate: beijingDateFromIso(nextSpawnAt),
            nextTime: beijingHmFromIso(nextSpawnAt),
          },
        }));
        const tip = `已设下次刷新 · ${formatBeijingDateTime(nextSpawnAt)}（倒计时对准此时刻）`;
        setMessage(tip);
        flashTimerOk(boss.id, "next", tip);
      }
    } finally {
      setTimerBusy(null);
    }
  }

  async function removeBoss(id: number) {
    if (!window.confirm("确认删除该 BOSS？")) return;
    setError("");
    const res = await fetch(`/api/boss?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    setBosses(data.allBosses || []);
    setTimerDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMessage("已删除");
    if (editingId === id) setEditingId(null);
  }

  return (
    <div className="app-shell">
      <div className="app-frame" style={{ width: "min(100%, 760px)" }}>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">后台管理</p>
            <h1 className="mt-1 text-2xl font-bold">BOSS 设置</h1>
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
              onClick={() => router.push("/boss")}
            >
              查看计时器
            </button>
          </div>
        </header>

        <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
          固有属性：名称、刷新概率、刷新间隔、掉落说明。盟员点「已击杀」或「未刷新」会立刻按当前时间加上间隔重开倒计时。后台精确到分钟时：要倒计时到某个时刻请用「设下次刷新」；已击杀再用「记击杀并推算」（击杀时间 + 间隔）。
        </p>

        {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}
        {error && (
          <p className="mb-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        )}

        <section className="mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            盟员标记规则
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            盟员在计时器点「已击杀」或「未刷新」立刻生效：下次刷新 = 当前时间 + 该 BOSS 刷新间隔，并开始倒计时。卡片会显示上一次点的人和时间。不再需要多人投票。
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            添加 BOSS（固有属性）
          </h2>
          <form onSubmit={createBoss} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs text-[var(--text-muted)]">BOSS 名称</span>
              <input
                className="field"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">刷新概率 %</span>
              <input
                className="field"
                type="number"
                min={1}
                max={100}
                value={form.spawnRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, spawnRate: Number(e.target.value) }))
                }
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">
                刷新间隔时间（小时）
              </span>
              <input
                className="field"
                type="number"
                min={0.5}
                step={0.5}
                value={form.intervalHours}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    intervalHours: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs text-[var(--text-muted)]">
                掉落说明（文字，可选）
              </span>
              <input
                className="field"
                value={form.dropsNote}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dropsNote: e.target.value }))
                }
                placeholder="简要说明，可配合下方截图"
              />
            </label>
            <div className="sm:col-span-2 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">
                掉落说明（粘贴图片）
              </span>
              <BossDropsPasteZone
                imageData={form.dropsImage}
                onChange={(dropsImage) =>
                  setForm((f) => ({ ...f, dropsImage }))
                }
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <span className="text-xs text-[var(--text-muted)]">显示颜色</span>
              <BossColorPicker
                value={form.color}
                onChange={(color) => setForm((f) => ({ ...f, color }))}
              />
            </div>
            <button type="submit" className="btn-primary sm:col-span-2">
              添加 BOSS
            </button>
          </form>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            已配置（{bosses.length}）
            {listLoading ? " · 加载中…" : ""}
            {previewLoading ? " · 加载掉落…" : ""}
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {listLoading && bosses.length === 0 && (
              <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
                正在加载 BOSS 列表…
              </li>
            )}
            {!listLoading && bosses.length === 0 && (
              <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
                尚未添加 BOSS
              </li>
            )}
            {bosses.map((boss) => {
              const editing = editingId === boss.id;
              const draft = timerDrafts[boss.id] || draftFromBoss(boss);
              return (
                <li key={boss.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: boss.color }}>
                        {boss.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        刷新概率 {boss.spawnRate}% · 间隔 {boss.intervalHours}h
                        · {boss.enabled ? "启用" : "停用"}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        击杀 {formatBeijingDateTime(boss.lastKillAt)} · 下次刷新{" "}
                        {formatBeijingDateTime(boss.nextSpawnAt)}
                      </p>
                      {boss.lastMark ? (
                        <p className="mt-0.5 text-xs text-[var(--text-primary)]">
                          上次
                          {boss.lastMark.voteType === "killed"
                            ? "已击杀"
                            : "未刷新"}
                          ：
                          {boss.lastMark.members
                            .map((m) => m.memberName)
                            .join("、") || "未知"}
                          {" · "}
                          {formatBeijingDateTime(boss.lastMark.at)}
                        </p>
                      ) : null}
                      {hasDropsPreview(boss) && (
                        <button
                          type="button"
                          className="mt-1 text-xs text-[var(--accent-violet)] underline-offset-2 hover:underline disabled:opacity-60"
                          disabled={previewLoading}
                          onClick={() => openPreview(boss)}
                        >
                          预览掉落说明
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => {
                          if (editing) {
                            setEditingId(null);
                          } else {
                            void startEdit(boss);
                          }
                        }}
                      >
                        {editing ? "收起属性" : "编辑固有属性"}
                      </button>
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
                  </div>

                  <div
                    className={`mt-3 space-y-3 rounded-xl border bg-[#0f1320] p-3 transition ${
                      timerFlash?.bossId === boss.id
                        ? "border-emerald-400/50 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"
                        : "border-[var(--border-soft)]"
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-[var(--text-muted)]">
                        倒计时规则（北京时间）· 间隔 {boss.intervalHours} 小时
                      </p>
                      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                        盟员端始终倒计时到「下次刷新」。想倒计时到某个时刻（如
                        14:22），用上面「设下次刷新」；只有已经击杀了才用下面「记击杀」（会再
                        +{boss.intervalHours} 小时）。
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          下次刷新日期
                        </span>
                        <input
                          className="field"
                          type="date"
                          value={draft.nextDate}
                          onChange={(e) =>
                            updateTimerDraft(boss.id, {
                              nextDate: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          下次刷新时间
                        </span>
                        <input
                          className="field"
                          type="time"
                          value={draft.nextTime}
                          onChange={(e) =>
                            updateTimerDraft(boss.id, {
                              nextTime: e.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className={`w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                            timerFlash?.bossId === boss.id &&
                            timerFlash.action === "next"
                              ? "bg-emerald-500 text-white"
                              : "btn-primary"
                          }`}
                          disabled={Boolean(timerBusy)}
                          onClick={() => applyNextSpawn(boss)}
                        >
                          {timerBusy?.bossId === boss.id &&
                          timerBusy.action === "next"
                            ? "设置中…"
                            : timerFlash?.bossId === boss.id &&
                                timerFlash.action === "next"
                              ? "已设置 ✓"
                              : "设下次刷新"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          击杀日期（须已发生）
                        </span>
                        <input
                          className="field"
                          type="date"
                          value={draft.killDate}
                          onChange={(e) =>
                            updateTimerDraft(boss.id, {
                              killDate: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          击杀时间
                        </span>
                        <input
                          className="field"
                          type="time"
                          value={draft.killTime}
                          onChange={(e) =>
                            updateTimerDraft(boss.id, {
                              killTime: e.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className={`w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                            timerFlash?.bossId === boss.id &&
                            timerFlash.action === "kill"
                              ? "bg-emerald-500 text-white"
                              : "btn-ghost"
                          }`}
                          disabled={Boolean(timerBusy)}
                          onClick={() => applyKillTime(boss)}
                        >
                          {timerBusy?.bossId === boss.id &&
                          timerBusy.action === "kill"
                            ? "设置中…"
                            : timerFlash?.bossId === boss.id &&
                                timerFlash.action === "kill"
                              ? "已设置 ✓"
                              : "记击杀并推算"}
                        </button>
                      </div>
                    </div>
                    {timerFlash?.bossId === boss.id && (
                      <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300">
                        {timerFlash.text} · 盟员端倒计时已同步
                      </p>
                    )}
                  </div>

                  {editing && (
                    <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3 sm:grid-cols-2">
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs text-[var(--text-muted)]">
                          BOSS 名称
                        </span>
                        <input
                          className="field"
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              name: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          刷新概率 %
                        </span>
                        <input
                          className="field"
                          type="number"
                          min={1}
                          max={100}
                          value={editForm.spawnRate}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              spawnRate: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          刷新间隔时间（小时）
                        </span>
                        <input
                          className="field"
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={editForm.intervalHours}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              intervalHours: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="text-xs text-[var(--text-muted)]">
                          掉落说明（文字）
                        </span>
                        <input
                          className="field"
                          value={editForm.dropsNote}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              dropsNote: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="sm:col-span-2 space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          显示颜色
                        </span>
                        <BossColorPicker
                          value={editForm.color}
                          onChange={(color) =>
                            setEditForm((f) => ({ ...f, color }))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          掉落说明（粘贴图片）
                          {editImageLoading ? " · 加载中…" : ""}
                        </span>
                        <BossDropsPasteZone
                          imageData={editForm.dropsImage}
                          onChange={(dropsImage) => {
                            setEditDropsReady(true);
                            setEditForm((f) => ({ ...f, dropsImage }));
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-primary sm:col-span-2"
                        onClick={() => saveInherent(boss.id)}
                        disabled={editImageLoading}
                      >
                        保存固有属性
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <BossDropsLightbox
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        name={preview?.name || ""}
        imageData={preview?.image || null}
        note={preview?.note}
      />
    </div>
  );
}
