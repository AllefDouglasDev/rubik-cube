// csTimer export/import format:
// { "session1": [[[penalty, timeMs], scramble, comment, unixSeconds], ...], "properties": { "sessionData": "<JSON>" } }
// penalty: 0 = OK, 2000 = +2, -1 = DNF. sessionData maps the session number to { name, ... }.
import type { Penalty } from "../stats/stats";
import type { Session, Solve } from "./db";

type CsTimerSolve = [[number, number], string, string, number];
export type CsTimerExport = Record<string, CsTimerSolve[] | Record<string, unknown>> & { properties: Record<string, unknown> };

const PENALTY_TO_CS: Record<Penalty, number> = { none: 0, "+2": 2000, dnf: -1 };

function penaltyFromCs(value: number): Penalty {
  if (value === -1) return "dnf";
  return value > 0 ? "+2" : "none";
}

export function toCsTimer(data: { session: Session; solves: Solve[] }[]): CsTimerExport {
  const out: CsTimerExport = { properties: {} };
  const sessionData: Record<string, { name: string; opt: Record<string, never>; rank: number }> = {};
  data.forEach(({ session, solves }, i) => {
    const n = i + 1;
    out[`session${n}`] = solves.map(
      (s): CsTimerSolve => [[PENALTY_TO_CS[s.penalty], s.timeMs], s.scramble, s.notes ?? "", Math.floor(s.createdAt / 1000)],
    );
    sessionData[n] = { name: session.name, opt: {}, rank: n };
  });
  out.properties = { sessionData: JSON.stringify(sessionData) };
  return out;
}

export interface ImportedSession {
  name: string;
  solves: Omit<Solve, "id" | "sessionId">[];
}

export function fromCsTimer(data: unknown): ImportedSession[] {
  if (!data || typeof data !== "object") throw new Error("Arquivo inválido: não é um objeto JSON.");
  const record = data as Record<string, unknown>;
  const properties = (record.properties ?? {}) as Record<string, unknown>;
  const rawSessionData = properties.sessionData;
  const sessionData = (typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : (rawSessionData ?? {})) as Record<string, { name?: unknown }>;

  const keys = Object.keys(record)
    .filter((k) => /^session\d+$/.test(k))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
  if (!keys.length) throw new Error("Arquivo inválido: nenhuma sessão do csTimer encontrada.");

  return keys.map((key) => {
    const n = key.slice(7);
    const list = record[key];
    if (!Array.isArray(list)) throw new Error(`Arquivo inválido: ${key} não é uma lista.`);
    const name = sessionData[n]?.name;
    return {
      name: typeof name === "string" || typeof name === "number" ? String(name) : `Sessão ${n}`,
      solves: list.map((entry, i) => {
        const [[penalty, timeMs], scramble, comment, seconds] = entry as CsTimerSolve;
        if (typeof timeMs !== "number" || typeof penalty !== "number") throw new Error(`Arquivo inválido: ${key}[${i}] sem tempo.`);
        return {
          createdAt: typeof seconds === "number" ? seconds * 1000 : Date.now(),
          scramble: typeof scramble === "string" ? scramble : "",
          timeMs,
          penalty: penaltyFromCs(penalty),
          source: "import" as const,
          notes: comment || undefined,
        };
      }),
    };
  });
}
