// Data access for sessions and solves. Cancelled solves never reach this layer.
import type { Penalty } from "../stats/stats";
import type { AlgStat, CubeDb, CurriculumProgress, Session, Solve, TrackingRun } from "./db";
import { type CsTimerExport, fromCsTimer, toCsTimer } from "./cstimer";

export type NewSolve = Omit<Solve, "id" | "createdAt"> & { createdAt?: number };

export class Repo {
  constructor(private readonly db: CubeDb) {}

  async createSession(name: string): Promise<Session> {
    const session: Session = { id: crypto.randomUUID(), name, puzzle: "333", createdAt: Date.now() };
    await this.db.sessions.add(session);
    return session;
  }

  listSessions(): Promise<Session[]> {
    return this.db.sessions.orderBy("createdAt").toArray();
  }

  async ensureSession(): Promise<Session> {
    return (await this.db.sessions.orderBy("createdAt").first()) ?? this.createSession("Sessão 1");
  }

  async renameSession(id: string, name: string): Promise<void> {
    await this.db.sessions.update(id, { name });
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.transaction("rw", this.db.sessions, this.db.solves, async () => {
      await this.db.solves.where("sessionId").equals(id).delete();
      await this.db.sessions.delete(id);
    });
  }

  async addSolve(input: NewSolve): Promise<Solve> {
    const solve: Solve = { ...input, id: crypto.randomUUID(), createdAt: input.createdAt ?? Date.now() };
    await this.db.solves.add(solve);
    return solve;
  }

  // Oldest first.
  solvesOf(sessionId: string): Promise<Solve[]> {
    return this.db.solves.where("[sessionId+createdAt]").between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
  }

  async setPenalty(id: string, penalty: Penalty): Promise<void> {
    await this.db.solves.update(id, { penalty });
  }

  async deleteSolve(id: string): Promise<void> {
    await this.db.solves.delete(id);
  }

  async setReconstruction(id: string, moves: Solve["moves"], phases: Solve["phases"]): Promise<void> {
    await this.db.solves.update(id, { moves, phases });
  }

  async addTrackingRun(run: Omit<TrackingRun, "id" | "createdAt">): Promise<TrackingRun> {
    const saved: TrackingRun = { ...run, id: crypto.randomUUID(), createdAt: Date.now() };
    await this.db.trackingRuns.add(saved);
    return saved;
  }

  listTrackingRuns(): Promise<TrackingRun[]> {
    return this.db.trackingRuns.orderBy("createdAt").reverse().toArray();
  }

  async deleteTrackingRun(id: string): Promise<void> {
    await this.db.trackingRuns.delete(id);
  }

  listAlgStats(): Promise<AlgStat[]> {
    return this.db.algStats.toArray();
  }

  async putAlgStat(stat: AlgStat): Promise<void> {
    await this.db.algStats.put(stat);
  }

  allSolves(): Promise<Solve[]> {
    return this.db.solves.orderBy("createdAt").toArray();
  }

  listProgress(): Promise<CurriculumProgress[]> {
    return this.db.progress.toArray();
  }

  async setProgress(itemId: string, status: CurriculumProgress["status"]): Promise<void> {
    await this.db.progress.put({ itemId, status, updatedAt: Date.now() });
  }

  async exportCsTimer(): Promise<CsTimerExport> {
    const sessions = await this.listSessions();
    const solves = await Promise.all(sessions.map((s) => this.solvesOf(s.id)));
    return toCsTimer(sessions.map((session, i) => ({ session, solves: solves[i] })));
  }

  // Imports every session of a csTimer export as new sessions. Returns how many solves were imported.
  async importCsTimer(data: unknown): Promise<number> {
    const parsed = fromCsTimer(data);
    let count = 0;
    await this.db.transaction("rw", this.db.sessions, this.db.solves, async () => {
      for (const { name, solves } of parsed) {
        const session = await this.createSession(name);
        await this.db.solves.bulkAdd(solves.map((s) => ({ ...s, id: crypto.randomUUID(), sessionId: session.id })));
        count += solves.length;
      }
    });
    return count;
  }
}
