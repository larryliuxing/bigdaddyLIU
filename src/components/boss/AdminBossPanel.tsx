"use client";

import { useEffect, useState } from "react";
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
  BossDropsLightbox,
  BossDropsPasteZone,
} from "@/components/boss/BossDropsViewer";

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
    color: boss.color,
    spawnRate: boss.spawnRate,
    intervalHours: boss.intervalHours,
    dropsNote: boss.dropsNote || "",
    dropsImage: boss.dropsImage,
  };
}

export function AdminBossPanel({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<BossForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<BossForm>(emptyForm);
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
  >({});
  const [preview, setPreview] = useState<{
    name: string;
    image: string | null;
    note: string | null;
  } | null>(null);

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
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function createBoss(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
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
    const ok = await patchBoss(bossId, {
      name: editForm.name,
      color: editForm.color,
      spawnRate: editForm.spawnRate,
      intervalHours: editForm.intervalHours,
      dropsNote: editForm.dropsNote || null,
      dropsImage: editForm.dropsImage,
    });
    if (ok) {
      setEditingId(null);
      setMessage("固有属性已更新");
    }
  }

  async function applyKillTime(boss: Boss) {
    const draft = timerDrafts[boss.id] || draftFromBoss(boss);
    const lastKillAt = fromBeijingDateAndTime(draft.killDate, draft.killTime);
    const nextSpawnAt = new Date(
      new Date(lastKillAt).getTime() + boss.intervalHours * 60 * 60 * 1000,
    ).toISOString();
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
      setMessage(
        `已按击杀时间更新：下次刷新 = 击杀 + ${boss.intervalHours} 小时`,
      );
    }
  }

  async function applyNextSpawn(boss: Boss) {
    const draft = timerDrafts[boss.id] || draftFromBoss(boss);
    const nextSpawnAt = fromBeijingDateAndTime(draft.nextDate, draft.nextTime);
    const ok = await patchBoss(boss.id, { nextSpawnAt });
    if (ok) {
      setMessage("已设置下次刷新时间，盟员端倒计时已同步");
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
          固有属性：名称、刷新概率、刷新间隔、掉落说明（可粘贴截图）。
          计时由管理员设置击杀时间（自动推算下次刷新）或直接设置下次刷新时间；
          全体盟员在 BOSS 模块查看倒计时列表。
        </p>

        {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}
        {error && (
          <p className="mb-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        )}

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
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs text-[var(--text-muted)]">显示颜色</span>
              <input
                className="field h-10"
                type="color"
                value={form.color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, color: e.target.value }))
                }
              />
            </label>
            <button type="submit" className="btn-primary sm:col-span-2">
              添加 BOSS
            </button>
          </form>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            已配置（{bosses.length}）
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {bosses.length === 0 && (
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
                      {(boss.dropsImage || boss.dropsNote) && (
                        <button
                          type="button"
                          className="mt-1 text-xs text-[var(--accent-violet)] underline-offset-2 hover:underline"
                          onClick={() =>
                            setPreview({
                              name: boss.name,
                              image: boss.dropsImage,
                              note: boss.dropsNote,
                            })
                          }
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
                            setEditingId(boss.id);
                            setEditForm(bossToForm(boss));
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

                  <div className="mt-3 space-y-3 rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3">
                    <p className="text-xs font-medium text-[var(--text-muted)]">
                      手动调倒计时（北京时间）· 间隔 {boss.intervalHours} 小时
                    </p>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="block space-y-1.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          击杀日期
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
                          className="btn-primary w-full"
                          onClick={() => applyKillTime(boss)}
                        >
                          按击杀时间计时
                        </button>
                      </div>
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
                          className="btn-ghost w-full"
                          onClick={() => applyNextSpawn(boss)}
                        >
                          直接设下次刷新
                        </button>
                      </div>
                    </div>
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
                          掉落说明（粘贴图片）
                        </span>
                        <BossDropsPasteZone
                          imageData={editForm.dropsImage}
                          onChange={(dropsImage) =>
                            setEditForm((f) => ({ ...f, dropsImage }))
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-primary sm:col-span-2"
                        onClick={() => saveInherent(boss.id)}
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
