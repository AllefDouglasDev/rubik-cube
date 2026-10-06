// Learning path by level (beginner → intermediate → advanced) with per-item progress.
// Milestones written as "ao12 < X s" are completed automatically from the best ao12 of any session.
import { Alg } from "cubing/alg";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import {
  type CurriculumItem,
  LEVELS,
  type ProgressStatus,
  STATUS_LABEL,
  ao12TargetMs,
  isDone,
} from "../curriculum/curriculum";
import { CubeView } from "../renderer/CubeView";
import { formatTime, sessionStats } from "../stats/stats";
import type { Repo } from "../storage/repo";

const STATUSES = Object.keys(STATUS_LABEL) as ProgressStatus[];

export function CurriculumPage({ repo }: { repo: Repo }) {
  const progress = useLiveQuery(() => repo.listProgress(), [repo]);
  const allSolves = useLiveQuery(() => repo.allSolves(), [repo]);
  const [levelIndex, setLevelIndex] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  // Best ao12 over every session (each session averaged on its own).
  const bestAo12 = useMemo(() => {
    if (!allSolves) return null;
    const bySession = Map.groupBy(allSolves, (s) => s.sessionId);
    const values = [...bySession.values()].map((solves) => sessionStats(solves).bestAo12).filter((v): v is number => v !== null);
    return values.length ? Math.min(...values) : null;
  }, [allSolves]);

  if (!progress || !allSolves) return <div className="loading">Carregando…</div>;

  const stored = new Map(progress.map((p) => [p.itemId, p.status as ProgressStatus]));
  const statusOf = (item: CurriculumItem): { status: ProgressStatus; auto: boolean } => {
    const target = ao12TargetMs(item);
    if (target !== null && bestAo12 !== null && bestAo12 < target && !isDone(stored.get(item.id))) return { status: "aprendido", auto: true };
    return { status: stored.get(item.id) ?? "nao-iniciado", auto: false };
  };

  const level = LEVELS[levelIndex];

  return (
    <div className="curriculum">
      <div className="level-cards">
        {LEVELS.map((l, i) => {
          const done = l.itens.filter((item) => isDone(statusOf(item).status)).length;
          const pct = Math.round((100 * done) / l.itens.length);
          return (
            <button key={l.nivel} type="button" className={`panel level-card ${i === levelIndex ? "selected-card" : ""}`} onClick={() => setLevelIndex(i)}>
              <strong>{l.titulo}</strong>
              <span className="muted">
                Meta: média abaixo de {formatTime(l.meta.mediaAlvoMs, 0)}
                {l.meta.mediaAlvoMs < 60_000 ? " s" : ""} · {l.meta.movimentosTipicos} movimentos
              </span>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <span className="muted">
                {done} de {l.itens.length} itens · {pct}%
              </span>
            </button>
          );
        })}
      </div>

      <p className="muted">Melhor ao12 (todas as sessões): {formatTime(bestAo12)}</p>
      {level.aviso && <p className="notice">{level.aviso}</p>}

      {level.itens.map((item) => {
        const { status, auto } = statusOf(item);
        return (
          <section key={item.id} className="panel item">
            <div className="row spread">
              <div>
                <h2>
                  {item.titulo} <span className="tag">{item.etapa}</span>
                </h2>
                {item.descricao && <p>{item.descricao}</p>}
                <p className="muted">
                  Meta: {item.meta}
                  {item.quantidadeCasos ? ` · ${item.quantidadeCasos} casos` : ""}
                </p>
              </div>
              <label className="status">
                {auto ? (
                  <span className="ok-text">✓ atingido pelo seu ao12</span>
                ) : (
                  <select value={status} onChange={(e) => repo.setProgress(item.id, e.target.value as ProgressStatus)} aria-label={`Status de ${item.titulo}`}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>
            {item.algoritmos.length > 0 && (
              <ul className="algs">
                {item.algoritmos.map((a) => {
                  const key = `${item.id}/${a.nome}`;
                  return (
                    <li key={key}>
                      <div className="row">
                        <span className="alg-name">{a.nome}</span>
                        <code>{a.alg}</code>
                        <button type="button" onClick={() => setPreview(preview === key ? null : key)}>
                          {preview === key ? "Fechar" : "Ver caso"}
                        </button>
                      </div>
                      {preview === key && (
                        <div className="alg-preview">
                          <CubeView setup={new Alg(a.alg).invert().toString()} alg={a.alg} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <p className="muted sources">
        Fontes:{" "}
        {level.fontes.map((f, i) => (
          <span key={f}>
            {i > 0 && " · "}
            <a href={f} target="_blank" rel="noreferrer">
              {new URL(f).hostname.replace(/^www\./, "")}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
