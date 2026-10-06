// Study page for one set (F2L, OLL or PLL): every case with its picture and status, a study dialog with the
// algorithm on the virtual cube, and a practice mode that shows a case and reveals the algorithm on demand.
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { CubeView } from "../../renderer/CubeView";
import { caseScramble } from "../../trainer/caseScramble";
import { Dialog } from "../../ui/Dialog";
import { StartPosition } from "../../ui/ScramblePreviewDialog";
import type { CubeNet } from "../../vision/cubeNet";
import type { LearnStatus, SoloRepo } from "../soloDb";
import { CaseDiagram } from "./CaseDiagram";
import { type CaseSet, SET_INFO, type StudyCase, caseNet, casesOf } from "./cases";

const STATUS_LABEL: Record<LearnStatus, string> = { novo: "Novo", aprendendo: "Aprendendo", sei: "Sei" };
const STATUSES: LearnStatus[] = ["novo", "aprendendo", "sei"];
// Practice draws cases still being learned more often.
const PRACTICE_WEIGHT: Record<LearnStatus, number> = { novo: 2, aprendendo: 3, sei: 1 };

type Filter = LearnStatus | "todos";

interface Props {
  set: CaseSet;
  repo: SoloRepo;
}

export function LearnPage({ set, repo }: Props) {
  const cases = useMemo(() => casesOf(set), [set]);
  const nets = useMemo(() => new Map(cases.map((c) => [c.key, caseNet(c)])), [cases]);
  const progress = useLiveQuery(() => repo.listAlgProgress(), [repo]);
  const statusOf = useMemo(() => {
    const map = new Map(progress?.map((p) => [p.key, p.status]));
    return (key: string): LearnStatus => map.get(key) ?? "novo";
  }, [progress]);
  const [filter, setFilter] = useState<Filter>("todos");
  const [studying, setStudying] = useState<number | null>(null);
  const [practicing, setPracticing] = useState(false);

  useEffect(() => {
    setFilter("todos");
    setStudying(null);
    setPracticing(false);
  }, [set]);

  const visible = cases.filter((c) => filter === "todos" || statusOf(c.key) === filter);
  const count = (s: LearnStatus) => cases.filter((c) => statusOf(c.key) === s).length;
  const setStatus = (key: string, status: LearnStatus) => repo.setAlgProgress(key, status);

  return (
    <div className="learn">
      <header className="learn-header">
        <div>
          <h2>
            {SET_INFO[set].title} <span className="muted">· {cases.length} casos</span>
          </h2>
          <p className="muted">{SET_INFO[set].hint}</p>
          <StartPosition />
        </div>
        <button type="button" className="selected" onClick={() => setPracticing(true)} disabled={!visible.length}>
          Praticar {filter === "todos" ? "todos" : STATUS_LABEL[filter].toLowerCase()} ({visible.length})
        </button>
      </header>

      <div className="tabs learn-filter" role="tablist" aria-label="Filtrar por status">
        {(["todos", ...STATUSES] as Filter[]).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "selected" : ""} onClick={() => setFilter(f)}>
            {f === "todos" ? "Todos" : STATUS_LABEL[f]} ({f === "todos" ? cases.length : count(f)})
          </button>
        ))}
      </div>

      <ul className="case-grid">
        {visible.map((c) => (
          <li key={c.key}>
            <button type="button" className="case-card" onClick={() => setStudying(cases.indexOf(c))}>
              <CaseDiagram c={c} net={nets.get(c.key)!} />
              <span className="case-name">{c.name}</span>
              <span className={`status-pill status-${statusOf(c.key)}`}>{STATUS_LABEL[statusOf(c.key)]}</span>
            </button>
          </li>
        ))}
      </ul>

      {studying !== null && (
        <StudyDialog
          c={cases[studying]}
          net={nets.get(cases[studying].key)!}
          status={statusOf(cases[studying].key)}
          onStatus={(s) => setStatus(cases[studying].key, s)}
          onPrev={() => setStudying((studying + cases.length - 1) % cases.length)}
          onNext={() => setStudying((studying + 1) % cases.length)}
          onClose={() => setStudying(null)}
        />
      )}
      {practicing && (
        <PracticeDialog
          title={`Praticar ${SET_INFO[set].title}`}
          cases={visible}
          nets={nets}
          statusOf={statusOf}
          onStatus={setStatus}
          onClose={() => setPracticing(false)}
        />
      )}
    </div>
  );
}

// Scramble that builds the case on the real cube from the start position (computed by the solver).
function useCaseScramble(alg: string): string | null {
  const [scramble, setScramble] = useState<{ alg: string; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    caseScramble(alg).then((text) => alive && setScramble({ alg, text }));
    return () => {
      alive = false;
    };
  }, [alg]);
  return scramble?.alg === alg ? scramble.text : null;
}

function AlgMoves({ alg }: { alg: string }) {
  return (
    <p className="alg-moves" aria-label="Algoritmo">
      {alg.split(/\s+/).map((m, i) => (
        <span key={i}>{m}</span>
      ))}
    </p>
  );
}

function StatusButtons({ status, onStatus }: { status: LearnStatus; onStatus: (s: LearnStatus) => void }) {
  return (
    <div className="row" role="group" aria-label="Status do caso">
      {STATUSES.map((s) => (
        <button key={s} type="button" className={status === s ? "selected" : ""} onClick={() => onStatus(s)}>
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

interface StudyProps {
  c: StudyCase;
  net: CubeNet;
  status: LearnStatus;
  onStatus: (s: LearnStatus) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function StudyDialog({ c, net, status, onStatus, onPrev, onNext, onClose }: StudyProps) {
  const scramble = useCaseScramble(c.alg);
  return (
    <Dialog title={`${SET_INFO[c.set].title} · ${c.name}`} onClose={onClose} className="study-dialog">
      <div className="study-layout">
        <div className="study-case">
          <CaseDiagram c={c} net={net} size={140} />
          <AlgMoves alg={c.alg} />
          <StatusButtons status={status} onStatus={onStatus} />
        </div>
        <figure>
          <div className="preview-cube">
            <CubeView key={c.key} setup={c.setup} alg={c.alg} />
          </div>
          <figcaption className="muted">O cubo começa no caso; use os controles para ver o algoritmo giro a giro.</figcaption>
        </figure>
      </div>
      <p className="muted">
        Montar no cubo real (a partir da posição inicial): <span className="case-scramble">{scramble ?? "gerando…"}</span>
      </p>
      <div className="row spread">
        <button type="button" onClick={onPrev}>
          ← Anterior
        </button>
        <button type="button" onClick={onNext}>
          Próximo →
        </button>
      </div>
    </Dialog>
  );
}

interface PracticeProps {
  title: string;
  cases: StudyCase[];
  nets: Map<string, CubeNet>;
  statusOf: (key: string) => LearnStatus;
  onStatus: (key: string, s: LearnStatus) => void;
  onClose: () => void;
}

function PracticeDialog({ title, cases, nets, statusOf, onStatus, onClose }: PracticeProps) {
  const pick = (previous?: StudyCase): StudyCase => {
    const pool = cases.length > 1 ? cases.filter((c) => c.key !== previous?.key) : cases;
    let r = Math.random() * pool.reduce((sum, c) => sum + PRACTICE_WEIGHT[statusOf(c.key)], 0);
    for (const c of pool) {
      r -= PRACTICE_WEIGHT[statusOf(c.key)];
      if (r <= 0) return c;
    }
    return pool[pool.length - 1];
  };
  const [current, setCurrent] = useState(() => pick());
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const scramble = useCaseScramble(current.alg);

  const answer = (knew: boolean) => {
    onStatus(current.key, knew ? "sei" : "aprendendo");
    setScore((s) => ({ right: s.right + (knew ? 1 : 0), total: s.total + 1 }));
    setRevealed(false);
    setCurrent(pick(current));
  };

  return (
    <Dialog title={title} onClose={onClose} className="study-dialog">
      <p className="muted">
        Reconheça o caso e tente executar o algoritmo no seu cubo. Depois revele e diga se acertou. Placar: {score.right}/{score.total}
      </p>
      <div className="study-layout">
        <div className="study-case">
          <CaseDiagram c={current} net={nets.get(current.key)!} size={140} />
          {revealed ? (
            <>
              <strong>{current.name}</strong>
              <AlgMoves alg={current.alg} />
            </>
          ) : (
            <span className="muted">Qual é o caso?</span>
          )}
        </div>
        <figure>
          <div className="preview-cube">
            <CubeView key={`${current.key}-${revealed}`} setup={current.setup} alg={revealed ? current.alg : undefined} />
          </div>
        </figure>
      </div>
      <p className="muted">
        Montar no cubo real: <span className="case-scramble">{scramble ?? "gerando…"}</span>
      </p>
      <div className="row">
        {revealed ? (
          <>
            <button type="button" className="danger" onClick={() => answer(false)}>
              Errei · ainda aprendendo
            </button>
            <button type="button" className="selected" onClick={() => answer(true)}>
              Acertei · sei
            </button>
          </>
        ) : (
          <button type="button" className="selected" onClick={() => setRevealed(true)}>
            Mostrar algoritmo
          </button>
        )}
      </div>
    </Dialog>
  );
}
