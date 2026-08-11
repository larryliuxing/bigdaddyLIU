"use client";

import { useEffect, useRef, useState } from "react";

interface AdminLoginModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminLoginModal({ onClose, onSuccess }: AdminLoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
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
        aria-labelledby="admin-login-title"
      >
        <h2 id="admin-login-title" className="text-lg font-semibold">
          管理员登录
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          使用管理员账号进入后台管理
        </p>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="field"
            type="text"
            placeholder="管理员账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="field"
            type="password"
            placeholder="管理员密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && (
            <p className="text-sm text-[var(--accent-crimson)]">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-primary flex-[1.4]" disabled={loading}>
              {loading ? "验证中..." : "进入后台"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
