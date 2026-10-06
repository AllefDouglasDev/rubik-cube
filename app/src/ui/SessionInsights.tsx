// F4.4: what to train next, aggregated over the analysed solves of the session.
import { useMemo } from "react";
import { type Tip, diagnose } from "../analysis/diagnostics";
import { type SolveAnalysis, analyzeSolve } from "../analysis/stages";
import { formatTime } from "../stats/stats";
import type { Solve } from "../storage/db";

const STAGES: [string, string][] = [
  ["cross", "Cruz"],
  ["f2l", "F2L (4 pares)"],
  ["oll", "OLL"],
  ["pll", "PLL"],
];

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function SessionInsights({ solves }: { solves: Solve[] }) {
  const analysed = useMemo(() => {
    const out: { analysis: SolveAnalysis; tips: Tip[] }[] = [];
    for (const s of solves) {
      if (!s.moves?.length) continue;
      try {
        const analysis = analyzeSolve(s.scramble, s.moves);
        out.push({ analysis, tips: diagnose(analysis, s.moves.map((m) => m.t ?? 0)) });
      } catch {
        // A reconstruction that no longer parses is skipped.
      }
    }
    return out;
  }, [solves]);

  if (!analysed.length) {
    return <p className="muted">Nenhum solve analisado nesta sessão. Use "Analisar" num solve para ver o resumo aqui.</p>;
  }

  const stageRows = STAGES.map(([key, label]) => {
    const stagesOf = (a: SolveAnalysis) => a.stages.filter((s) => (key === "f2l" ? s.name.startsWith("f2l") : s.name === key));
    const reached = analysed.filter(({ analysis }) => stagesOf(analysis).length > 0);
    const moves = mean(reached.map(({ analysis }) => stagesOf(analysis).reduce((acc, s) => acc + s.moveCount, 0)));
    const timed = reached.filter(({ analysis }) => analysis.timed);
    const time = mean(timed.map(({ analysis }) => stagesOf(analysis).reduce((acc, s) => acc + ((s.endMs ?? 0) - (s.startMs ?? 0)), 0)));
    return { label, moves, time, n: reached.length };
  });

  const warnCounts = new Map<string, { title: string; count: number }>();
  for (const { tips } of analysed) {
    for (const t of tips.filter((t) => t.level === "warn")) {
      const entry = warnCounts.get(t.id) ?? { title: t.title, count: 0 };
      entry.count++;
      warnCounts.set(t.id, entry);
    }
  }
  const topWarnings = [...warnCounts.values()].sort((a, b) => b.count - a.count).slice(0, 4);

  const pllCases = new Map<string, { count: number; times: number[] }>();
  for (const { analysis } of analysed) {
    const pll = analysis.stages.find((s) => s.name === "pll");
    if (!pll?.caseId || pll.caseId === "skip") continue;
    const entry = pllCases.get(pll.caseId) ?? { count: 0, times: [] };
    entry.count++;
    if (pll.endMs !== undefined && pll.startMs !== undefined) entry.times.push(pll.endMs - pll.startMs);
    pllCases.set(pll.caseId, entry);
  }
  const plls = [...pllCases.entries()].sort((a, b) => (mean(b[1].times) ?? 0) - (mean(a[1].times) ?? 0) || b[1].count - a[1].count);

  return (
    <div className="insights">
      <p className="muted">{analysed.length} solves analisados.</p>
      <table>
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Movimentos (média)</th>
            <th>Tempo (média)</th>
          </tr>
        </thead>
        <tbody>
          {stageRows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.moves === null ? "-" : r.moves.toFixed(1)}</td>
              <td>{formatTime(r.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {topWarnings.length > 0 && (
        <>
          <h3>Pontos que mais se repetem</h3>
          <ul className="tips">
            {topWarnings.map((w) => (
              <li key={w.title} className="tip tip-warn">
                <strong>
                  {w.title} <span className="muted">· {w.count} de {analysed.length} solves</span>
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {plls.length > 0 && (
        <>
          <h3>Casos de PLL</h3>
          <p className="muted">
            {plls.map(([name, e]) => `${name} ×${e.count}${e.times.length ? ` (${formatTime(mean(e.times))})` : ""}`).join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}
