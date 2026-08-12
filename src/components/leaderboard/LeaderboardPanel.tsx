"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  LeaderboardEntry,
  LeaderboardStats,
  SessionUser,
} from "@/lib/types";
import { parseCombatPowerScreenshot } from "@/lib/leaderboard/parse";
import { recognizeCombatPowerScreenshot } from "@/lib/leaderboard/recognize";
import { TrophyIcon } from "@/components/Icons";
import { hubPath } from "@/lib/nav";

export function LeaderboardPanel({
  member,
  isAdmin,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pasteRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<LeaderboardStats>({
    count: 0,
    average: 0,
    threshold: 0,
    thresholdRatio: 0.85,
  });
  const [imageData, setImageData] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrNameText, setOcrNameText] = useState("");
  const [ocrPowerText, setOcrPowerText] = useState("");
  const [previewPower, setPreviewPower] = useState<number | null>(null);
  const [previewNameOk, setPreviewNameOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (!alive || !res.ok) return;
      setEntries(data.entries || []);
      setStats(data.stats);
    };
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, []);

  async function handleImage(file: File) {
    setError("");
    setMessage("");
    setStatus("正在识别截图…");
    setPreviewPower(null);
    setPreviewNameOk(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      setImageData(dataUrl);
      try {
        // Blue name crops + combat-power crops (kept separate)
        const ocr = await recognizeCombatPowerScreenshot(file);
        setOcrText(ocr.text);
        setOcrNameText(ocr.nameText);
        setOcrPowerText(ocr.powerText);

        if (!member) {
          setStatus("已识别，请以成员身份登录后提交");
          setPreviewNameOk(null);
          setPreviewPower(null);
        } else {
          const parsed = parseCombatPowerScreenshot(
            { nameText: ocr.nameText, powerText: ocr.powerText, text: ocr.text },
            member.name,
          );
          setPreviewNameOk(parsed.detectedName === member.name || parsed.ok);
          setPreviewPower(parsed.combatPower);
          if (!parsed.ok) {
            setStatus(parsed.error || "识别未通过");
          } else {
            setStatus(
              `识别成功：${member.name} · 战斗力 ${parsed.combatPower}，可提交上榜`,
            );
          }
        }
      } catch {
        setStatus("识别失败，请重试或更换截图");
      }
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (file) void handleImage(file);
      return;
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleImage(file);
    e.target.value = "";
  }

  async function submit() {
    if (!member) {
      setError("请先选择身份登录");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocrText,
          ocrNameText,
          ocrPowerText,
          imageData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "提交失败");
        return;
      }
      setEntries(data.board.entries);
      setStats(data.board.stats);
      setMessage(`已更新战力：${data.combatPower}`);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelf() {
    if (!member) return;
    if (!window.confirm("确认从排行榜移除自己的战力记录？")) return;
    const res = await fetch("/api/leaderboard", { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "移除失败");
      return;
    }
    setEntries(data.board.entries);
    setStats(data.board.stats);
    setMessage("已移除自己的记录");
  }

  async function removeEntry(memberId: number) {
    if (!isAdmin) return;
    if (!window.confirm("确认删除该成员排行记录？")) return;
    const res = await fetch(`/api/leaderboard?memberId=${memberId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    setEntries(data.board.entries);
    setStats(data.board.stats);
  }

  const myEntry = member
    ? entries.find((e) => e.memberId === member.id)
    : null;

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <div className="grid-bg" />

        <header className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="feature-icon"
              style={{ background: "linear-gradient(145deg, #3a3a20, #222214)" }}
            >
              <TrophyIcon />
            </span>
            <div>
              <h1 className="text-2xl font-bold">排行榜</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                上传战力截图更新数据 · 当前身份：
                {member?.name ?? (isAdmin ? "管理员" : "未登录")}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => router.push(hubPath(Boolean(member), isAdmin))}
          >
            返回导航
          </button>
        </header>

        <section className="relative z-10 mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
            <p className="text-xs text-[var(--text-muted)]">上榜人数</p>
            <p className="mt-1 text-2xl font-semibold">{stats.count}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
            <p className="text-xs text-[var(--text-muted)]">平均战力</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--accent-gold)]">
              {stats.average || "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
            <p className="text-xs text-[var(--text-muted)]">
              合格线（平均 × 85%）
            </p>
            <p className="mt-1 text-2xl font-semibold">{stats.threshold || "-"}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              低于该值名字标红
            </p>
          </div>
        </section>

        {member && (
          <section className="relative z-10 mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              上传本人战力截图
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              截图需包含顶部蓝色角色名「{member.name}」与「战斗力」数值。名字只识别蓝色中文，不会把「CT」类英文噪点或底部白字当成角色名。
            </p>

            <div
              ref={pasteRef}
              tabIndex={0}
              onPaste={onPaste}
              className="mt-3 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#0f1320] px-4 text-center outline-none focus:border-[rgba(123,108,255,0.5)]"
            >
              {imageData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageData}
                  alt="战力截图"
                  className="max-h-52 rounded-lg object-contain"
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  点击此处后 Ctrl+V 粘贴截图，或选择文件上传
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="btn-ghost cursor-pointer text-sm">
                选择图片
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onFileChange}
                />
              </label>
              <button
                type="button"
                className="rounded-xl bg-[#e23d4a] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy || !ocrText}
                onClick={submit}
              >
                {busy ? "提交中…" : "提交上榜"}
              </button>
              {myEntry && (
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  onClick={removeSelf}
                >
                  移除我的记录
                </button>
              )}
            </div>

            {status && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">{status}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {previewNameOk != null && (
                <span
                  className={
                    previewNameOk ? "text-emerald-400" : "text-[var(--accent-crimson)]"
                  }
                >
                  名字校验：{previewNameOk ? "一致" : "不一致"}
                </span>
              )}
              {previewPower != null && (
                <span className="text-[var(--accent-gold)]">
                  识别战力：{previewPower}
                </span>
              )}
            </div>
          </section>
        )}

        {!member && (
          <section className="relative z-10 mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4 text-sm text-[var(--text-muted)]">
            请先在首页选择身份登录后，再上传本人战力截图。
          </section>
        )}

        {message && (
          <p className="relative z-10 mb-3 text-sm text-emerald-400">{message}</p>
        )}
        {error && (
          <p className="relative z-10 mb-3 text-sm text-[var(--accent-crimson)]">
            {error}
          </p>
        )}

        <section className="relative z-10 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
          <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            战力排行（按战斗力从高到低）
          </div>
          <ul className="divide-y divide-[var(--border-soft)]">
            {entries.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                暂无上榜数据，请上传截图
              </li>
            )}
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 text-center text-sm text-[var(--text-muted)]">
                    #{entry.rank}
                  </span>
                  <div>
                    <p
                      className={`font-medium ${
                        entry.belowThreshold
                          ? "text-[var(--accent-crimson)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      {entry.memberName}
                      {entry.belowThreshold && (
                        <span className="ml-2 text-xs font-normal opacity-80">
                          未达 85%
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      更新于 {entry.updatedAt}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-semibold text-[var(--accent-gold)]">
                    {entry.combatPower}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-ghost text-xs text-[var(--accent-crimson)]"
                      onClick={() => removeEntry(entry.memberId)}
                    >
                      删除
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
