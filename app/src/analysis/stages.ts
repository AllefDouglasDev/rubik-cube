// F4.1: splits a solve into CFOP stages (cross, 4 F2L pairs, OLL, PLL), color neutral and rotation aware.
// Boundaries follow the csTimer idea: replay the moves and note when each stage condition is first reached.
import { Alg } from "cubing/alg";
import { type Face, FACES, FaceletCube, ROTATION_FAMILIES } from "./facelets";
import { crossDown, recognizeOll, recognizePll } from "./llCases";

export interface TimedMove {
  m: string;
  t?: number; // ms since the start of the solve; absent for pasted reconstructions
}

export type StageName = "cross" | "f2l1" | "f2l2" | "f2l3" | "f2l4" | "oll" | "pll";

export interface Stage {
  name: StageName;
  // Moves (indices into the move list) that belong to this stage: [from, to).
  from: number;
  to: number;
  moveCount: number; // turns, rotations excluded
  rotations: number;
  skipped: boolean; // reached without any move of its own (e.g. OLL skip, multislotting)
  startMs?: number; // end of the previous stage
  endMs?: number; // time of the last move of the stage
  recognitionMs?: number; // idle time before the first move of the stage
  executionMs?: number;
  // OLL: 2-look description ("L / Sune"); PLL: case name ("T", "Ua"…). Recognised at the start of the stage.
  caseId?: string;
}

export interface SolveAnalysis {
  crossColor: Face | null;
  stages: Stage[]; // only the stages that were reached
  solved: boolean;
  moveCount: number;
  rotations: number;
  timed: boolean;
}

const STAGE_NAMES: StageName[] = ["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"];

export function isRotation(move: string): boolean {
  return ROTATION_FAMILIES.has(move.replace(/['2]/g, ""));
}

export function parseMoves(text: string): TimedMove[] {
  return [...new Alg(text.trim()).experimentalLeafMoves()].map((m) => ({ m: m.toString() }));
}

export function analyzeSolve(scramble: string, moves: TimedMove[]): SolveAnalysis {
  const states: FaceletCube[] = [FaceletCube.solved().apply(scramble)];
  for (const { m } of moves) states.push(states[states.length - 1].apply(m));
  const n = moves.length;
  const timed = moves.length > 0 && moves.every((mv) => typeof mv.t === "number");

  const firstK = (pred: (k: number) => boolean, from = 0, to = n) => {
    for (let k = from; k <= to; k++) if (pred(k)) return k;
    return null;
  };
  // Cross color: the cross that stayed solved for most of the solve, among the colors whose F2L gets built.
  // F2L inserts break the cross only for a move or two (R U R' lifts the DR edge), while another color's
  // "F2L" can be solved by coincidence near the end without its cross having been there before.
  // Without a finished F2L: the most pairs at the end, then the same cross count.
  let crossColor: Face | null = null;
  let best = { finished: false, crossStates: -1, pairs: -1 };
  for (const color of FACES) {
    let crossStates = 0;
    for (let k = 1; k <= n; k++) if (states[k].crossSolved(color)) crossStates++;
    const finished = firstK((k) => states[k].f2lSolved(color), 1) !== null;
    const pairs = states[n].crossSolved(color) ? states[n].f2lPairs(color) : -1;
    const better = finished
      ? !best.finished || crossStates > best.crossStates
      : !best.finished && crossStates > 0 && (pairs > best.pairs || (pairs === best.pairs && crossStates > best.crossStates));
    if (better) {
      best = { finished, crossStates, pairs };
      crossColor = color;
    }
  }
  if (crossColor === null) {
    // No cross standing at the end: fall back to the first cross ever made.
    crossColor = FACES.find((c) => firstK((k) => states[k].crossSolved(c)) !== null) ?? null;
  }

  const ends: (number | null)[] = Array(7).fill(null);
  if (crossColor) {
    const c = crossColor;
    const cross = (k: number) => states[k].crossSolved(c);
    const pairs = (k: number) => (cross(k) ? states[k].f2lPairs(c) : -1);
    const f2lEnd = firstK((k) => states[k].f2lSolved(c));
    const upperBound = f2lEnd ?? n;

    // Greedy forward: each stage ends the first time its condition holds after the previous stage.
    // Inserting a pair lifts a cross edge for a move or two (R U R'), so "cross solved" is only
    // required at the boundaries, not in between.
    const crossEnd = firstK(cross, 0, upperBound);
    ends[0] = crossEnd;
    if (crossEnd !== null) {
      let from = crossEnd;
      for (let p = 1; p <= 4; p++) {
        const found = firstK((k) => pairs(k) >= p, from, upperBound);
        if (found === null) break;
        ends[p] = found;
        from = found;
      }
      if (f2lEnd !== null) {
        ends[4] = f2lEnd;
        const ollEnd = firstK((k) => states[k].f2lSolved(c) && states[k].lastLayerOriented(c), f2lEnd);
        ends[5] = ollEnd;
        if (ollEnd !== null) ends[6] = firstK((k) => states[k].isSolved(), ollEnd);
      }
    }
  }

  const stages: Stage[] = [];
  let prevEnd = 0;
  for (let i = 0; i < STAGE_NAMES.length; i++) {
    const end = ends[i];
    if (end === null) {
      if (i < 4 && ends[0] !== null) continue; // an unreached pair does not stop later bookkeeping of reached ones
      break;
    }
    const slice = moves.slice(prevEnd, end);
    const rotations = slice.filter((mv) => isRotation(mv.m)).length;
    const stage: Stage = {
      name: STAGE_NAMES[i],
      from: prevEnd,
      to: end,
      moveCount: slice.length - rotations,
      rotations,
      skipped: slice.length - rotations === 0,
    };
    if (timed) {
      const startMs = prevEnd > 0 ? moves[prevEnd - 1].t! : 0;
      const endMs = end > 0 ? moves[end - 1].t! : 0;
      const firstTurn = slice.find((mv) => !isRotation(mv.m));
      Object.assign(stage, {
        startMs,
        endMs: Math.max(startMs, endMs),
        recognitionMs: firstTurn ? firstTurn.t! - startMs : 0,
        executionMs: firstTurn ? Math.max(0, endMs - firstTurn.t!) : 0,
      });
    }
    if (crossColor && (stage.name === "oll" || stage.name === "pll")) {
      const atStart = crossDown(states[prevEnd], crossColor);
      if (stage.name === "pll") stage.caseId = recognizePll(atStart) ?? undefined;
      else {
        const oll = recognizeOll(atStart);
        const twoLook = oll.edges === "cruz" ? (oll.corners ?? "cruz") : oll.edges;
        stage.caseId = oll.number ? `${oll.number} (${twoLook})` : twoLook;
      }
    }
    stages.push(stage);
    prevEnd = end;
  }

  const rotations = moves.filter((mv) => isRotation(mv.m)).length;
  return { crossColor, stages, solved: states[n].isSolved(), moveCount: n - rotations, rotations, timed };
}
