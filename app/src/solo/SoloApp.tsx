// Solo practice timer: hold space (red → green), release to start, space to stop. Solves of the current
// session on the left, a new random-state scramble at the top after every solve. The menu also opens the
// F2L, OLL and PLL study pages (#f2l, #oll, #pll).
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomScramble } from "../cube-state/cubeState";
import { formatTime, sessionStats } from "../stats/stats";
import { useTimer } from "../timer/useTimer";
import { ScramblePreviewDialog, StartPosition } from "../ui/ScramblePreviewDialog";
import { LearnPage } from "./learn/LearnPage";
import type { CaseSet } from "./learn/cases";
import { SessionPicker } from "./SessionPicker";
import { SettingsDialog } from "./SettingsDialog";
import { SessionSummary, SolveList } from "./SolveList";
import { SoloDb, SoloRepo, type SoloSolve, loadCurrentSessionId, saveCurrentSessionId } from "./soloDb";

const HOLD_MS = 300;

type View = "timer" | CaseSet;
const VIEWS: [View, string][] = [
  ["timer", "Timer"],
  ["f2l", "F2L"],
  ["oll", "OLL"],
  ["pll", "PLL"],
];

function viewFromHash(): View {
  const hash = location.hash.slice(1);
  return VIEWS.some(([v]) => v === hash) ? (hash as View) : "timer";
}

function useView(): View {
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const update = () => setView(viewFromHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return view;
}

const HINT: Record<string, string> = {
  idle: "Segure espaço para preparar",
  armed: "Continue segurando…",
  ready: "Solte para iniciar",
  running: "Espaço para parar",
  stopped: "Tempo salvo · Esc descarta este tempo",
  cancelled: "Cancelado, nada foi salvo",
};

export function SoloApp() {
  const repo = useMemo(() => new SoloRepo(new SoloDb()), []);
  const [sessionId, setSessionId] = useState(loadCurrentSessionId);
  const view = useView();
  const [dialog, setDialog] = useState<"preview" | "settings" | null>(null);
  const sessions = useLiveQuery(() => repo.listSessions(), [repo]);

  const select = useCallback((id: string) => {
    setSessionId(id);
    saveCurrentSessionId(id);
  }, []);

  // The stored session no longer exists (or none was stored): fall back to the latest one, creating the
  // first session on a fresh database. Never passes through "no session", so open dialogs stay mounted.
  // Only a new session list triggers the fallback: a just-created session is selected before it is listed.
  const current = sessions?.some((s) => s.id === sessionId) ? sessionId : sessions?.[0]?.id;
  const latestSessionId = useRef(sessionId);
  latestSessionId.current = sessionId;
  useEffect(() => {
    if (!sessions || sessions.some((s) => s.id === latestSessionId.current)) return;
    if (sessions[0]) select(sessions[0].id);
    else repo.ensureSession().then((s) => select(s.id));
  }, [sessions, repo, select]);

  const solves = useLiveQuery(() => (current ? repo.solvesOf(current) : []), [repo, current]) ?? [];

  const [scramble, setScramble] = useState<string | null>(null);
  const nextScramble = useRef<Promise<string> | null>(null);
  const advanceScramble = useCallback(async () => {
    const next = await (nextScramble.current ?? randomScramble());
    nextScramble.current = randomScramble();
    setScramble(next);
  }, []);
  useEffect(() => {
    advanceScramble();
  }, [advanceScramble]);

  const [lastSolveId, setLastSolveId] = useState<string | null>(null);
  const pendingSave = useRef<Promise<SoloSolve> | null>(null);

  const timer = useTimer({
    config: { inspection: false, holdMs: HOLD_MS },
    enabled: view === "timer" && dialog === null && !!current && !!scramble,
    stopOnAnyKey: false,
    onComplete: ({ timeMs }) => {
      if (!current || !scramble) return;
      const saving = repo.addSolve({ sessionId: current, scramble, timeMs });
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

  const stats = useMemo(() => sessionStats(solves), [solves]);

  if (!sessions || !current) return <div className="loading">Carregando…</div>;

  const { state } = timer;
  const focus = state.phase === "armed" || state.phase === "ready" || state.phase === "running";
  const lastSolve = solves.find((s) => s.id === lastSolveId) ?? solves.at(-1);
  const display =
    state.phase === "running" ? formatTime(timer.elapsedMs) : focus || !lastSolve ? formatTime(0) : formatTime(lastSolve.timeMs);

  const createSession = async () => {
    select((await repo.createSession()).id);
    setLastSolveId(null);
  };

  return (
    <div className={`solo-shell ${focus ? "focus" : ""}`}>
      <nav className="solo-nav" aria-label="Menu">
        <div className="tabs" role="tablist">
          {VIEWS.map(([id, label]) => (
            <a key={id} href={`#${id}`} role="tab" aria-selected={view === id} className={`nav-tab ${view === id ? "selected" : ""}`}>
              {label}
            </a>
          ))}
        </div>
        <div className="solo-actions">
          <a className="nav-link" href="./" title="Voltar para o trainer">
            Trainer
          </a>
          <button type="button" className="icon-button" onClick={() => setDialog("settings")} title="Configurações" aria-label="Configurações">
            <GearIcon />
          </button>
        </div>
      </nav>

      {view === "timer" ? (
        <div className="solo">
          <aside className="solo-side">
            <SessionPicker
              sessions={sessions}
              sessionId={current}
              onSelect={(id) => {
                select(id);
                setLastSolveId(null);
              }}
              onCreate={createSession}
            />
            <SessionSummary solves={solves} stats={stats} />
            <div className="solo-solves">
              <SolveList solves={solves} best={stats.best} onDelete={(id) => repo.deleteSolve(id)} />
            </div>
          </aside>

          <main className="solo-main">
            <header className="solo-scramble">
              <div className="scramble-main">
                <div className="scramble-text" aria-label="Embaralhamento">
                  {scramble ?? "Gerando embaralhamento…"}
                </div>
                <StartPosition />
              </div>
              <div className="solo-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setDialog("preview")}
                  disabled={!scramble}
                  title="Ver o embaralhamento no cubo virtual"
                  aria-label="Ver o embaralhamento no cubo virtual"
                >
                  <GridIcon />
                </button>
              </div>
            </header>

            <div
              className={`timer-display solo-timer phase-${state.phase}`}
              onPointerDown={(e) => {
                e.preventDefault();
                timer.press("spaceDown");
              }}
              onPointerUp={() => timer.press("spaceUp")}
              role="timer"
              aria-live="off"
            >
              <div className="time">{display}</div>
              <div className="hint">{HINT[state.phase]}</div>
            </div>

            <div className="solo-averages">
              <div>ao5: {formatTime(stats.ao5)}</div>
              <div>ao12: {formatTime(stats.ao12)}</div>
            </div>
          </main>
        </div>
      ) : (
        <LearnPage set={view} repo={repo} />
      )}

      {dialog === "preview" && scramble && <ScramblePreviewDialog scramble={scramble} onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SettingsDialog repo={repo} onClose={() => setDialog(null)} />}
    </div>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={3 + c * 6.5} y={3 + r * 6.5} width="5" height="5" rx="1" fill="currentColor" />))}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
