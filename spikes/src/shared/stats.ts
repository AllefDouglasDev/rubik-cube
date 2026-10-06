// Rolling window statistics for latency and throughput.
export class RollingStats {
  private values: number[] = [];

  constructor(private readonly windowSize = 300) {}

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.windowSize) this.values.shift();
  }

  reset(): void {
    this.values = [];
  }

  get count(): number {
    return this.values.length;
  }

  mean(): number {
    if (!this.values.length) return NaN;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }

  percentile(p: number): number {
    if (!this.values.length) return NaN;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  summary() {
    return { n: this.count, mean: round(this.mean()), p50: round(this.percentile(50)), p95: round(this.percentile(95)) };
  }
}

// Events per second over the last `windowMs`.
export class RateCounter {
  private times: number[] = [];

  constructor(private readonly windowMs = 1000) {}

  tick(now = performance.now()): void {
    this.times.push(now);
    this.prune(now);
  }

  rate(now = performance.now()): number {
    this.prune(now);
    return (this.times.length * 1000) / this.windowMs;
  }

  private prune(now: number): void {
    while (this.times.length && now - this.times[0] > this.windowMs) this.times.shift();
  }
}

export function round(value: number, digits = 1): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
