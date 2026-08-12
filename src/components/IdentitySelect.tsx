"use client";

import { useMemo, useState } from "react";
import type { Member } from "@/lib/types";
import { AdminLoginModal } from "./AdminLoginModal";
import { LockIcon, SettingsIcon, UserAvatarIcon } from "./Icons";
import { PasswordModal } from "./PasswordModal";

function roleClass(role: Member["role"]) {
  if (role === "leader") return "role-leader";
  if (role === "officer") return "role-officer";
  return "";
}

function hardNavigate(path: string) {
  // Full navigation so the newly set session cookie is always sent
  window.location.assign(path);
}

export function IdentitySelect({ members }: { members: Member[] }) {
  const [list, setList] = useState(members);
  const [selected, setSelected] = useState<Member | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const ordered = useMemo(
    () =>
      [...list].sort((a, b) => {
        const rank = { leader: 0, officer: 1, normal: 2 };
        return rank[a.role] - rank[b.role] || a.id - b.id;
      }),
    [list],
  );

  return (
    <div className="app-shell">
      <div className="app-frame">
        <button
          type="button"
          className="absolute right-4 top-4 z-10 rounded-full border border-[var(--border-soft)] bg-[rgba(20,24,36,0.8)] p-2.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          aria-label="管理员入口"
          title="管理员后台（账户与拍卖管理）"
          onClick={() => setShowAdmin(true)}
        >
          <SettingsIcon />
        </button>

        <header className="animate-fade-up mt-6 flex flex-col items-center text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent-gold)]">
            Lineage 2 Covenant
          </p>
          <h1 className="mt-2 text-[1.95rem] font-extrabold leading-tight tracking-wide sm:text-[2.25rem]">
            天堂2盟约
          </h1>
          <p className="mt-1.5 text-base font-semibold text-[var(--text-primary)] sm:text-lg">
            费沙服务器专用盟助手
          </p>
          <div className="avatar-ring mt-6 rounded-full p-1">
            <UserAvatarIcon className="h-20 w-20" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-wide">选择身份</h2>
          <p className="mt-3 max-w-[20rem] text-sm leading-6 text-[var(--text-muted)]">
            首次选择需设置至少 6 位密码；已设密码的身份需验证密码后方可使用。成员登录后也可在首页齿轮进入管理员后台。
          </p>
        </header>

        <section className="animate-fade-up-delay mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              成员
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {ordered.length} 人
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {ordered.map((member) => (
              <button
                key={member.id}
                type="button"
                className="member-chip"
                onClick={() => setSelected(member)}
              >
                <LockIcon />
                <span className={`text-sm font-medium ${roleClass(member.role)}`}>
                  {member.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {selected && (
          <PasswordModal
            member={selected}
            onClose={() => setSelected(null)}
            onSuccess={() => {
              setList((prev) =>
                prev.map((m) =>
                  m.id === selected.id ? { ...m, hasPassword: true } : m,
                ),
              );
              setSelected(null);
              hardNavigate("/home");
            }}
          />
        )}

        {showAdmin && (
          <AdminLoginModal
            onClose={() => setShowAdmin(false)}
            onSuccess={() => {
              setShowAdmin(false);
              hardNavigate("/admin");
            }}
          />
        )}
      </div>
    </div>
  );
}
