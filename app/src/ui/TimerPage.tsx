// Main screen: scramble, stackmat-style timer, last solve review, session stats and the virtual cube.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CubeState, randomScramble } from "../cube-state/cubeState";
import { fromStartPosition } from "../cube-state/orientation";
import { CubeView, type CubeViewHandle } from "../renderer/CubeView";
import type { Settings } from "../settings";
import { type Penalty, effectiveMs, formatDelta, formatResult, formatTime, sessionStats } from "../stats/stats";
import type { Solve } from "../storage/db";
import type { Repo } from "../storage/repo";
import { INSPECTION_MS } from "../timer/timerMachine";
import { useTimer } from "../timer/useTimer";
import { MovePad } from "./MovePad";
import { ScramblePreviewDialog, StartPosition } from "./ScramblePreviewDialog";
import { StatsPanel } from "./StatsPanel";

interface Props {
  repo: Repo;
  sessionId: string;
  solves: Solve[];
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  active: boolean;
  // A state scanned by the camera, used as the scramble of the next solve.
  scrambleOverride?: { alg: string; nonce: number } | null;
  onScrambleChange?: (scramble: string | null) => void;
}

const PHASE_HINT: Record<string, string> = {
  idle: "Segure espaço para começar",
  inspecting: "Inspeção: segure espaço quando estiver pronto",
  armed: "Continue segurando…",
  ready: "Solte para começar",
  running: "Qualquer tecla para parar",
  stopped: "Espaço para o próximo · Esc descarta este tempo",
  cancelled: "Tentativa cancelada, nada foi salvo",
};

export function TimerPage({ repo, sessionId, solves, settings, onSettings, active, scrambleOverride, onScrambleChange }: Props) {
  const [scramble, setScramble] = useState<string | null>(null);
  const nextScramble = useRef<Promise<string> | null>(null);
  const [lastSolveId, setLastSolveId] = useState<string | null>(null);
  const pendingSave = useRef<Promise<Solve> | null>(null);
  const cube = useRef<CubeViewHandle>(null);
  const [cubeState, setCubeState] = useState<CubeState | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const advanceScramble = useCallback(async () => {
    const next = await (nextScramble.current ?? randomScramble());
    nextScramble.current = randomScramble();
    setScramble(next);
  }, []);

  useEffect(() => {
    advanceScramble();
  }, [advanceScramble]);

  useEffect(() => {
    if (scramble) CubeState.fromScramble(scramble).then(setCubeState);
    onScrambleChange?.(scramble);
  }, [scramble, onScrambleChange]);

  useEffect(() => {
    if (scrambleOverride) setScramble(scrambleOverride.alg);
  }, [scrambleOverride]);

  const timer = useTimer({
    config: { inspection: settings.inspection, holdMs: settings.holdMs },
    enabled: active && !previewOpen,
    onComplete: (result) => {
      if (!scramble) return;
      const saving = repo.addSolve({ sessionId, scramble, ...result, source: "keyboard" });
      pendingSave.current = saving;
      saving.then((saved) => setLastSolveId(saved.id));
      advanceScramble();
    },
    onDiscard: async () => {
      // Esc can arrive before the save finishes: wait for it, then delete.
      const saved = await pendingSave.current;
      pendingSave.current = null;
      if (saved) await repo.deleteSolve(saved.id);
      setLastSolveId(null);
    },
  });

  const lastSolve = solves.find((s) => s.id === lastSolveId) ?? null;
  const stats = useMemo(() => sessionStats(solves), [solves]);
  const previous = useMemo(() => (lastSolve ? sessionStats(solves.filter((s) => s.id !== lastSolve.id)) : null), [solves, lastSolve]);

  const applyMoves = (alg: string) => {
    if (!cubeState) return;
    try {
      const next = cubeState.apply(alg);
      for (const m of next.moves.slice(cubeState.moves.length)) cube.current?.addMove(m);
      setCubeState(next);
      setMoveError(null);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
    }
  };

  const undoMove = async () => {
    if (!cubeState || !scramble || !cubeState.moves.length) return;
    cube.current?.undo();
    const moves = cubeState.moves.slice(0, -1);
    const base = await CubeState.fromScramble(scramble);
    setCubeState(moves.length ? base.apply(moves.join(" ")) : base);
  };

  const resetMoves = async () => {
    if (!scramble) return;
    cube.current?.reset();
    setCubeState(await CubeState.fromScramble(scramble));
  };

  const setPenalty = (penalty: Penalty) => lastSolve && repo.setPenalty(lastSolve.id, penalty);
  const { state } = timer;
  const inspectionLeft = timer.inspectionElapsedMs !== undefined ? INSPECTION_MS - timer.inspectionElapsedMs : undefined;

  let display: string;
  if (state.phase === "inspecting" || ((state.phase === "armed" || state.phase === "ready") && inspectionLeft !== undefined)) {
    display = inspectionLeft! > 0 ? String(Math.ceil(inspectionLeft! / 1000)) : inspectionLeft! > -2000 ? "+2" : "DNF";
  } else if (state.phase === "running") {
    display = formatTime(timer.elapsedMs, 1);
  } else if (state.phase === "stopped" && lastSolve) {
    display = formatResult(lastSolve);
  } else if (state.phase === "armed" || state.phase === "ready") {
    display = formatTime(0);
  } else {
    display = lastSolve ? formatResult(lastSolve) : formatTime(0);
  }

  const lastEffective = lastSolve ? effectiveMs(lastSolve) : null;
  const isPb = lastEffective !== null && previous?.best !== null && previous !== null && lastEffective < previous.best!;

  return (
    <div className="timer-layout">
      <div className="timer-main">
        <section className="panel scramble">
          <div className="scramble-main">
            <div className="scramble-text">{scramble ?? "Gerando scramble…"}</div>
            <StartPosition />
          </div>
          <button type="button" onClick={() => setPreviewOpen(true)} disabled={!scramble || state.phase === "running"}>
            Ver no cubo
          </button>
          <button type="button" onClick={advanceScramble} disabled={state.phase === "running"}>
            Novo scramble
          </button>
        </section>
        {previewOpen && scramble && <ScramblePreviewDialog scramble={scramble} onClose={() => setPreviewOpen(false)} />}

        <div
          className={`timer-display phase-${state.phase}`}
          onPointerDown={(e) => {
            e.preventDefault();
            timer.press("spaceDown");
          }}
          onPointerUp={() => timer.press("spaceUp")}
          role="timer"
          aria-live="off"
        >
          <div className="time">{display}</div>
          <div className="hint">{PHASE_HINT[state.phase]}</div>
        </div>

        {lastSolve && state.phase !== "running" && (
          <section className="panel last-solve">
            <div className="row">
              <strong>Último: {formatResult(lastSolve)}</strong>
              {isPb && <span className="badge">Novo recorde!</span>}
            </div>
            <div className="row muted">
              <span>vs recorde anterior: {formatDelta(lastEffective, previous?.best ?? null) ?? "-"}</span>
              <span>vs média da sessão: {formatDelta(lastEffective, previous?.mean ?? null) ?? "-"}</span>
              <span>vs ao5 anterior: {formatDelta(lastEffective, previous?.ao5 ?? null) ?? "-"}</span>
            </div>
            <div className="row">
              {(["none", "+2", "dnf"] as Penalty[]).map((p) => (
                <button key={p} type="button" className={lastSolve.penalty === p ? "selected" : ""} onClick={() => setPenalty(p)}>
                  {p === "none" ? "OK" : p.toUpperCase()}
                </button>
              ))}
              <button type="button" className="danger" onClick={() => timer.cancel()} disabled={state.phase !== "stopped"}>
                Descartar (Esc)
              </button>
            </div>
          </section>
        )}

        <section className="panel settings row">
          <label>
            <input type="checkbox" checked={settings.inspection} onChange={(e) => onSettings({ inspection: e.target.checked })} />
            Inspeção de 15 s
          </label>
          <label>
            Segurar
            <input
              type="number"
              min={0}
              max={1000}
              step={50}
              value={settings.holdMs}
              onChange={(e) => onSettings({ holdMs: Number(e.target.value) })}
            />
            ms
          </label>
        </section>
      </div>

      <aside className="timer-side">
        <StatsPanel stats={stats} />
        <section className="panel">
          <h2>
            Cubo virtual <span className="muted">· {cubeState?.isSolved() ? "resolvido ✓" : `${cubeState?.moves.length ?? 0} movimentos`}</span>
          </h2>
          {scramble && <CubeView setup={fromStartPosition(scramble)} ref={cube} />}
          <MovePad onMoves={applyMoves} onUndo={undoMove} onReset={resetMoves} canUndo={(cubeState?.moves.length ?? 0) > 0} />
          {moveError && <p className="error">{moveError}</p>}
        </section>
      </aside>
    </div>
  );
}
