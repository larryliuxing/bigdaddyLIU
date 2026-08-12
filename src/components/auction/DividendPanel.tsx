"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuctionSession, DividendReport } from "@/lib/types";
import { formatBeijingSessionLabel } from "@/lib/auction/client";
import { DividendReportView } from "./DividendReportView";

/** Member-facing read-only dividend view. Admin calculate/adjust is on /auction/manage. */
export function DividendPanel() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AuctionSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [session, setSession] = useState<AuctionSession | null>(null);
  const [report, setReport] = useState<DividendReport | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const qs =
        sessionId != null ? `?sessionId=${sessionId}` : "";
      const res = await fetch(`/api/auction/dividends${qs}`);
      const data = await res.json();
      if (!alive || !res.ok) return;
      const list = (data.sessions || []) as AuctionSession[];
      setSessions(list);
      const nextSession = (data.session as AuctionSession | null) ?? null;
      setSession(nextSession);
      if (sessionId == null && nextSession?.id != null) {
        setSessionId(nextSession.id);
      }
      setReport((data.report as DividendReport | null) ?? null);
    };
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [sessionId]);

  const endedSessions = sessions.filter((s) => s.status === "ended");

  return (
    <div className="app-shell">
      <div className="auction-frame">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--text-muted)]">拍卖</p>
            <h1 className="mt-1 text-2xl font-bold">分红公示</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              场次 #{session?.id ?? "-"} · 状态 {session?.status ?? "无"}
              {session?.scheduledStart || session?.startedAt
                ? ` · ${formatBeijingSessionLabel(session.scheduledStart || session.startedAt)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/auction")}
            >
              拍卖大厅
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => router.push("/home")}
            >
              返回导航
            </button>
          </div>
        </header>

        <p className="mb-4 text-sm text-[var(--text-muted)]">
          每件拍品分红与综合总表公开留存；战力不合格名字标红，仅供对照。
        </p>

        {endedSessions.length > 0 && (
          <label className="mb-4 block max-w-md space-y-1">
            <span className="text-xs text-[var(--text-muted)]">选择场次</span>
            <select
              className="field"
              value={sessionId ?? ""}
              onChange={(e) =>
                setSessionId(e.target.value ? Number(e.target.value) : null)
              }
            >
              {endedSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} ·{" "}
                  {formatBeijingSessionLabel(s.scheduledStart || s.startedAt)} ·{" "}
                  {s.status}
                </option>
              ))}
            </select>
          </label>
        )}

        <DividendReportView report={report} editable={false} />
      </div>
    </div>
  );
}
