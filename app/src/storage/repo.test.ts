import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { fromCsTimer } from "./cstimer";
import { CubeDb } from "./db";
import { Repo } from "./repo";

let repo: Repo;

beforeEach(() => {
  repo = new Repo(new CubeDb(`test-${crypto.randomUUID()}`));
});

const solve = (sessionId: string, timeMs: number, createdAt: number) =>
  ({ sessionId, timeMs, createdAt, scramble: "R U", penalty: "none", source: "keyboard" }) as const;

describe("Repo", () => {
  it("creates a default session once", async () => {
    const a = await repo.ensureSession();
    const b = await repo.ensureSession();
    expect(a.id).toBe(b.id);
    expect(await repo.listSessions()).toHaveLength(1);
  });

  it("lists solves of a session oldest first", async () => {
    const s = await repo.createSession("A");
    const other = await repo.createSession("B");
    await repo.addSolve(solve(s.id, 3000, 30));
    await repo.addSolve(solve(s.id, 1000, 10));
    await repo.addSolve(solve(other.id, 9999, 20));
    expect((await repo.solvesOf(s.id)).map((x) => x.timeMs)).toEqual([1000, 3000]);
  });

  it("edits penalties and deletes solves", async () => {
    const s = await repo.createSession("A");
    const a = await repo.addSolve(solve(s.id, 1000, 1));
    const b = await repo.addSolve(solve(s.id, 2000, 2));
    await repo.setPenalty(a.id, "+2");
    await repo.deleteSolve(b.id);
    expect(await repo.solvesOf(s.id)).toMatchObject([{ id: a.id, penalty: "+2" }]);
  });

  it("deletes a session with its solves", async () => {
    const s = await repo.createSession("A");
    await repo.addSolve(solve(s.id, 1000, 1));
    await repo.deleteSession(s.id);
    expect(await repo.listSessions()).toHaveLength(0);
    expect(await repo.solvesOf(s.id)).toHaveLength(0);
  });

  it("stores curriculum progress per item", async () => {
    await repo.setProgress("int-03-oll-arestas", "aprendendo");
    await repo.setProgress("int-03-oll-arestas", "aprendido");
    expect(await repo.listProgress()).toMatchObject([{ itemId: "int-03-oll-arestas", status: "aprendido" }]);
  });

  it("round-trips through the csTimer format", async () => {
    const s = await repo.createSession("Treino");
    await repo.addSolve({ ...solve(s.id, 12_340, 1_700_000_000_000), penalty: "+2" });
    await repo.addSolve({ ...solve(s.id, 9_870, 1_700_000_100_000), penalty: "dnf", notes: "pop" });
    const exported = await repo.exportCsTimer();
    expect(exported.session1).toEqual([
      [[2000, 12_340], "R U", "", 1_700_000_000],
      [[-1, 9_870], "R U", "pop", 1_700_000_100],
    ]);

    const target = new Repo(new CubeDb(`test-${crypto.randomUUID()}`));
    expect(await target.importCsTimer(JSON.parse(JSON.stringify(exported)))).toBe(2);
    const [session] = await target.listSessions();
    expect(session.name).toBe("Treino");
    expect(await target.solvesOf(session.id)).toMatchObject([
      { timeMs: 12_340, penalty: "+2", source: "import", createdAt: 1_700_000_000_000 },
      { timeMs: 9_870, penalty: "dnf", notes: "pop" },
    ]);
  });
});

describe("fromCsTimer", () => {
  it("reads a csTimer file with several sessions and default names", () => {
    const data = {
      session2: [[[0, 5000], "U", "", 10]],
      session1: [[[0, 8000], "R", "", 20]],
      properties: { sessionData: JSON.stringify({ 1: { name: "Main" } }) },
    };
    expect(fromCsTimer(data).map((s) => [s.name, s.solves[0].timeMs])).toEqual([
      ["Main", 8000],
      ["Sessão 2", 5000],
    ]);
  });

  it("rejects files without sessions", () => {
    expect(() => fromCsTimer({ properties: {} })).toThrow(/nenhuma sessão/);
  });
});
