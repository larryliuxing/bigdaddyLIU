"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  LeaderboardEntry,
  LeaderboardStats,
  SessionUser,
} from "@/lib/types";
import { extractDetectedName } from "@/lib/leaderboard/parse";
import {
  recognizeCombatPowers,
  recognizeNameAtClick,
} from "@/lib/leaderboard/recognize";
import { TrophyIcon } from "@/components/Icons";
import { hubPath } from "@/lib/nav";

/** Map a click on an object-contain <img> to natural-image ratios. */
function clickToImageRatio(e: React.MouseEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dispW = nw * scale;
  const dispH = nh * scale;
  const offsetX = (rect.width - dispW) / 2;
  const offsetY = (rect.height - dispH) / 2;
  const x = (e.clientX - rect.left - offsetX) / dispW;
  const y = (e.clientY - rect.top - offsetY) / dispH;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { x, y };
}

export function LeaderboardPanel({
  member,
  isAdmin,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pasteRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLImageElement>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<LeaderboardStats>({
    count: 0,
    average: 0,
    threshold: 0,
    thresholdRatio: 0.85,
  });
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<File | string | null>(null);
  const [ocrNameText, setOcrNameText] = useState("");
  const [namePreview, setNamePreview] = useState<string | null>(null);
  const [clickMark, setClickMark] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [powerTop, setPowerTop] = useState<number | null>(null);
  const [powerBottom, setPowerBottom] = useState<number | null>(null);
  const [combatPower, setCombatPower] = useState<number | null>(null);
  const [ocrPowerTopText, setOcrPowerTopText] = useState("");
  const [ocrPowerBottomText, setOcrPowerBottomText] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [previewNameOk, setPreviewNameOk] = useState<boolean | null>(null);
  const [powersOk, setPowersOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recognizingName, setRecognizingName] = useState(false);

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

  function resetNameState() {
    setOcrNameText("");
    setNamePreview(null);
    setClickMark(null);
    setPreviewNameOk(null);
  }

  async function handleImage(file: File) {
    setError("");
    setMessage("");
    setStatus("正在识别战力数字…");
    setPowerTop(null);
    setPowerBottom(null);
    setCombatPower(null);
    setPowersOk(null);
    resetNameState();
    setOcrPowerTopText("");
    setOcrPowerBottomText("");
    setOcrText("");

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      setImageData(dataUrl);
      setImageSource(file);
      try {
        const powers = await recognizeCombatPowers(file);
        setPowerTop(powers.powerTop);
        setPowerBottom(powers.powerBottom);
        setCombatPower(powers.ok ? powers.combatPower : null);
        setPowersOk(powers.ok);
        setOcrPowerTopText(powers.powerTopText);
        setOcrPowerBottomText(powers.powerBottomText);
        setOcrText(powers.text);

        if (!powers.ok) {
          setStatus(
            `${powers.error || "战力识别未通过"}。仍可点击蓝色角色名，但需战力一致才能提交。`,
          );
        } else if (!member) {
          setStatus(
            `战力已识别：${powers.combatPower}。请登录成员身份后点击蓝色角色名。`,
          );
        } else {
          setStatus(
            `战力已识别：${powers.combatPower}（两处一致）。请点击截图中的蓝色角色名「${member.name}」。`,
          );
        }
      } catch {
        setStatus("战力识别失败，请重试或更换截图");
        setPowersOk(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!member || !imageSource || !imageData) return;
    const ratio = clickToImageRatio(e);
    if (!ratio) {
      setStatus("请点在截图画面内");
      return;
    }

    setRecognizingName(true);
    setError("");
    setClickMark(ratio);
    setStatus("正在识别你点击的蓝色名字…");
    try {
      const nameOcr = await recognizeNameAtClick(
        imageSource,
        ratio.x,
        ratio.y,
      );
      setOcrNameText(nameOcr.nameText);
      setNamePreview(nameOcr.previewDataUrl);

      const nameHit = extractDetectedName(nameOcr.nameText, member.name);
      setPreviewNameOk(nameHit.matched);

      if (!nameHit.matched) {
        setStatus(
          nameHit.detectedName
            ? `点击区域识别为「${nameHit.detectedName}」，与账号「${member.name}」不一致，请点准蓝色名字`
            : `未识别到「${member.name}」，请对准蓝色角色名再点一次`,
        );
        return;
      }

      if (powersOk && powerTop != null && powerBottom === powerTop) {
        setCombatPower(powerTop);
        setStatus(
          `校验通过：${member.name} · 战力 ${powerTop}，可以提交上榜`,
        );
      } else {
        setStatus(
          `名字已确认是「${member.name}」，但战力双校验未通过（左上 ${powerTop ?? "-"} / 中下 ${powerBottom ?? "-"}）`,
        );
      }
    } catch {
      setStatus("名字识别失败，请再对准蓝色字点击一次");
      setPreviewNameOk(false);
    } finally {
      setRecognizingName(false);
    }
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

  const canSubmit =
    Boolean(member) &&
    previewNameOk === true &&
    powersOk === true &&
    combatPower != null &&
    Boolean(ocrNameText);

  async function submit() {
    if (!member) {
      setError("请先选择身份登录");
      return;
    }
    if (!canSubmit) {
      setError("请先完成战力识别，并点击蓝色角色名通过校验");
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
          ocrPowerTopText,
          ocrPowerBottomText,
          powerTop,
          powerBottom,
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
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-[var(--text-muted)]">
              <li>上传完整游戏界面截图（系统自动识别左上与中下两处战力，须一致）</li>
              <li>
                在预览图上<strong className="text-[var(--text-primary)]">点击蓝色角色名「{member.name}」</strong>
                （点名字本身，不要点别处）
              </li>
              <li>名字与战力都通过后，再点「提交上榜」</li>
            </ol>

            <details className="mt-3 rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3" open>
              <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
                查看识别结构示意
              </summary>
              <div className="mt-3 space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/leaderboard-ocr-example.svg"
                  alt="战力截图识别结构：①蓝色名字 ②左上战力 ③中下战力"
                  className="w-full max-w-xl rounded-lg border border-[var(--border-soft)] bg-[#0b0f18]"
                />
                <ol className="list-decimal space-y-1 pl-5 text-xs leading-5 text-[var(--text-muted)]">
                  <li>头顶蓝色角色名（上传后点击这里校验）</li>
                  <li>左上角战力数字</li>
                  <li>角色脚下中下战力（须与②相同）</li>
                </ol>
              </div>
            </details>

            <div
              ref={pasteRef}
              tabIndex={0}
              onPaste={onPaste}
              className="mt-3 rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#0f1320] px-4 py-4 text-center outline-none focus:border-[rgba(123,108,255,0.5)]"
            >
              {imageData ? (
                <div className="relative mx-auto inline-block max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={shotRef}
                    src={imageData}
                    alt="战力截图，点击蓝色角色名"
                    className={`max-h-72 max-w-full rounded-lg object-contain ${
                      recognizingName ? "opacity-70" : "cursor-crosshair"
                    }`}
                    onClick={onImageClick}
                  />
                  {clickMark && shotRef.current && (
                    <span
                      className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#5eead4] bg-[rgba(94,234,212,0.35)]"
                      style={(() => {
                        const img = shotRef.current!;
                        const nw = img.naturalWidth || 1;
                        const nh = img.naturalHeight || 1;
                        const scale = Math.min(
                          img.clientWidth / nw,
                          img.clientHeight / nh,
                        );
                        const dispW = nw * scale;
                        const dispH = nh * scale;
                        const ox = (img.clientWidth - dispW) / 2;
                        const oy = (img.clientHeight - dispH) / 2;
                        return {
                          left: ox + clickMark.x * dispW,
                          top: oy + clickMark.y * dispH,
                        };
                      })()}
                    />
                  )}
                </div>
              ) : (
                <p className="min-h-[120px] py-10 text-sm text-[var(--text-muted)]">
                  点击此处后 Ctrl+V 粘贴截图，或选择文件上传
                </p>
              )}
            </div>

            {namePreview && (
              <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                <span>名字截取预览：</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={namePreview}
                  alt="名字区域预览"
                  className="h-10 rounded border border-[var(--border-soft)] bg-black object-contain"
                />
              </div>
            )}

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
                disabled={busy || !canSubmit}
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
              {powersOk != null && (
                <span
                  className={
                    powersOk ? "text-emerald-400" : "text-[var(--accent-crimson)]"
                  }
                >
                  战力双校验：
                  {powersOk
                    ? `一致（${combatPower}）`
                    : `未通过（左上 ${powerTop ?? "-"} / 中下 ${powerBottom ?? "-"}）`}
                </span>
              )}
              {previewNameOk != null && (
                <span
                  className={
                    previewNameOk
                      ? "text-emerald-400"
                      : "text-[var(--accent-crimson)]"
                  }
                >
                  名字校验：{previewNameOk ? "一致" : "不一致"}
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
