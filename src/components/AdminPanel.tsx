"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Member } from "@/lib/types";
import { logoutAndRedirect } from "@/lib/nav";

export function AdminPanel({
  initialMembers,
  adminName,
}: {
  initialMembers: Member[];
  adminName: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const activeCount = members.filter((m) => m.status !== "exited").length;
  const clearedCount = members.length - activeCount;

  async function refresh() {
    const res = await fetch("/api/admin/members");
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members);
  }

  async function logout() {
    await logoutAndRedirect("admin", router);
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setName("");
      setMessage("成员已添加");
      await refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(id: number) {
    if (!window.confirm("确认重置该成员密码？重置后需重新设置。")) return;
    const res = await fetch("/api/admin/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "resetPassword" }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "重置失败");
      return;
    }
    setMessage("密码已重置");
    await refresh();
  }

  async function clearMember(id: number, memberName: string) {
    if (
      !window.confirm(
        `确认将「${memberName}」标记为已清退？历史拍卖/分红等记录会保留，主页与拍卖中不再显示。`,
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/members?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "标记清退失败",
        );
        return;
      }
      setMessage(`成员「${memberName}」已清退`);
      await refresh();
    } catch {
      setError("网络错误，标记清退失败");
    }
  }

  async function restoreMember(id: number, memberName: string) {
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "restore" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "恢复失败");
      return;
    }
    setMessage(`成员「${memberName}」已恢复在盟`);
    await refresh();
  }

  return (
    <div className="app-shell">
      <div className="app-frame" style={{ width: "min(100%, 720px)" }}>
        <header className="animate-fade-up flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">后台管理</p>
            <h1 className="mt-1 text-2xl font-bold">成员账户</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              管理员：{adminName} · 成员账户、拍卖物品、BOSS
              均仅可在此后台管理
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/auction/manage")}
            >
              拍卖物品
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/admin/boss")}
            >
              BOSS 设置
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/home")}
            >
              成员首页
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/?switch=1")}
            >
              切换身份
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={logout}>
              退出
            </button>
          </div>
        </header>

        <form
          onSubmit={addMember}
          className="animate-fade-up-delay mt-8 space-y-3 rounded-2xl border border-[var(--border-soft)] bg-[rgba(21,25,37,0.9)] p-4"
        >
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            添加成员
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="field"
              placeholder="成员昵称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary sm:max-w-[120px]"
              disabled={loading}
            >
              {loading ? "..." : "添加"}
            </button>
          </div>
          {error && <p className="text-sm text-[var(--accent-crimson)]">{error}</p>}
          {message && <p className="text-sm text-emerald-400">{message}</p>}
        </form>

        <section className="animate-fade-up-delay-2 mt-6 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(21,25,37,0.9)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            在盟 {activeCount} 人
            {clearedCount > 0 ? ` · 已清退 ${clearedCount} 人` : ""}
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {members.map((member) => {
              const cleared = member.status === "exited";
              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p
                      className={`font-medium ${cleared ? "text-[var(--text-muted)]" : ""}`}
                    >
                      {member.name}
                      <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                        {cleared ? "已清退" : "在盟"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {member.hasPassword ? "已设密码" : "未设密码"}
                      {cleared && member.exitedAt
                        ? ` · ${member.exitedAt.slice(0, 10)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!cleared ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost text-sm"
                          onClick={() => resetPassword(member.id)}
                        >
                          重置密码
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-sm text-[var(--accent-crimson)]"
                          onClick={() => clearMember(member.id, member.name)}
                        >
                          清退
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost text-sm"
                        onClick={() => restoreMember(member.id, member.name)}
                      >
                        恢复在盟
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
