"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AuctionItem,
  AuctionRoomState,
  AuctionSessionSummary,
  DividendEntry,
  Member,
} from "@/lib/types";
import {
  beijingDateFromIso,
  beijingHmFromIso,
  beijingTodayDate,
  formatBeijingSessionLabel,
  formatCountdown,
  fromBeijingDateAndTime,
  isSessionEditable,
  qualityMeta,
  sessionLifecycleLabel,
} from "@/lib/auction/client";
import { AddAuctionItemForm } from "./AddAuctionItemForm";

function statusTone(status: AuctionSessionSummary["status"]) {
  if (status === "live") return "bg-emerald-500/15 text-emerald-300";
  if (status === "ended") return "bg-slate-500/20 text-slate-300";
  return "bg-amber-500/15 text-amber-200";
}

export function AuctionManagePanel({
  initialMembers,
  adminName,
}: {
  initialMembers: Member[];
  adminName: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AuctionSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [room, setRoom] = useState<AuctionRoomState | null>(null);
  const [createDate, setCreateDate] = useState(beijingTodayDate);
  const [createTime, setCreateTime] = useState("15:00");
  const [createDuration, setCreateDuration] = useState(30);
  const [editDate, setEditDate] = useState(beijingTodayDate);
  const [editTime, setEditTime] = useState("15:00");
  const [editDuration, setEditDuration] = useState(30);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dividends, setDividends] = useState<DividendEntry[]>([]);
  const [dividendsCalculated, setDividendsCalculated] = useState(false);
  const [tempMemberId, setTempMemberId] = useState("");
  const [tempAmount, setTempAmount] = useState(0);

  const syncEditFields = useCallback((nextRoom: AuctionRoomState | null) => {
    const session = nextRoom?.session;
    if (!session) return;
    const start = session.scheduledStart || session.startedAt;
    if (start) {
      setEditDate(beijingDateFromIso(start));
      setEditTime(beijingHmFromIso(start));
    }
    setEditDuration(session.durationMinutes || 30);
  }, []);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/auction/session");
    const data = await res.json();
    if (!res.ok) return;
    setSessions(data.sessions || []);
  }, []);

  const loadDetail = useCallback(
    async (sessionId: number) => {
      const res = await fetch(`/api/auction/session?sessionId=${sessionId}`);
      const data = await res.json();
      if (!res.ok) return;
      setSessions(data.sessions || []);
      setRoom(data.room);
      syncEditFields(data.room);
      setDividends(data.room?.dividends || []);
      setDividendsCalculated(Boolean(data.room?.dividendsCalculated));
    },
    [syncEditFields],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadList]);

  useEffect(() => {
    if (selectedId == null) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/auction/session?sessionId=${selectedId}`);
      const data = await res.json();
      if (!alive || !res.ok) return;
      setSessions(data.sessions || []);
      setRoom(data.room);
      setDividends(data.room?.dividends || []);
      setDividendsCalculated(Boolean(data.room?.dividendsCalculated));
    };
    const timeout = window.setTimeout(() => {
      void tick();
    }, 0);
    const timer = window.setInterval(() => {
      void tick();
    }, 4000);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    };
  }, [selectedId]);

  async function createSession() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const scheduledStart = fromBeijingDateAndTime(createDate, createTime);
      const res = await fetch("/api/auction/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          scheduledStart,
          durationMinutes: createDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
        return;
      }
      setSessions(data.sessions || []);
      setMessage(
        `已新建场次：${formatBeijingSessionLabel(scheduledStart)}（北京时间）`,
      );
      setCreateDate(beijingTodayDate());
      setCreateTime("15:00");
      setCreateDuration(30);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (selectedId == null) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const scheduledStart = fromBeijingDateAndTime(editDate, editTime);
      const res = await fetch("/api/auction/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSchedule",
          sessionId: selectedId,
          scheduledStart,
          durationMinutes: editDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存失败");
        return;
      }
      setSessions(data.sessions || []);
      setRoom(data.room);
      syncEditFields(data.room);
      setMessage("场次时间已更新");
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(sessionId: number, label: string) {
    const ok = window.confirm(
      `确认删除场次「${label}」？\n\n删除不可恢复，该场次下全部拍品也将一并删除。`,
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "删除失败");
        return;
      }
      setSessions(data.sessions || []);
      if (selectedId === sessionId) {
        setSelectedId(null);
        setRoom(null);
      }
      setMessage("场次已删除");
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function sessionAction(action: string) {
    if (selectedId == null) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "操作失败");
        return;
      }
      setSessions(data.sessions || []);
      setRoom(data.room);
      const labels: Record<string, string> = {
        start: "拍卖已开始，全部拍品同时竞拍",
        end: "拍卖已结束",
      };
      setMessage(labels[action] || "完成");
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: number) {
    if (!window.confirm("确认删除该拍品？删除不可恢复。")) return;
    if (selectedId == null) return;
    const res = await fetch(
      `/api/auction/items?id=${id}&sessionId=${selectedId}`,
      { method: "DELETE" },
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "删除失败");
      return;
    }
    setRoom(data.room);
    await loadList();
  }

  async function calculateDividends() {
    if (selectedId == null) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculate", sessionId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "计算失败");
        return;
      }
      setDividends(data.dividends || []);
      setDividendsCalculated(true);
      setMessage("分红已自动计算完成，可临时加人调整");
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function addTemporaryDividend() {
    if (selectedId == null) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auction/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTemporary",
          sessionId: selectedId,
          memberId: tempMemberId ? Number(tempMemberId) : null,
          memberName:
            initialMembers.find((m) => String(m.id) === tempMemberId)?.name ||
            "",
          amount: tempAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setDividends(data.dividends || []);
      setMessage("已临时加人调整");
      setTempAmount(0);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function updateDividendAmount(id: number, next: number) {
    if (selectedId == null) return;
    const res = await fetch("/api/auction/dividends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateAmount",
        sessionId: selectedId,
        id,
        amount: next,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "更新失败");
      return;
    }
    setDividends(data.dividends || []);
  }

  async function openSession(sessionId: number) {
    setError("");
    setMessage("");
    setSelectedId(sessionId);
    await loadDetail(sessionId);
  }

  const session = room?.session;
  const items: AuctionItem[] = room?.items ?? [];
  const editable = session ? isSessionEditable(session.status) : false;
  const dividendTotal = dividends.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">拍卖管理</p>
            <h1 className="mt-1 text-2xl font-bold">
              {selectedId == null ? "场次管理" : "场次详情"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              管理员：{adminName} · 时间均为北京时间
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedId != null && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  setSelectedId(null);
                  setRoom(null);
                  setError("");
                  setMessage("");
                  void loadList();
                }}
              >
                返回场次列表
              </button>
            )}
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
              onClick={() => router.push("/auction")}
            >
              查看拍卖大厅
            </button>
          </div>
        </header>

        {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}
        {error && (
          <p className="mb-3 text-sm text-[var(--accent-crimson)]">{error}</p>
        )}

        {selectedId == null ? (
          <>
            <section className="mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
              <h2 className="text-sm font-medium text-[var(--text-muted)]">
                新建场次
              </h2>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block flex-1 space-y-1.5">
                  <span className="text-xs text-[var(--text-muted)]">日期</span>
                  <input
                    className="field"
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                  />
                </label>
                <label className="block flex-1 space-y-1.5">
                  <span className="text-xs text-[var(--text-muted)]">
                    开始时间
                  </span>
                  <input
                    className="field"
                    type="time"
                    value={createTime}
                    onChange={(e) => setCreateTime(e.target.value)}
                  />
                </label>
                <label className="block flex-1 space-y-1.5">
                  <span className="text-xs text-[var(--text-muted)]">
                    时长（分钟）
                  </span>
                  <input
                    className="field"
                    type="number"
                    min={5}
                    max={180}
                    value={createDuration}
                    onChange={(e) => setCreateDuration(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary sm:max-w-[140px]"
                  disabled={busy}
                  onClick={createSession}
                >
                  保存
                </button>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
              <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
                场次列表（{sessions.length}）
              </div>
              <ul className="divide-y divide-[var(--border-soft)]">
                {sessions.length === 0 && (
                  <li className="px-4 py-8 text-sm text-[var(--text-muted)]">
                    暂无场次。请先在上方新建并保存。
                  </li>
                )}
                {sessions.map((s) => {
                  const label = formatBeijingSessionLabel(
                    s.scheduledStart || s.startedAt,
                  );
                  const canEdit = isSessionEditable(s.status);
                  return (
                    <li
                      key={s.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openSession(s.id)}
                      >
                        <p className="font-medium text-[var(--text-primary)]">
                          {label}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          时长 {s.durationMinutes} 分钟 · 拍品 {s.itemCount} 件
                          · 点击进入
                        </p>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${statusTone(s.status)}`}
                        >
                          {sessionLifecycleLabel(s.status)}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            className="btn-ghost text-xs text-[var(--accent-crimson)]"
                            disabled={busy}
                            onClick={() => deleteSession(s.id, label)}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        ) : (
          <>
            <section className="mb-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">当前场次</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {formatBeijingSessionLabel(
                      session?.scheduledStart || session?.startedAt,
                    )}
                  </h2>
                </div>
                {session && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${statusTone(session.status)}`}
                  >
                    {sessionLifecycleLabel(session.status)}
                  </span>
                )}
              </div>

              {editable ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="block flex-1 space-y-1.5">
                    <span className="text-xs text-[var(--text-muted)]">日期</span>
                    <input
                      className="field"
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </label>
                  <label className="block flex-1 space-y-1.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      开始时间
                    </span>
                    <input
                      className="field"
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                    />
                  </label>
                  <label className="block flex-1 space-y-1.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      时长（分钟）
                    </span>
                    <input
                      className="field"
                      type="number"
                      min={5}
                      max={180}
                      value={editDuration}
                      onChange={(e) => setEditDuration(Number(e.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-primary sm:max-w-[140px]"
                    disabled={busy}
                    onClick={saveSchedule}
                  >
                    保存更改
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  进行中 / 已完成场次不可更改，仅作记录保留。
                  {session?.status === "live" && (
                    <span className="ml-2">
                      剩余 {formatCountdown(room?.remainingSeconds ?? null)}
                    </span>
                  )}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {editable && (
                  <>
                    <button
                      type="button"
                      className="rounded-xl bg-[#e23d4a] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={busy}
                      onClick={() => sessionAction("start")}
                    >
                      立即开始拍卖
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-sm text-[var(--accent-crimson)]"
                      disabled={busy}
                      onClick={() =>
                        deleteSession(
                          selectedId,
                          formatBeijingSessionLabel(
                            session?.scheduledStart || session?.startedAt,
                          ),
                        )
                      }
                    >
                      删除场次
                    </button>
                  </>
                )}
                {session?.status === "live" && (
                  <button
                    type="button"
                    className="btn-ghost text-sm"
                    disabled={busy}
                    onClick={() => sessionAction("end")}
                  >
                    结束拍卖
                  </button>
                )}
              </div>
            </section>

            {editable && (
              <AddAuctionItemForm
                members={initialMembers}
                sessionId={selectedId}
                onCreated={() => {
                  setMessage("拍品已添加");
                  void loadDetail(selectedId);
                }}
              />
            )}

            <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)]">
              <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
                {editable ? "本场拍品" : "拍品记录"}（{items.length}）
              </div>
              <ul className="divide-y divide-[var(--border-soft)]">
                {items.length === 0 && (
                  <li className="px-4 py-6 text-sm text-[var(--text-muted)]">
                    {editable
                      ? "尚未添加拍品，请在上方添加。"
                      : "该场次没有拍品记录。"}
                  </li>
                )}
                {items.map((item) => {
                  const q = qualityMeta(item.quality);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {item.imageData ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageData}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1c2230] text-xs text-[var(--text-muted)]">
                            无图
                          </div>
                        )}
                        <div>
                          <p className="font-medium">
                            <span
                              className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                              style={{ background: q.color }}
                            />
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            起拍 ¥{item.startPrice} · 加价 ¥{item.bidIncrement} ·{" "}
                            {item.status}
                            {item.soldPrice != null
                              ? ` · 成交 ¥${item.soldPrice}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      {editable &&
                        (item.status === "pending" ||
                          item.status === "cancelled") && (
                          <button
                            type="button"
                            className="btn-ghost text-sm text-[var(--accent-crimson)]"
                            onClick={() => removeItem(item.id)}
                          >
                            删除
                          </button>
                        )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {session?.status === "ended" && (
              <section className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[rgba(18,22,34,0.95)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-[var(--text-muted)]">
                    分红计算与调整
                  </h2>
                  <span className="text-xs text-[var(--text-muted)]">
                    合计 ¥{dividendTotal.toFixed(2)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-[#e23d4a] px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={busy}
                    onClick={calculateDividends}
                  >
                    {dividendsCalculated ? "重新计算分红" : "自动计算分红"}
                  </button>
                </div>
                <ul className="mt-4 divide-y divide-[var(--border-soft)]">
                  {dividends.length === 0 && (
                    <li className="py-4 text-sm text-[var(--text-muted)]">
                      暂无分红。可点击上方计算。
                    </li>
                  )}
                  {dividends.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="font-medium">
                        {entry.memberName}
                        {entry.isTemporary && (
                          <span className="ml-2 text-xs text-[var(--accent-amber)]">
                            临时
                          </span>
                        )}
                      </p>
                      <input
                        className="field !w-32"
                        type="number"
                        step="0.01"
                        value={entry.amount}
                        onChange={(e) =>
                          updateDividendAmount(entry.id, Number(e.target.value))
                        }
                      />
                    </li>
                  ))}
                </ul>
                {dividendsCalculated && (
                  <div className="mt-4 border-t border-[var(--border-soft)] pt-4">
                    <h3 className="text-sm font-medium text-[var(--text-muted)]">
                      临时加人调整
                    </h3>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select
                        className="field"
                        value={tempMemberId}
                        onChange={(e) => setTempMemberId(e.target.value)}
                      >
                        <option value="">选择成员</option>
                        {initialMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="field sm:max-w-[140px]"
                        type="number"
                        step="0.01"
                        placeholder="金额"
                        value={tempAmount}
                        onChange={(e) => setTempAmount(Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="btn-primary sm:max-w-[120px]"
                        disabled={busy || !tempMemberId || !(tempAmount > 0)}
                        onClick={addTemporaryDividend}
                      >
                        添加
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
