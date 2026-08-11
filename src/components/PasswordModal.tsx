"use client";

import { useEffect, useRef, useState } from "react";
import type { Member } from "@/lib/types";

interface PasswordModalProps {
  member: Member;
  onClose: () => void;
  onSuccess: () => void;
}

export function PasswordModal({
  member,
  onClose,
  onSuccess,
}: PasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstTime = !member.hasPassword;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }

    if (isFirstTime && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      onSuccess();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="modal-panel w-full max-w-sm rounded-2xl border border-[var(--border-soft)] bg-[#151925] p-5 shadow-[var(--shadow-glow)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-modal-title"
      >
        <h2 id="password-modal-title" className="text-lg font-semibold">
          {isFirstTime ? "设置密码" : "验证密码"}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          身份：<span className="text-[var(--text-primary)]">{member.name}</span>
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
          {isFirstTime
            ? "首次选择需设置至少 6 位密码"
            : "已设密码的身份需验证密码后方可使用"}
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="field"
            type="password"
            placeholder={isFirstTime ? "设置密码（至少 6 位）" : "输入密码"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isFirstTime ? "new-password" : "current-password"}
          />
          {isFirstTime && (
            <input
              className="field"
              type="password"
              placeholder="确认密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          )}
          {error && (
            <p className="text-sm text-[var(--accent-crimson)]">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-primary flex-[1.4]" disabled={loading}>
              {loading ? "处理中..." : isFirstTime ? "确认设置" : "进入"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
