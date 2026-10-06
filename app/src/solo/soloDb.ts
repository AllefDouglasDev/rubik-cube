// Persistence of the solo timer (IndexedDB via Dexie), in its own database so it stays independent of the
// trainer. A session is only created on purpose; its number and createdAt never change.
import Dexie, { type EntityTable } from "dexie";
import { type SoloExport, parseExport, toExport } from "./exportFormat";

export interface SoloSession {
  id: string;
  number: number; // incremental, shown as the session name
  createdAt: number;
  updatedAt: number; // last solve added or deleted
  endedAt?: number; // when the next session was created
}

export interface SoloSolve {
  id: string;
  sessionId: string;
  createdAt: number;
  scramble: string;
  timeMs: number;
  penalty: "none"; // the solo timer has no penalties; kept so the WCA stats helpers apply as is
}

export type LearnStatus = "novo" | "aprendendo" | "sei";

// Study progress of an F2L/OLL/PLL case ("<set>/<name>", see learn/cases.ts).
export interface AlgProgress {
  key: string;
  status: LearnStatus;
  updatedAt: number;
}

export class SoloDb extends Dexie {
  sessions!: EntityTable<SoloSession, "id">;
  solves!: EntityTable<SoloSolve, "id">;
  algProgress!: EntityTable<AlgProgress, "key">;

  constructor(name = "cubo-solo") {
    super(name);
    this.version(1).stores({
      sessions: "id, &number, createdAt",
      solves: "id, sessionId, [sessionId+createdAt]",
    });
    this.version(2).stores({ algProgress: "key" });
  }
}

export interface ImportResult {
  sessions: number;
  solves: number;
  algProgress: number;
}

export class SoloRepo {
  constructor(private readonly db: SoloDb) {}

  // Newest first.
  async listSessions(): Promise<SoloSession[]> {
    return this.db.sessions.orderBy("number").reverse().toArray();
  }

  // Creates the next session and closes the ones still open.
  createSession(now = Date.now()): Promise<SoloSession> {
    return this.db.transaction("rw", this.db.sessions, async () => {
      const last = await this.db.sessions.orderBy("number").last();
      await this.db.sessions.filter((s) => s.endedAt === undefined).modify({ endedAt: now });
      const session: SoloSession = { id: crypto.randomUUID(), number: (last?.number ?? 0) + 1, createdAt: now, updatedAt: now };
      await this.db.sessions.add(session);
      return session;
    });
  }

  // The latest session, creating the first one on a fresh database.
  async ensureSession(): Promise<SoloSession> {
    return (await this.db.sessions.orderBy("number").last()) ?? this.createSession();
  }

  // Oldest first.
  solvesOf(sessionId: string): Promise<SoloSolve[]> {
    return this.db.solves.where("[sessionId+createdAt]").between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
  }

  addSolve(input: { sessionId: string; scramble: string; timeMs: number }, now = Date.now()): Promise<SoloSolve> {
    return this.db.transaction("rw", this.db.sessions, this.db.solves, async () => {
      const solve: SoloSolve = { ...input, id: crypto.randomUUID(), createdAt: now, penalty: "none" };
      await this.db.solves.add(solve);
      await this.db.sessions.update(input.sessionId, { updatedAt: now });
      return solve;
    });
  }

  deleteSolve(id: string, now = Date.now()): Promise<void> {
    return this.db.transaction("rw", this.db.sessions, this.db.solves, async () => {
      const solve = await this.db.solves.get(id);
      if (!solve) return;
      await this.db.solves.delete(id);
      await this.db.sessions.update(solve.sessionId, { updatedAt: now });
    });
  }

  listAlgProgress(): Promise<AlgProgress[]> {
    return this.db.algProgress.toArray();
  }

  async setAlgProgress(key: string, status: LearnStatus, now = Date.now()): Promise<void> {
    await this.db.algProgress.put({ key, status, updatedAt: now });
  }

  async exportData(): Promise<SoloExport> {
    const sessions = (await this.listSessions()).reverse();
    const solves = await Promise.all(sessions.map((s) => this.solvesOf(s.id)));
    const progress = await this.db.algProgress.orderBy("key").toArray();
    return toExport(
      sessions.map((session, i) => ({ session, solves: solves[i] })),
      progress,
    );
  }

  // Merges an export by id: importing the same file twice changes nothing. A new session whose number is
  // taken by a local session with solves gets the next free number (an empty one is replaced); an existing
  // session keeps its number.
  async importData(input: unknown): Promise<ImportResult> {
    const data = parseExport(input);
    let solves = 0;
    await this.db.transaction("rw", this.db.sessions, this.db.solves, this.db.algProgress, async () => {
      // Study progress: the most recent update of each case wins.
      for (const p of data.algProgress) {
        const existing = await this.db.algProgress.get(p.key);
        if (!existing || existing.updatedAt < p.updatedAt) await this.db.algProgress.put(p);
      }
      let maxNumber = (await this.db.sessions.orderBy("number").last())?.number ?? 0;
      for (const imported of [...data.sessions].sort((a, b) => a.number - b.number)) {
        const existing = await this.db.sessions.get(imported.id);
        let number = existing?.number ?? imported.number;
        const holder = existing ? undefined : await this.db.sessions.where("number").equals(number).first();
        if (holder) {
          // An empty local session (e.g. the one created on first access) gives its number up.
          if (await this.db.solves.where("sessionId").equals(holder.id).count()) number = maxNumber + 1;
          else await this.db.sessions.delete(holder.id);
        }
        maxNumber = Math.max(maxNumber, number);
        const session: SoloSession = {
          id: imported.id,
          number,
          createdAt: imported.createdAt,
          updatedAt: Math.max(imported.updatedAt, existing?.updatedAt ?? 0),
          ...((imported.endedAt ?? existing?.endedAt) !== undefined && { endedAt: imported.endedAt ?? existing?.endedAt }),
        };
        await this.db.sessions.put(session);
        await this.db.solves.bulkPut(imported.solves.map((s) => ({ ...s, sessionId: imported.id, penalty: "none" as const })));
        solves += imported.solves.length;
      }
    });
    return { sessions: data.sessions.length, solves, algProgress: data.algProgress.length };
  }
}

const SESSION_KEY = "cubo-solo.sessionId";

export function loadCurrentSessionId(): string | undefined {
  try {
    return localStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveCurrentSessionId(id: string): void {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    // The latest session is selected on the next load instead.
  }
}
