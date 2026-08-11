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

const FEATURES = [
  {
    key: "auction",
    title: "拍卖",
    description: "物品竞拍、出价与分红管理",
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
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "member" }),
    });
    router.push("/");
    router.refresh();
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

        <header className="animate-fade-up relative z-10 flex items-start justify-between">
          <div>
            <p className="text-sm text-[var(--text-muted)]">欢迎回来</p>
            <h1 className="mt-1 text-2xl font-bold tracking-wide">{user.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[var(--border-soft)] bg-[rgba(20,24,36,0.8)] p-2.5 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              aria-label="管理员入口"
              title="后台管理"
              onClick={() => setShowAdmin(true)}
            >
              <SettingsIcon />
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={logout}>
              退出
            </button>
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
              router.push("/admin");
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
