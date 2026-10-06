// Spaced repetition for the algorithm trainer (Leitner boxes).
// A clean execution under the target time moves the case up a box; a mistake sends it back to box 1.
// Lower boxes are drawn more often; cases never practised count as box 1.
import type { AlgStat } from "../storage/db";

export const MAX_BOX = 5;
export const RECENT = 12;

export function emptyStat(key: string): AlgStat {
  return { key, box: 1, reps: 0, fails: 0, recentMs: [], lastAt: 0 };
}

export function recordAttempt(stat: AlgStat, result: { ok: boolean; ms?: number }, targetMs: number, now = Date.now()): AlgStat {
  const recentMs = result.ms !== undefined && result.ok ? [...stat.recentMs, result.ms].slice(-RECENT) : stat.recentMs;
  const fast = result.ms !== undefined && result.ms <= targetMs;
  return {
    ...stat,
    reps: stat.reps + 1,
    fails: stat.fails + (result.ok ? 0 : 1),
    recentMs,
    bestMs: result.ok && result.ms !== undefined ? Math.min(stat.bestMs ?? Infinity, result.ms) : stat.bestMs,
    box: !result.ok ? 1 : fast ? Math.min(MAX_BOX, stat.box + 1) : stat.box,
    lastAt: now,
  };
}

export function weight(stat: AlgStat | undefined): number {
  return 2 ** (MAX_BOX - (stat?.box ?? 1));
}

// Draws the next case, never repeating the previous one when there is a choice.
export function pickNext(keys: string[], stats: Map<string, AlgStat>, previous: string | null, random = Math.random): string {
  const pool = keys.length > 1 ? keys.filter((k) => k !== previous) : keys;
  const weights = pool.map((k) => weight(stats.get(k)));
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function meanRecent(stat: AlgStat | undefined): number | null {
  if (!stat?.recentMs.length) return null;
  const last = stat.recentMs.slice(-5);
  return last.reduce((a, b) => a + b, 0) / last.length;
}
