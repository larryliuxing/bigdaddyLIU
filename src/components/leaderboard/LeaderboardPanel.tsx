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

function formatPower(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

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

function RankCircle({ rank }: { rank: number }) {
  if (rank === 1) return <span className="lb-rank-badge lb-rank-1">1</span>;
  if (rank === 2) return <span className="lb-rank-badge lb-rank-2">2</span>;
  if (rank === 3) return <span className="lb-rank-badge lb-rank-3">3</span>;
  return <span className="lb-rank-n">{rank}</span>;
}

function NameButton({
  entry,
  onOpen,
}: {
  entry: LeaderboardEntry;
  onOpen: (entry: LeaderboardEntry) => void;
}) {
  return (
    <button
      type="button"
      className={`lb-name-link ${entry.belowThreshold ? "danger" : ""}`}
      disabled={!entry.hasImage}
      title={
        entry.hasImage ? "点击查看上传截图" : "该成员暂无上传截图"
      }
      onClick={() => {
        if (entry.hasImage) onOpen(entry);
      }}
    >
      {entry.memberName}
    </button>
  );
}

export function LeaderboardPanel({
  member,
}: {
  member: Extract<SessionUser, { type: "member" }> | null;
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
  const [showUpload, setShowUpload] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<File | string | null>(null);
  const [ocrNameText, setOcrNameText] = useState("");
  const [namePreview, setNamePreview] = useState<string | null>(null);
  const [clickMark, setClickMark] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [powerTop, setPowerTop] = useState<number | null>(null);
  const [combatPower, setCombatPower] = useState<number | null>(null);
  const [ocrPowerTopText, setOcrPowerTopText] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [previewNameOk, setPreviewNameOk] = useState<boolean | null>(null);
  const [powersOk, setPowersOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recognizingName, setRecognizingName] = useState(false);
  const [viewer, setViewer] = useState<{
    name: string;
    power: number;
    loading: boolean;
    imageData: string | null;
    error: string | null;
  } | null>(null);

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
    setCombatPower(null);
    setPowersOk(null);
    resetNameState();
    setOcrPowerTopText("");
    setOcrText("");

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || "");
      setImageData(dataUrl);
      setImageSource(file);
      try {
        const powers = await recognizeCombatPowers(file);
        setPowerTop(powers.powerTop);
        setCombatPower(powers.ok ? powers.combatPower : null);
        setPowersOk(powers.ok);
        setOcrPowerTopText(powers.powerTopText);
        setOcrText(powers.text);

        if (!powers.ok) {
          setStatus(
            `${powers.error || "未识别到左上角战力"}。请更换截图后重试。`,
          );
        } else if (!member) {
          setStatus(
            `战力已识别：${powers.combatPower}。请登录成员身份后点击蓝色角色名。`,
          );
        } else {
          setStatus(
            `战力已识别：${powers.combatPower}。请点击截图中的蓝色角色名「${member.name}」。`,
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

      if (powersOk && powerTop != null) {
        setCombatPower(powerTop);
        setStatus(
          `校验通过：${member.name} · 战力 ${powerTop}，可以提交上榜`,
        );
      } else {
        setStatus(
          `名字已确认是「${member.name}」，但左上角战力未识别（${powerTop ?? "-"}），请更换截图`,
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
          powerTop,
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
      setShowUpload(false);
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

  async function openScreenshot(entry: LeaderboardEntry) {
    if (!entry.hasImage) return;
    setViewer({
      name: entry.memberName,
      power: entry.combatPower,
      loading: true,
      imageData: null,
      error: null,
    });
    try {
      const res = await fetch(
        `/api/leaderboard/image?memberId=${entry.memberId}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setViewer({
          name: entry.memberName,
          power: entry.combatPower,
          loading: false,
          imageData: null,
          error: data.error || "加载截图失败",
        });
        return;
      }
      setViewer({
        name: entry.memberName,
        power: entry.combatPower,
        loading: false,
        imageData: data.imageData,
        error: null,
      });
    } catch {
      setViewer({
        name: entry.memberName,
        power: entry.combatPower,
        loading: false,
        imageData: null,
        error: "网络错误",
      });
    }
  }

  const top1 = entries.find((e) => e.rank === 1) ?? null;
  const top2 = entries.find((e) => e.rank === 2) ?? null;
  const top3 = entries.find((e) => e.rank === 3) ?? null;
  const myEntry = member
    ? entries.find((e) => e.memberId === member.id)
    : null;

  function podiumSlot(
    entry: LeaderboardEntry | null,
    rank: 1 | 2 | 3,
  ) {
    return (
      <div className={`lb-podium-slot rank-${rank}`}>
        <div className="lb-podium-card">
          <RankCircle rank={rank} />
          {entry ? (
            <>
              <div className="px-1">
                <NameButton entry={entry} onOpen={openScreenshot} />
              </div>
              <p className="mt-3 text-xl font-bold text-[var(--accent-gold)]">
                {formatPower(entry.combatPower)}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                战斗力
              </p>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                {entry.updatedAt}
              </p>
            </>
          ) : (
            <p className="mt-6 text-xs text-[var(--text-muted)]">虚位以待</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="lb-shell">
        <header className="relative mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ghost rounded-full px-3 text-sm"
            onClick={() => router.push(member ? "/home" : "/admin")}
          >
            返回导航
          </button>
          <p className="text-xs text-[var(--text-muted)]">
            {member?.name ?? ""}
          </p>
        </header>

        <h1 className="lb-title">战斗力排行榜</h1>

        <section className="lb-podium" aria-label="前三名">
          {podiumSlot(top2, 2)}
          {podiumSlot(top1, 1)}
          {podiumSlot(top3, 3)}
        </section>

        {member && (
          <>
            <button
              type="button"
              className="lb-cta"
              onClick={() => setShowUpload((v) => !v)}
            >
              我要上榜
            </button>
            <p className="lb-hint">
              粘贴或上传本人战斗力截图 · 识别游戏 ID 须与当前身份一致
            </p>
          </>
        )}

        {!member && (
          <p className="lb-hint mt-6">
            请先在首页选择身份登录后，再上传本人战力截图上榜。
          </p>
        )}

        {member && showUpload && (
          <section className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">
              上传本人战力截图
            </h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-[var(--text-muted)]">
              <li>上传完整游戏界面（自动识别左上角战力）</li>
              <li>
                在预览图上对准蓝色角色名「{member.name}」点击（尽量点在字上，不要点旁边图标）
              </li>
              <li>确认「名字截取预览」里主要是名字本身后，再提交上榜</li>
            </ol>

            <details className="mt-3 rounded-xl border border-[var(--border-soft)] bg-[#0f1320] p-3">
              <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
                查看识别结构示意
              </summary>
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/leaderboard-ocr-example.svg"
                  alt="战力截图识别结构示意"
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[#0b0f18]"
                />
              </div>
            </details>

            <div
              ref={pasteRef}
              tabIndex={0}
              onPaste={onPaste}
              className="mt-3 rounded-xl border border-dashed border-[rgba(255,255,255,0.18)] bg-[#0f1320] px-4 py-4 text-center outline-none focus:border-[rgba(232,168,74,0.5)]"
            >
              {imageData ? (
                <div className="relative mx-auto inline-block max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={shotRef}
                    src={imageData}
                    alt="战力截图，点击蓝色角色名"
                    className={`max-h-64 max-w-full rounded-lg object-contain ${
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
                <p className="min-h-[100px] py-8 text-sm text-[var(--text-muted)]">
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
                className="rounded-xl bg-[#e8a84a] px-4 py-2 text-sm font-semibold text-[#2a1c05] disabled:opacity-50"
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
                  战力识别：
                  {powersOk
                    ? `已识别（${combatPower}）`
                    : `未识别（左上 ${powerTop ?? "-"}）`}
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

        {message && (
          <p className="mt-3 text-center text-sm text-emerald-400">{message}</p>
        )}
        {error && (
          <p className="mt-3 text-center text-sm text-[var(--accent-crimson)]">
            {error}
          </p>
        )}

        <section className="lb-board">
          <div className="lb-board-head">
            <h2 className="text-lg font-bold">完整排名</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              平均战斗力{" "}
              <span className="text-[var(--accent-gold)]">
                {stats.average ? formatPower(stats.average) : "-"}
              </span>
              {" · "}
              合格战力{" "}
              <span className="text-[var(--accent-gold)]">
                {stats.threshold ? formatPower(stats.threshold) : "-"}
              </span>
              {" "}
              (平均的 85%)
            </p>
          </div>

          {entries.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              暂无上榜数据
            </p>
          ) : (
            <ul>
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className={`lb-row ${
                    member && entry.memberId === member.id ? "me" : ""
                  }`}
                >
                  <RankCircle rank={entry.rank} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <NameButton entry={entry} onOpen={openScreenshot} />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {entry.updatedAt}
                      {!entry.hasImage && " · 无截图"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="lb-power">{formatPower(entry.combatPower)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="lb-footer">
          共 {stats.count} 人 · 点击有截图的名字可查看大图互相检查
          {stats.count > 0 && " · 低于合格线的名字标红"}
        </p>
      </div>

      {viewer && (
        <div
          className="overlay"
          role="presentation"
          onClick={() => setViewer(null)}
        >
          <div
            className="modal-panel w-full max-w-lg rounded-2xl border border-[var(--border-soft)] bg-[#151925] p-4 shadow-[var(--shadow-glow)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${viewer.name} 的战力截图`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{viewer.name}</h3>
                <p className="mt-1 text-sm text-[var(--accent-gold)]">
                  战斗力 {formatPower(viewer.power)}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => setViewer(null)}
              >
                关闭
              </button>
            </div>
            {viewer.loading && (
              <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                加载截图中…
              </p>
            )}
            {viewer.error && (
              <p className="py-6 text-center text-sm text-[var(--accent-crimson)]">
                {viewer.error}
              </p>
            )}
            {viewer.imageData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewer.imageData}
                alt={`${viewer.name} 上传的战力截图`}
                className="max-h-[70vh] w-full rounded-xl object-contain bg-black"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
