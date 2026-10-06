// Session history: evolution chart, full solve list with penalty editing and deletion, csTimer export/import.
import { useMemo, useRef, useState } from "react";
import { type Penalty, formatResult, formatTime, rollingAverage, sessionStats } from "../stats/stats";
import type { Solve } from "../storage/db";
import type { Repo } from "../storage/repo";
import { EvolutionChart } from "./EvolutionChart";
import { SessionInsights } from "./SessionInsights";
import { SolveAnalysisPanel } from "./SolveAnalysisPanel";
import { StatsPanel } from "./StatsPanel";

interface Props {
  repo: Repo;
  solves: Solve[];
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function HistoryPage({ repo, solves }: Props) {
  const ao5 = useMemo(() => rollingAverage(solves, 5), [solves]);
  const ao12 = useMemo(() => rollingAverage(solves, 12), [solves]);
  const stats = useMemo(() => sessionStats(solves), [solves]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const analyzedSolve = solves.find((s) => s.id === analyzing);

  const exportFile = async () => {
    const data = await repo.exportCsTimer();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cubo-trainer-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const count = await repo.importCsTimer(JSON.parse(await file.text()));
      setMessage(`${count} solves importados como novas sessões.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao importar.");
    }
  };

  const rows = solves.map((s, i) => ({ s, i, ao5: ao5[i], ao12: ao12[i] })).reverse();

  return (
    <div className="history">
      <div className="history-top">
        <StatsPanel stats={stats} />
        <section className="panel chart-panel">
          <h2>Evolução</h2>
          <EvolutionChart results={solves} />
        </section>
      </div>

      <section className="panel">
        <h2>O que treinar</h2>
        <SessionInsights solves={solves} />
      </section>

      {analyzedSolve && <SolveAnalysisPanel key={analyzedSolve.id} repo={repo} solve={analyzedSolve} onClose={() => setAnalyzing(null)} />}

      <section className="panel">
        <div className="row spread">
          <h2>Solves</h2>
          <div className="row">
            <button type="button" onClick={exportFile}>
              Exportar (csTimer)
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              Importar (csTimer)
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.json,application/json,text/plain"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importFile(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        {message && <p className="muted">{message}</p>}
        {solves.length === 0 ? (
          <p className="muted">Nenhum solve nesta sessão ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tempo</th>
                  <th>ao5</th>
                  <th>ao12</th>
                  <th>Penalidade</th>
                  <th>Scramble</th>
                  <th>Data</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, i, ao5: a5, ao12: a12 }) => (
                  <tr key={s.id}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <strong>{formatResult(s)}</strong>
                    </td>
                    <td>{formatTime(a5)}</td>
                    <td>{formatTime(a12)}</td>
                    <td>
                      <select value={s.penalty} onChange={(e) => repo.setPenalty(s.id, e.target.value as Penalty)} aria-label="Penalidade">
                        <option value="none">OK</option>
                        <option value="+2">+2</option>
                        <option value="dnf">DNF</option>
                      </select>
                    </td>
                    <td className="scramble-cell">{s.scramble}</td>
                    <td className="muted">{dateFormat.format(s.createdAt)}</td>
                    <td className="row nowrap">
                      <button type="button" onClick={() => setAnalyzing(s.id)}>
                        {s.phases?.length ? "Análise ✓" : "Analisar"}
                      </button>
                      {confirmDelete === s.id ? (
                        <button type="button" className="danger" onClick={() => repo.deleteSolve(s.id)}>
                          Confirmar
                        </button>
                      ) : (
                        <button type="button" onClick={() => setConfirmDelete(s.id)}>
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
