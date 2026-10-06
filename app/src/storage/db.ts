// Local-first persistence in IndexedDB (Dexie). Model described in docs/04-timer-e-dados.md.
import Dexie, { type EntityTable } from "dexie";
import type { Penalty } from "../stats/stats";

export interface Session {
  id: string;
  name: string;
  puzzle: "333";
  createdAt: number;
}

export interface SolveMove {
  m: string;
  t?: number; // ms since the start of the solve; absent in a pasted reconstruction
  confidence?: number; // camera tracking
  inferred?: boolean; // filled in by the solver instead of observed
}

export interface SolvePhase {
  name: string;
  moveCount: number;
  rotations?: number;
  startMs?: number;
  endMs?: number;
  recognitionMs?: number;
  caseId?: string;
}

export interface Solve {
  id: string;
  sessionId: string;
  createdAt: number;
  scramble: string;
  timeMs: number; // raw time, without penalty
  penalty: Penalty;
  inspectionMs?: number;
  source: "keyboard" | "camera" | "import";
  trackingMode?: "realtime" | "post-reconstruction";
  videoRef?: string;
  moves?: SolveMove[];
  phases?: SolvePhase[];
  notes?: string;
}

export interface CurriculumProgress {
  itemId: string; // id of an item in docs/curriculum/*.json
  status: "nao-iniciado" | "aprendendo" | "aprendido" | "dominado";
  updatedAt: number;
}

// Trainer statistics per algorithm ("<curriculum item id>/<alg name>").
export interface AlgStat {
  key: string;
  box: number; // Leitner box 1 (review often) … 5 (known)
  reps: number;
  fails: number;
  recentMs: number[]; // last execution times, newest last (max 12)
  bestMs?: number;
  lastAt: number;
}

// Tracking runs (S4/F3.7): guided executions with what was expected, what was decoded and the raw
// observations, so the decoder can be re-evaluated offline.
export interface TrackingRun {
  id: string;
  createdAt: number;
  mode: "guided" | "free" | "solve";
  expected?: string[];
  decoded: string[];
  accuracy?: number;
  observations: { t: number; face: (number | null)[] }[];
}

export class CubeDb extends Dexie {
  sessions!: EntityTable<Session, "id">;
  solves!: EntityTable<Solve, "id">;
  progress!: EntityTable<CurriculumProgress, "itemId">;
  algStats!: EntityTable<AlgStat, "key">;
  trackingRuns!: EntityTable<TrackingRun, "id">;

  constructor(name = "cubo-trainer") {
    super(name);
    this.version(1).stores({
      sessions: "id, createdAt",
      solves: "id, sessionId, createdAt, [sessionId+createdAt]",
    });
    this.version(2).stores({ progress: "itemId" });
    this.version(3).stores({ algStats: "key" });
    this.version(4).stores({ trackingRuns: "id, createdAt" });
  }
}

export const db = new CubeDb();
