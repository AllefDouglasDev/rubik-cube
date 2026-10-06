// Evolution of the session: single times, rolling ao5 and ao12 on one time axis.
// Palette slots 1–3 of the reference categorical palette (validated light/dark, all-pairs).
import { useEffect, useMemo, useRef, useState } from "react";
import { DNF, type TimedResult, effectiveMs, formatTime, rollingAverage } from "../stats/stats";

const SERIES = [
  { key: "single", label: "Tempo", varName: "--series-1" },
  { key: "ao5", label: "ao5", varName: "--series-2" },
  { key: "ao12", label: "ao12", varName: "--series-3" },
] as const;

const HEIGHT = 240;
const PAD = { top: 12, right: 72, bottom: 28, left: 48 };

type Point = number | null;

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function path(values: Point[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || v === DNF) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export function EvolutionChart({ results }: { results: TimedResult[] }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const series = useMemo(
    () => ({
      single: results.map((r) => effectiveMs(r)) as Point[],
      ao5: rollingAverage(results, 5),
      ao12: rollingAverage(results, 12),
    }),
    [results],
  );

  if (results.length < 2) return <p className="muted">O gráfico aparece a partir de 2 solves.</p>;

  const finite = Object.values(series)
    .flat()
    .filter((v): v is number => v !== null && v !== DNF);
  if (!finite.length) return <p className="muted">Sem tempos válidos para o gráfico.</p>;
  const ticks = niceTicks(Math.min(...finite), Math.max(...finite));
  const yMin = Math.min(ticks[0], ...finite);
  const yMax = Math.max(ticks[ticks.length - 1], ...finite);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const n = results.length;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const lastValid = (values: Point[]) => {
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i];
      if (v !== null && v !== DNF) return { i, v };
    }
    return null;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };

  // Direct end labels, nudged apart so they never overlap.
  const endLabels = SERIES.map((s) => ({ s, last: lastValid(series[s.key]) }))
    .filter((l): l is { s: (typeof SERIES)[number]; last: { i: number; v: number } } => l.last !== null)
    .map((l) => ({ ...l, ly: y(l.last.v) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < endLabels.length; i++) endLabels[i].ly = Math.max(endLabels[i].ly, endLabels[i - 1].ly + 14);

  return (
    <div className="chart" ref={wrapper}>
      <div className="legend" role="list">
        {SERIES.map((s) => (
          <span key={s.key} role="listitem">
            <i className="key" style={{ background: `var(${s.varName})` }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg width={width} height={HEIGHT} role="img" aria-label="Evolução dos tempos da sessão">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
              {formatTime(t, t % 1000 === 0 ? 0 : 1)}
            </text>
          </g>
        ))}
        <text className="axis" x={PAD.left} y={HEIGHT - 6}>
          1
        </text>
        <text className="axis" x={PAD.left + innerW} y={HEIGHT - 6} textAnchor="end">
          {n}
        </text>
        {SERIES.map((s) => (
          <path key={s.key} d={path(series[s.key], x, y)} fill="none" stroke={`var(${s.varName})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* A point with no valid neighbour draws no line segment, so it gets a marker. */}
        {SERIES.flatMap((s) =>
          series[s.key].map((v, i, arr) => {
            const valid = (p: Point | undefined) => p !== undefined && p !== null && p !== DNF;
            if (!valid(v) || valid(arr[i - 1]) || valid(arr[i + 1])) return null;
            return <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v!)} r={4} fill={`var(${s.varName})`} stroke="var(--panel)" strokeWidth={2} />;
          }),
        )}
        {endLabels.map(({ s, last, ly }) => (
          <text key={s.key} className="end-label" x={x(last.i) + 8} y={ly} dominantBaseline="middle">
            {s.label} {formatTime(last.v)}
          </text>
        ))}
        {hover !== null && (
          <g>
            <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
            {SERIES.map((s) => {
              const v = series[s.key][hover];
              return v !== null && v !== DNF ? (
                <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={`var(${s.varName})`} stroke="var(--surface)" strokeWidth={2} />
              ) : null;
            })}
          </g>
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(x(hover) + 12, width - 150), top: PAD.top }}>
          <div className="muted">Solve {hover + 1}</div>
          {SERIES.map((s) => (
            <div key={s.key} className="tooltip-row">
              <i className="key" style={{ background: `var(${s.varName})` }} />
              <strong>{formatTime(series[s.key][hover])}</strong>
              <span className="muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
