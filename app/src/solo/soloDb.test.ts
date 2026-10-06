import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { parseExport } from "./exportFormat";
import { SoloDb, SoloRepo } from "./soloDb";

let repo: SoloRepo;

beforeEach(() => {
  repo = new SoloRepo(new SoloDb(`test-${crypto.randomUUID()}`));
});

describe("SoloRepo", () => {
  it("creates the first session once and numbers the next ones", async () => {
    const first = await repo.ensureSession();
    expect((await repo.ensureSession()).id).toBe(first.id);
    const second = await repo.createSession();
    expect([first.number, second.number]).toEqual([1, 2]);
    expect((await repo.listSessions()).map((s) => s.number)).toEqual([2, 1]);
  });

  it("closes the previous session when a new one is created, keeping its createdAt", async () => {
    const first = await repo.createSession(1_000);
    await repo.createSession(5_000);
    const [second, closed] = await repo.listSessions();
    expect(closed).toMatchObject({ id: first.id, createdAt: 1_000, endedAt: 5_000 });
    expect(second.endedAt).toBeUndefined();
  });

  it("touches updatedAt when solves are added or deleted", async () => {
    const s = await repo.createSession(1_000);
    const solve = await repo.addSolve({ sessionId: s.id, scramble: "R U", timeMs: 12_340 }, 2_000);
    expect((await repo.listSessions())[0]).toMatchObject({ createdAt: 1_000, updatedAt: 2_000 });
    await repo.deleteSolve(solve.id, 3_000);
    expect((await repo.listSessions())[0].updatedAt).toBe(3_000);
    expect(await repo.solvesOf(s.id)).toEqual([]);
  });

  it("lists solves oldest first", async () => {
    const s = await repo.createSession();
    await repo.addSolve({ sessionId: s.id, scramble: "B", timeMs: 2 }, 20);
    await repo.addSolve({ sessionId: s.id, scramble: "A", timeMs: 1 }, 10);
    expect((await repo.solvesOf(s.id)).map((x) => x.scramble)).toEqual(["A", "B"]);
  });

  it("round-trips an export and importing it again changes nothing", async () => {
    const a = await repo.createSession(1_000);
    await repo.addSolve({ sessionId: a.id, scramble: "R U R'", timeMs: 20_000 }, 1_500);
    const b = await repo.createSession(2_000);
    await repo.addSolve({ sessionId: b.id, scramble: "F2", timeMs: 18_000 }, 2_500);
    const data = await repo.exportData();

    const other = new SoloRepo(new SoloDb(`test-${crypto.randomUUID()}`));
    expect(await other.importData(JSON.stringify(data))).toEqual({ sessions: 2, solves: 2, algProgress: 0 });
    await other.importData(data);
    const reexported = await other.exportData();
    expect({ ...reexported, exportedAt: 0 }).toEqual({ ...data, exportedAt: 0 });
  });

  it("replaces an empty local session that holds an imported number", async () => {
    const empty = await repo.ensureSession();
    const other = new SoloRepo(new SoloDb(`test-${crypto.randomUUID()}`));
    const s = await other.createSession(500);
    await other.addSolve({ sessionId: s.id, scramble: "U", timeMs: 9_000 }, 600);
    await repo.importData(await other.exportData());
    const sessions = await repo.listSessions();
    expect(sessions.map((x) => [x.id, x.number])).toEqual([[s.id, 1]]);
    expect(sessions.some((x) => x.id === empty.id)).toBe(false);
  });

  it("renumbers an imported session whose number is taken", async () => {
    const local = await repo.createSession(1_000);
    await repo.addSolve({ sessionId: local.id, scramble: "R", timeMs: 1_000 }, 1_100);
    const other = new SoloRepo(new SoloDb(`test-${crypto.randomUUID()}`));
    const s = await other.createSession(500);
    await other.addSolve({ sessionId: s.id, scramble: "U", timeMs: 9_000 }, 600);
    await repo.importData(await other.exportData());
    const sessions = await repo.listSessions();
    expect(sessions.map((x) => x.number)).toEqual([2, 1]);
    expect(sessions[0]).toMatchObject({ id: s.id, createdAt: 500 });
    expect(await repo.solvesOf(s.id)).toHaveLength(1);
  });
});

describe("study progress", () => {
  it("is exported and merged on import, the newest update winning", async () => {
    await repo.setAlgProgress("oll/OLL 1", "aprendendo", 100);
    await repo.setAlgProgress("pll/Aa", "sei", 100);
    const other = new SoloRepo(new SoloDb(`test-${crypto.randomUUID()}`));
    await other.setAlgProgress("pll/Aa", "novo", 50);
    await other.setAlgProgress("f2l/F2L 1", "sei", 300);
    await other.importData(await repo.exportData());
    const progress = Object.fromEntries((await other.listAlgProgress()).map((p) => [p.key, p.status]));
    expect(progress).toEqual({ "oll/OLL 1": "aprendendo", "pll/Aa": "sei", "f2l/F2L 1": "sei" });
  });

  it("rejects an invalid status", () => {
    expect(() => parseExport({ app: "cubo-solo", version: 1, sessions: [], algProgress: [{ key: "x", status: "talvez", updatedAt: 1 }] })).toThrow(
      "algProgress[0].status",
    );
  });
});

describe("parseExport", () => {
  it("rejects invalid input with a readable message", () => {
    expect(() => parseExport("{")).toThrow("JSON válido");
    expect(() => parseExport({ app: "outro" })).toThrow("cubo-solo");
    expect(() => parseExport({ app: "cubo-solo", version: 2, sessions: [] })).toThrow("Versão 2");
    expect(() =>
      parseExport({ app: "cubo-solo", version: 1, sessions: [{ id: "a", number: 1, createdAt: 1, solves: [{ id: "x", createdAt: 1, scramble: "R" }] }] }),
    ).toThrow("sessions[0].solves[0].timeMs");
  });

  it("defaults updatedAt to createdAt", () => {
    const data = parseExport({ app: "cubo-solo", version: 1, sessions: [{ id: "a", number: 1, createdAt: 7, solves: [] }] });
    expect(data.sessions[0].updatedAt).toBe(7);
  });
});
