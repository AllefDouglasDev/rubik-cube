// JSON backup of the solo timer: every session with its solves, plus the F2L/OLL/PLL study progress.
import type { AlgProgress, LearnStatus, SoloSession, SoloSolve } from "./soloDb";

export const EXPORT_APP = "cubo-solo";
export const EXPORT_VERSION = 1;

export interface ExportedSolve {
  id: string;
  createdAt: number;
  scramble: string;
  timeMs: number;
}

export interface ExportedSession {
  id: string;
  number: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  solves: ExportedSolve[];
}

export interface SoloExport {
  app: typeof EXPORT_APP;
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  sessions: ExportedSession[];
  algProgress: AlgProgress[]; // optional in the file (older exports have none)
}

const STATUSES: LearnStatus[] = ["novo", "aprendendo", "sei"];

export function toExport(
  data: { session: SoloSession; solves: SoloSolve[] }[],
  algProgress: AlgProgress[] = [],
  exportedAt = Date.now(),
): SoloExport {
  return {
    app: EXPORT_APP,
    version: EXPORT_VERSION,
    exportedAt,
    sessions: data.map(({ session, solves }) => ({
      id: session.id,
      number: session.number,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      ...(session.endedAt !== undefined && { endedAt: session.endedAt }),
      solves: solves.map(({ id, createdAt, scramble, timeMs }) => ({ id, createdAt, scramble, timeMs })),
    })),
    algProgress: algProgress.map(({ key, status, updatedAt }) => ({ key, status, updatedAt })),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

// Validates an export (already parsed or as JSON text). Throws an Error with a message for the user.
export function parseExport(input: unknown): SoloExport {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error("O conteúdo não é um JSON válido.");
    }
  }
  if (!isRecord(data) || data.app !== EXPORT_APP) throw new Error(`O JSON não é um export do treino solo (esperado "app": "${EXPORT_APP}").`);
  if (data.version !== EXPORT_VERSION) throw new Error(`Versão ${String(data.version)} não suportada (esperada ${EXPORT_VERSION}).`);
  if (!Array.isArray(data.sessions)) throw new Error('Faltou a lista "sessions".');

  const sessions = data.sessions.map((s: unknown, i): ExportedSession => {
    const where = `sessions[${i}]`;
    if (!isRecord(s)) throw new Error(`${where} não é um objeto.`);
    if (!isText(s.id)) throw new Error(`${where}.id inválido.`);
    if (!isNumber(s.number) || s.number < 1 || !Number.isInteger(s.number)) throw new Error(`${where}.number inválido.`);
    if (!isNumber(s.createdAt)) throw new Error(`${where}.createdAt inválido.`);
    if (s.updatedAt !== undefined && !isNumber(s.updatedAt)) throw new Error(`${where}.updatedAt inválido.`);
    if (s.endedAt !== undefined && !isNumber(s.endedAt)) throw new Error(`${where}.endedAt inválido.`);
    if (!Array.isArray(s.solves)) throw new Error(`${where}.solves não é uma lista.`);
    const solves = s.solves.map((v: unknown, j): ExportedSolve => {
      const at = `${where}.solves[${j}]`;
      if (!isRecord(v)) throw new Error(`${at} não é um objeto.`);
      if (!isText(v.id)) throw new Error(`${at}.id inválido.`);
      if (!isNumber(v.createdAt)) throw new Error(`${at}.createdAt inválido.`);
      if (typeof v.scramble !== "string") throw new Error(`${at}.scramble inválido.`);
      if (!isNumber(v.timeMs) || v.timeMs < 0) throw new Error(`${at}.timeMs inválido.`);
      return { id: v.id, createdAt: v.createdAt, scramble: v.scramble, timeMs: v.timeMs };
    });
    return {
      id: s.id,
      number: s.number,
      createdAt: s.createdAt,
      updatedAt: (s.updatedAt as number | undefined) ?? s.createdAt,
      ...(s.endedAt !== undefined && { endedAt: s.endedAt as number }),
      solves,
    };
  });
  if (data.algProgress !== undefined && !Array.isArray(data.algProgress)) throw new Error('"algProgress" não é uma lista.');
  const algProgress = ((data.algProgress as unknown[] | undefined) ?? []).map((p, i): AlgProgress => {
    const where = `algProgress[${i}]`;
    if (!isRecord(p) || !isText(p.key)) throw new Error(`${where}.key inválido.`);
    if (!STATUSES.includes(p.status as LearnStatus)) throw new Error(`${where}.status inválido (use ${STATUSES.join(", ")}).`);
    if (!isNumber(p.updatedAt)) throw new Error(`${where}.updatedAt inválido.`);
    return { key: p.key, status: p.status as LearnStatus, updatedAt: p.updatedAt };
  });
  return { app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: isNumber(data.exportedAt) ? data.exportedAt : 0, sessions, algProgress };
}
