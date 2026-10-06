// F5.5: algorithm trainer. Pick sets from the curriculum, get a scramble that sets up a case, time the
// execution with the stackmat-style timer and mark it right or wrong; weak cases come back more often.
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CurriculumAlg, LEVELS } from "../curriculum/curriculum";
import { Alg } from "cubing/alg";
import { CubeView } from "../renderer/CubeView";
import { formatTime } from "../stats/stats";
import type { AlgStat } from "../storage/db";
import type { Repo } from "../storage/repo";
import { caseScramble } from "../trainer/caseScramble";
import { MAX_BOX, emptyStat, meanRecent, pickNext, recordAttempt } from "../trainer/scheduler";
import { useTimer } from "../timer/useTimer";

interface Props {
  repo: Repo;
  active: boolean;
  holdMs: number;
}

const SETS = LEVELS.flatMap((l) => l.itens.filter((i) => i.algoritmos.length > 1).map((i) => ({ id: i.id, title: i.titulo, level: l.titulo, algs: i.algoritmos })));
const ALGS = new Map<string, CurriculumAlg>(SETS.flatMap((s) => s.algs.map((a) => [`${s.id}/${a.nome}`, a] as const)));
const SELECTION_KEY = "cubo-trainer.trainer";

function readSelection(): { sets: string[]; targetMs: number; showAlg: boolean } {
  try {
    return { sets: ["int-04-oll-cantos"], targetMs: 3000, showAlg: false, ...JSON.parse(localStorage.getItem(SELECTION_KEY) ?? "{}") };
  } catch {
    return { sets: ["int-04-oll-cantos"], targetMs: 3000, showAlg: false };
  }
}

export function TrainerPage({ repo, active, holdMs }: Props) {
  const [selection, setSelection] = useState(readSelection);
  const statsList = useLiveQuery(() => repo.listAlgStats(), [repo]);
  const stats = useMemo(() => new Map((statsList ?? []).map((s) => [s.key, s])), [statsList]);
  const keys = useMemo(() => SETS.filter((s) => selection.sets.includes(s.id)).flatMap((s) => s.algs.map((a) => `${s.id}/${a.nome}`)), [selection.sets]);
  const [current, setCurrent] = useState<{ key: string; scramble: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pendingMs, setPendingMs] = useState<number | null>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
    } catch {
      // Selection just won't persist.
    }
  }, [selection]);

  const next = useCallback(async () => {
    if (!keys.length) {
      setCurrent(null);
      return;
    }
    const key = pickNext(keys, stats, previous.current);
    previous.current = key;
    setRevealed(false);
    setPendingMs(null);
    setCurrent({ key, scramble: await caseScramble(ALGS.get(key)!.alg) });
  }, [keys, stats]);

  // New case whenever the selected sets change (or on first load).
  const keysSignature = keys.join("|");
  useEffect(() => {
    if (statsList) next();
    // Only when the selection changes or the stats first arrive, not on every stats update.
  }, [keysSignature, statsList === undefined]);

  const record = useCallback(
    async (ok: boolean) => {
      if (!current) return;
      const stat = stats.get(current.key) ?? emptyStat(current.key);
      await repo.putAlgStat(recordAttempt(stat, { ok, ms: pendingMs ?? undefined }, selection.targetMs));
      next();
    },
    [current, stats, pendingMs, selection.targetMs, repo, next],
  );

  const timer = useTimer({
    config: { inspection: false, holdMs },
    enabled: active && current !== null && pendingMs === null,
    onComplete: (result) => setPendingMs(result.timeMs),
    onDiscard: () => setPendingMs(null),
  });

  // After a timed attempt: Enter = right, X/Backspace = wrong.
  useEffect(() => {
    if (!active || pendingMs === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter") record(true);
      else if (e.code === "KeyX" || e.code === "Backspace") record(false);
      else if (e.code === "Escape") setPendingMs(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, pendingMs, record]);

  const alg = current ? ALGS.get(current.key)! : null;
  const [setId, caseName] = current?.key.split("/") ?? [];
  const setTitle = SETS.find((s) => s.id === setId)?.title;
  const phase = timer.state.phase;
  const display = phase === "running" ? formatTime(timer.elapsedMs, 1) : pendingMs !== null ? formatTime(pendingMs) : formatTime(0);

  const toggleSet = (id: string) =>
    setSelection((s) => ({ ...s, sets: s.sets.includes(id) ? s.sets.filter((x) => x !== id) : [...s.sets, id] }));

  return (
    <div className="timer-layout trainer">
      <div className="timer-main">
        {!current ? (
          <section className="panel">
            <p className="muted">Escolha ao menos um conjunto de algoritmos ao lado.</p>
          </section>
        ) : (
          <>
            <section className="panel scramble">
              <div>
                <div className="muted">Monte o caso a partir do cubo resolvido:</div>
                <div className="scramble-text">{current.scramble}</div>
              </div>
              <button type="button" onClick={next}>
                Pular
              </button>
            </section>
            <div
              className={`timer-display phase-${pendingMs !== null ? "stopped" : phase}`}
              onPointerDown={(e) => {
                e.preventDefault();
                if (pendingMs === null) timer.press("spaceDown");
              }}
              onPointerUp={() => pendingMs === null && timer.press("spaceUp")}
            >
              <div className="time">{display}</div>
              <div className="hint">
                {pendingMs !== null
                  ? "Enter = certo · X = errei · Esc = repetir"
                  : phase === "running"
                    ? "Qualquer tecla para parar"
                    : "Segure espaço, solte e execute o algoritmo"}
              </div>
            </div>
            <section className="panel">
              <div className="row spread">
                <strong>
                  {revealed || selection.showAlg ? `${setTitle} · ${caseName}` : "Caso oculto"}
                </strong>
                <div className="row">
                  <button type="button" onClick={() => setRevealed((r) => !r)}>
                    {revealed ? "Ocultar" : "Mostrar caso e algoritmo"}
                  </button>
                  <button type="button" className="selected" disabled={pendingMs === null} onClick={() => record(true)}>
                    Certo
                  </button>
                  <button type="button" className="danger" disabled={pendingMs === null} onClick={() => record(false)}>
                    Errei
                  </button>
                </div>
              </div>
              {(revealed || selection.showAlg) && alg && (
                <>
                  <p>
                    <code className="alg-code">{alg.alg}</code>
                  </p>
                  <div className="alg-preview">
                    <CubeView setup={new Alg(alg.alg).invert().toString()} alg={alg.alg} />
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>

      <aside className="timer-side">
        <section className="panel">
          <h2>Conjuntos</h2>
          {SETS.map((s) => (
            <label key={s.id} className="set-option">
              <input type="checkbox" checked={selection.sets.includes(s.id)} onChange={() => toggleSet(s.id)} />
              {s.title} <span className="muted">· {s.algs.length}</span>
            </label>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <label>
              Meta
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                value={selection.targetMs / 1000}
                onChange={(e) => setSelection((s) => ({ ...s, targetMs: Number(e.target.value) * 1000 }))}
              />
              s
            </label>
            <label>
              <input type="checkbox" checked={selection.showAlg} onChange={(e) => setSelection((s) => ({ ...s, showAlg: e.target.checked }))} />
              Sempre mostrar o algoritmo
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>Casos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caso</th>
                  <th>Nível</th>
                  <th>Média</th>
                  <th>Melhor</th>
                  <th>Erros</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const st: AlgStat | undefined = stats.get(k);
                  return (
                    <tr key={k} className={current?.key === k ? "current-row" : ""}>
                      <td>{k.split("/")[1]}</td>
                      <td title="Caixa de repetição: 1 = revisar sempre, 5 = dominado">
                        {"●".repeat(st?.box ?? 1)}
                        <span className="muted">{"○".repeat(MAX_BOX - (st?.box ?? 1))}</span>
                      </td>
                      <td>{formatTime(meanRecent(st))}</td>
                      <td>{formatTime(st?.bestMs ?? null)}</td>
                      <td>{st ? `${st.fails}/${st.reps}` : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </aside>
    </div>
  );
}
