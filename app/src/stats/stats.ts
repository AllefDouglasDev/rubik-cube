// Solve statistics following WCA conventions. DNF is represented as Infinity.

export type Penalty = "none" | "+2" | "dnf";

export interface TimedResult {
  timeMs: number;
  penalty: Penalty;
}

export const DNF = Infinity;

export function effectiveMs({ timeMs, penalty }: TimedResult): number {
  if (penalty === "dnf") return DNF;
  return penalty === "+2" ? timeMs + 2000 : timeMs;
}

// Average of the last `n` results, trimming ceil(5%) from each end (1 for ao5 and ao12).
// DNFs sort as the worst; if one survives the trim the average is DNF. Returns null with fewer than n results.
export function averageOf(results: TimedResult[], n: number): number | null {
  if (results.length < n) return null;
  const times = results.slice(-n).map(effectiveMs).sort((a, b) => a - b);
  const trim = Math.ceil(n * 0.05);
  const kept = times.slice(trim, n - trim);
  if (kept.includes(DNF)) return DNF;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

// Plain mean of the last `n` results (mo3). Any DNF makes it DNF.
export function meanOf(results: TimedResult[], n: number): number | null {
  if (results.length < n) return null;
  const times = results.slice(-n).map(effectiveMs);
  if (times.includes(DNF)) return DNF;
  return times.reduce((a, b) => a + b, 0) / n;
}

// Rolling average ending at each index (null while there are fewer than n results).
export function rollingAverage(results: TimedResult[], n: number): (number | null)[] {
  return results.map((_, i) => averageOf(results.slice(0, i + 1), n));
}

function minOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? Math.min(...valid) : null;
}

export interface SessionStats {
  count: number;
  dnfCount: number;
  best: number | null;
  worst: number | null;
  mean: number | null;
  stdDev: number | null;
  mo3: number | null;
  ao5: number | null;
  ao12: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
}

export function sessionStats(results: TimedResult[]): SessionStats {
  const times = results.map(effectiveMs);
  const finished = times.filter((t) => t !== DNF);
  const mean = finished.length ? finished.reduce((a, b) => a + b, 0) / finished.length : null;
  const stdDev =
    mean !== null && finished.length > 1
      ? Math.sqrt(finished.reduce((acc, t) => acc + (t - mean) ** 2, 0) / (finished.length - 1))
      : null;
  return {
    count: results.length,
    dnfCount: times.length - finished.length,
    best: finished.length ? Math.min(...finished) : null,
    worst: finished.length ? Math.max(...finished) : null,
    mean,
    stdDev,
    mo3: meanOf(results, 3),
    ao5: averageOf(results, 5),
    ao12: averageOf(results, 12),
    bestAo5: minOrNull(rollingAverage(results, 5)),
    bestAo12: minOrNull(rollingAverage(results, 12)),
  };
}

// 9.87 · 1:02.34 · DNF · "-" for null.
export function formatTime(ms: number | null, digits = 2): string {
  if (ms === null || Number.isNaN(ms)) return "-";
  if (ms === DNF) return "DNF";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const factor = 10 ** digits;
  const fixed = (Math.floor(seconds * factor) / factor).toFixed(digits);
  return minutes > 0 ? `${minutes}:${fixed.padStart(digits === 0 ? 2 : digits + 3, "0")}` : fixed;
}

export function formatResult(result: TimedResult): string {
  if (result.penalty === "dnf") return `DNF(${formatTime(result.timeMs)})`;
  return result.penalty === "+2" ? `${formatTime(result.timeMs + 2000)}+` : formatTime(result.timeMs);
}

// Signed difference, e.g. "+1.23" / "-0.45"; null when either side is missing or DNF.
export function formatDelta(ms: number | null, reference: number | null): string | null {
  if (ms === null || reference === null || ms === DNF || reference === DNF) return null;
  const diff = ms - reference;
  return `${diff >= 0 ? "+" : "-"}${formatTime(Math.abs(diff))}`;
}
