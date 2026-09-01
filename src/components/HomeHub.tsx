"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/types";
import {
  ChevronRightIcon,
  GavelIcon,
  SettingsIcon,
  TimerIcon,
  TrophyIcon,
} from "./Icons";
import { AdminLoginModal } from "./AdminLoginModal";
import { logoutAndRedirect } from "@/lib/nav";
import { HOME_CHANGELOG } from "@/lib/changelog";

const FEATURES = [
  {
    key: "auction",
    title: "拍卖",
    description: "物品竞拍、出价与分红查看",
    iconBg: "linear-gradient(145deg, #4a2424, #2a1616)",
    icon: <GavelIcon />,
  },
  {
    key: "boss",
    title: "BOSS 计时器",
    description: "BOSS 刷新倒计时与击杀记录",
    iconBg: "linear-gradient(145deg, #243048, #171e2c)",
    icon: <TimerIcon />,
  },
  {
    key: "leaderboard",
    title: "排行榜",
    description: "战斗力排行与数据更新",
    iconBg: "linear-gradient(145deg, #3a3a20, #222214)",
    icon: <TrophyIcon />,
  },
] as const;

export function HomeHub({ user }: { user: Extract<SessionUser, { type: "member" }> }) {
  const router = useRouter();
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState("");

  async function logout() {
    await logoutAndRedirect("member", router);
  }

  function openFeature(key: string, title: string) {
    if (key === "auction") {
      router.push("/auction");
      return;
    }
    if (key === "leaderboard") {
      router.push("/leaderboard");
      return;
    }
    if (key === "boss") {
      router.push("/boss");
      return;
    }
    setToast(`${title} 功能开发中，敬请期待`);
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="grid-bg" />

        <header className="animate-fade-up relative z-10">
          <div className="pr-24 text-center sm:text-left">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent-gold)]">
              Lineage 2 Covenant
            </p>
            <h1 className="mt-2 text-[1.85rem] font-extrabold leading-tight tracking-wide sm:text-[2.15rem]">
              天堂2盟约
            </h1>
            <p className="mt-1.5 text-base font-semibold text-[var(--text-primary)] sm:text-lg">
              费沙服务器专用盟助手
            </p>
          </div>
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[var(--border-soft)] bg-[rgba(20,24,36,0.8)] p-2.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              aria-label="管理员入口"
              title="管理员后台"
              onClick={() => setShowAdmin(true)}
            >
              <SettingsIcon />
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={logout}>
              退出
            </button>
          </div>
          <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
            <p className="text-sm text-[var(--text-muted)]">欢迎回来</p>
            <p className="mt-0.5 text-xl font-bold tracking-wide">{user.name}</p>
          </div>
        </header>

        <section className="animate-fade-up-delay relative z-10 mt-10 space-y-3">
          {FEATURES.map((feature, index) => (
            <button
              key={feature.key}
              type="button"
              className={`feature-card ${index === 1 ? "animate-fade-up-delay" : ""} ${index === 2 ? "animate-fade-up-delay-2" : ""}`}
              onClick={() => openFeature(feature.key, feature.title)}
            >
              <span className="feature-icon" style={{ background: feature.iconBg }}>
                {feature.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">{feature.title}</span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">
                  {feature.description}
                </span>
              </span>
              <span className="text-[var(--text-muted)]">
                <ChevronRightIcon />
              </span>
            </button>
          ))}
        </section>

        <section className="animate-fade-up-delay-2 relative z-10 mt-6 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.92)]">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
            <h2 className="text-sm font-medium">更新公告</h2>
            <span className="text-xs text-[var(--text-muted)]">最近修复</span>
          </div>
          <div className="max-h-56 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:max-h-64">
            {HOME_CHANGELOG.map((group) => (
              <div key={group.date}>
                <p className="text-xs font-medium text-[var(--accent-gold)]">
                  {group.date}
                </p>
                <ul className="mt-1.5 space-y-1.5 text-sm text-[var(--text-muted)]">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent-gold)] opacity-70" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {toast && (
          <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--border-soft)] bg-[#1a2030] px-4 py-2 text-sm text-[var(--text-primary)] shadow-lg">
            {toast}
          </div>
        )}

        {showAdmin && (
          <AdminLoginModal
            onClose={() => setShowAdmin(false)}
            onSuccess={() => {
              setShowAdmin(false);
              window.location.assign("/admin");
            }}
          />
        )}
      </div>
    </div>
  );
}
