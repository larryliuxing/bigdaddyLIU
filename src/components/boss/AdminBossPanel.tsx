"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Boss } from "@/lib/types";

export function AdminBossPanel({ adminName }: { adminName: string }) {
  const router = useRouter();
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    color: "#c084fc",
    spawnRate: 50,
    intervalHours: 6,
    dropsNote: "",
  });

  async function refresh() {
    const res = await fetch("/api/boss");
    const data = await res.json();
    if (!res.ok) return;
    setBosses(data.allBosses || data.room?.bosses || []);
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
    setForm({
      name: "",
      color: "#c084fc",
      spawnRate: 50,
      intervalHours: 6,
      dropsNote: "",
    });
    setMessage("BOSS 已添加");
  }

  async function patchBoss(id: number, patch: Record<string, unknown>) {
    setError("");
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
    setMessage("已删除");
  }

  return (
    <div className="app-shell">
      <div className="app-frame" style={{ width: "min(100%, 720px)" }}>
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

        {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}
        {error && (
          <p className="mb-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        )}

        <section className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            添加 BOSS
          </h2>
          <form onSubmit={createBoss} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="field"
              placeholder="BOSS 名称"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <input
              className="field"
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            />
            <input
              className="field"
              type="number"
              min={1}
              max={100}
              placeholder="刷新概率 %"
              value={form.spawnRate}
              onChange={(e) =>
                setForm((f) => ({ ...f, spawnRate: Number(e.target.value) }))
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
            {bosses.map((boss) => (
              <li
                key={boss.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
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
      </div>
    </div>
  );
}
