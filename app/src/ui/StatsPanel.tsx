import { type SessionStats, formatTime } from "../stats/stats";

export function StatsPanel({ stats }: { stats: SessionStats }) {
  const rows: [string, number | null, string?][] = [
    ["mo3", stats.mo3],
    ["ao5", stats.ao5, `melhor ${formatTime(stats.bestAo5)}`],
    ["ao12", stats.ao12, `melhor ${formatTime(stats.bestAo12)}`],
    ["Melhor", stats.best],
    ["Média", stats.mean, stats.stdDev !== null ? `σ ${formatTime(stats.stdDev)}` : undefined],
  ];
  return (
    <section className="panel">
      <h2>
        Estatísticas <span className="muted">· {stats.count} solves{stats.dnfCount ? ` · ${stats.dnfCount} DNF` : ""}</span>
      </h2>
      <dl className="stats">
        {rows.map(([label, value, extra]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <strong>{formatTime(value)}</strong>
              {extra && <span className="muted"> {extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
