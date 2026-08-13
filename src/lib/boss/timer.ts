/**
 * BOSS countdown rules (Beijing wall-clock via ISO timestamps):
 *
 * 1. Member UI always counts down to `nextSpawnAt` (never to lastKillAt).
 * 2. Set next refresh: nextSpawnAt = chosen time; lastKillAt = next − interval.
 * 3. Record kill: lastKillAt = chosen time (must be ≤ now); nextSpawnAt = kill + interval.
 */

const SKEW_MS = 60_000; // 1 minute clock skew tolerance

export function computeTimerFromNextSpawn(
  nextSpawnAtIso: string,
  intervalHours: number,
): { lastKillAt: string; nextSpawnAt: string } {
  const nextMs = new Date(nextSpawnAtIso).getTime();
  const intervalMs = Math.max(0, intervalHours) * 60 * 60 * 1000;
  return {
    nextSpawnAt: new Date(nextMs).toISOString(),
    lastKillAt: new Date(nextMs - intervalMs).toISOString(),
  };
}

export function computeTimerFromKill(
  lastKillAtIso: string,
  intervalHours: number,
  nowMs: number = Date.now(),
):
  | { ok: true; lastKillAt: string; nextSpawnAt: string }
  | { ok: false; error: string } {
  const killMs = new Date(lastKillAtIso).getTime();
  if (Number.isNaN(killMs)) {
    return { ok: false, error: "击杀时间无效" };
  }
  if (killMs > nowMs + SKEW_MS) {
    return {
      ok: false,
      error:
        "击杀时间不能是未来。若要倒计时到某个时刻，请用下方「设下次刷新」。",
    };
  }
  const intervalMs = Math.max(0, intervalHours) * 60 * 60 * 1000;
  return {
    ok: true,
    lastKillAt: new Date(killMs).toISOString(),
    nextSpawnAt: new Date(killMs + intervalMs).toISOString(),
  };
}
