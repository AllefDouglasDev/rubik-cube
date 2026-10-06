// Stage split and tips for one solve. Moves come from tracking (timed) or from a pasted reconstruction.
import { useMemo, useState } from "react";
import { diagnose } from "../analysis/diagnostics";
import { type SolveAnalysis, type TimedMove, analyzeSolve, parseMoves } from "../analysis/stages";
import { formatResult, formatTime } from "../stats/stats";
import type { Solve } from "../storage/db";
import type { Repo } from "../storage/repo";

const STAGE_LABEL: Record<string, string> = {
  cross: "Cruz",
  f2l1: "F2L 1",
  f2l2: "F2L 2",
  f2l3: "F2L 3",
  f2l4: "F2L 4",
  oll: "OLL",
  pll: "PLL",
};

const COLOR_NAME: Record<string, string> = { U: "branca", D: "amarela", F: "verde", B: "azul", R: "vermelha", L: "laranja" };

interface Props {
  repo: Repo;
  solve: Solve;
  onClose: () => void;
}

export function SolveAnalysisPanel({ repo, solve, onClose }: Props) {
  const [text, setText] = useState(() => solve.moves?.map((m) => m.m).join(" ") ?? "");
  const [moves, setMoves] = useState<TimedMove[] | null>(() => solve.moves ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { analysis, analysisError } = useMemo((): { analysis: SolveAnalysis | null; analysisError: string | null } => {
    if (!moves?.length) return { analysis: null, analysisError: null };
    try {
      return { analysis: analyzeSolve(solve.scramble, moves), analysisError: null };
    } catch (e) {
      return { analysis: null, analysisError: e instanceof Error ? e.message : String(e) };
    }
  }, [moves, solve.scramble]);
  const tips = useMemo(() => (analysis ? diagnose(analysis, moves?.map((m) => m.t ?? 0)) : []), [analysis, moves]);

  const run = () => {
    try {
      setMoves(parseMoves(text));
      setError(null);
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? `Notação inválida: ${e.message}` : "Notação inválida.");
    }
  };

  const save = async () => {
    if (!analysis || !moves) return;
    await repo.setReconstruction(
      solve.id,
      moves,
      analysis.stages.map((s) => ({
        name: s.name,
        moveCount: s.moveCount,
        rotations: s.rotations,
        startMs: s.startMs,
        endMs: s.endMs,
        recognitionMs: s.recognitionMs,
        caseId: s.caseId,
      })),
    );
    setSaved(true);
  };

  return (
    <section className="panel analysis">
      <div className="row spread">
        <h2>
          Análise do solve <span className="muted">· {formatResult(solve)}</span>
        </h2>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p className="muted">
        Scramble: <code>{solve.scramble}</code>
      </p>
      {!solve.moves?.some((m) => m.t !== undefined) && (
        <p className="muted">
          Cole a sequência que você fez (reconstrução), com rotações, como <code>y R U R' ...</code>. Sem tempos por movimento, a análise
          mostra contagens; pausas, reconhecimento e TPS aparecem quando os giros vierem do rastreamento.
        </p>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Reconstrução" placeholder="x2 D R' F ..." />
      <div className="row">
        <button type="button" className="selected" onClick={run} disabled={!text.trim()}>
          Analisar
        </button>
        <button type="button" onClick={save} disabled={!analysis || saved}>
          {saved ? "Salvo ✓" : "Salvar reconstrução"}
        </button>
      </div>
      {(error ?? analysisError) && <p className="error">{error ?? analysisError}</p>}

      {analysis && (
        <>
          <p>
            {analysis.solved ? "Resolvido" : "Não termina resolvido"} · cruz {analysis.crossColor ? COLOR_NAME[analysis.crossColor] : "-"} ·{" "}
            {analysis.moveCount} movimentos · {analysis.rotations} rotações
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Movimentos</th>
                  <th>Rotações</th>
                  <th>Caso</th>
                  {analysis.timed && (
                    <>
                      <th>Tempo</th>
                      <th>Reconhecimento</th>
                    </>
                  )}
                  <th>Sequência</th>
                </tr>
              </thead>
              <tbody>
                {analysis.stages.map((s) => (
                  <tr key={s.name}>
                    <td>{STAGE_LABEL[s.name]}</td>
                    <td>{s.skipped ? "skip" : s.moveCount}</td>
                    <td>{s.rotations || ""}</td>
                    <td>{s.caseId ?? ""}</td>
                    {analysis.timed && (
                      <>
                        <td>{formatTime((s.endMs ?? 0) - (s.startMs ?? 0))}</td>
                        <td>{formatTime(s.recognitionMs ?? null)}</td>
                      </>
                    )}
                    <td className="scramble-cell">{moves!.slice(s.from, s.to).map((m) => m.m).join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="tips">
            {tips.map((t) => (
              <li key={t.id} className={`tip tip-${t.level}`}>
                <strong>{t.title}</strong>
                <span className="muted">{t.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
