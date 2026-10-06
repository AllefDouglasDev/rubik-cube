import { useLiveQuery } from "dexie-react-hooks";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import "./features";
import { useSettings } from "./settings";
import { db } from "./storage/db";
import { Repo } from "./storage/repo";
import { CurriculumPage } from "./ui/CurriculumPage";
import { HistoryPage } from "./ui/HistoryPage";
import { SessionBar } from "./ui/SessionBar";
import { TimerPage } from "./ui/TimerPage";
import { TrainerPage } from "./ui/TrainerPage";

type Tab = "timer" | "history" | "curriculum" | "trainer" | "scan" | "tracking";

// Camera pages only exist behind the flag; when it is off the dynamic imports are dropped from the build.
const ScanPage = __CAMERA_FEATURES__ ? lazy(() => import("./ui/ScanPage").then((m) => ({ default: m.ScanPage }))) : null;
const TrackingPage = __CAMERA_FEATURES__ ? lazy(() => import("./ui/TrackingPage").then((m) => ({ default: m.TrackingPage }))) : null;

const TABS: [Tab, string][] = [
  ["timer", "Timer"],
  ["history", "Histórico"],
  ["curriculum", "Currículo"],
  ["trainer", "Treino"],
  ...(__CAMERA_FEATURES__
    ? ([
        ["scan", "Câmera"],
        ["tracking", "Rastreamento"],
      ] as [Tab, string][])
    : []),
];

export function App() {
  const repo = useMemo(() => new Repo(db), []);
  const [settings, updateSettings] = useSettings();
  const [tab, setTab] = useState<Tab>("timer");
  const [timerScramble, setTimerScramble] = useState<string | null>(null);
  const [scrambleOverride, setScrambleOverride] = useState<{ alg: string; nonce: number } | null>(null);
  const sessions = useLiveQuery(() => repo.listSessions(), [repo]);

  // Make sure the selected session exists (first run, or after it was deleted).
  useEffect(() => {
    if (!sessions) return;
    if (!settings.sessionId || !sessions.some((s) => s.id === settings.sessionId)) {
      repo.ensureSession().then((s) => updateSettings({ sessionId: s.id }));
    }
  }, [sessions, settings.sessionId, repo, updateSettings]);

  const sessionId = sessions?.some((s) => s.id === settings.sessionId) ? settings.sessionId : undefined;
  const solves = useLiveQuery(() => (sessionId ? repo.solvesOf(sessionId) : []), [repo, sessionId]);

  if (!sessions || !sessionId || !solves) return <div className="loading">Carregando…</div>;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cubo 3x3 Trainer</h1>
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <a className="nav-link" href="solo.html">
            Treino solo
          </a>
        </nav>
        <SessionBar repo={repo} sessions={sessions} sessionId={sessionId} onSelect={(id) => updateSettings({ sessionId: id })} />
      </header>
      <main>
        <div hidden={tab !== "timer"}>
          <TimerPage
            repo={repo}
            sessionId={sessionId}
            solves={solves}
            settings={settings}
            onSettings={updateSettings}
            active={tab === "timer"}
            scrambleOverride={scrambleOverride}
            onScrambleChange={setTimerScramble}
          />
        </div>
        {tab === "history" && <HistoryPage repo={repo} solves={solves} />}
        {tab === "curriculum" && <CurriculumPage repo={repo} />}
        {tab === "trainer" && <TrainerPage repo={repo} active holdMs={settings.holdMs} />}
        <Suspense fallback={<div className="loading">Carregando…</div>}>
          {tab === "tracking" && TrackingPage && (
            <TrackingPage repo={repo} active sessionId={sessionId} timerScramble={timerScramble} holdMs={settings.holdMs} />
          )}
          {tab === "scan" && ScanPage && (
            <ScanPage
              active
              timerScramble={timerScramble}
              onUseState={(alg) => {
                setScrambleOverride({ alg, nonce: Date.now() });
                setTab("timer");
              }}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
