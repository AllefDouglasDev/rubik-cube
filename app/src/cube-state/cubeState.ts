// Logical 3x3 state on top of cubing.js KPuzzle: apply moves, check solved, generate scrambles.
import { Alg, Move } from "cubing/alg";
import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { cube3x3x3 } from "cubing/puzzles";

let kpuzzlePromise: Promise<KPuzzle> | undefined;

export function loadKPuzzle(): Promise<KPuzzle> {
  kpuzzlePromise ??= cube3x3x3.kpuzzle();
  return kpuzzlePromise;
}

const SOLVED_OPTIONS = { ignorePuzzleOrientation: true, ignoreCenterOrientation: true };

export class CubeState {
  private constructor(
    readonly pattern: KPattern,
    readonly moves: readonly string[],
  ) {}

  static async solved(): Promise<CubeState> {
    return new CubeState((await loadKPuzzle()).defaultPattern(), []);
  }

  static async fromScramble(scramble: string): Promise<CubeState> {
    const kpuzzle = await loadKPuzzle();
    return new CubeState(kpuzzle.defaultPattern().applyAlg(new Alg(scramble)), []);
  }

  // Applies a single move (validated by Move.fromString) or a whole algorithm.
  apply(notation: string): CubeState {
    const alg = new Alg(notation);
    const moves = [...alg.experimentalLeafMoves()].map((m) => m.toString());
    return new CubeState(this.pattern.applyAlg(alg), [...this.moves, ...moves]);
  }

  isSolved(): boolean {
    return this.pattern.experimentalIsSolved(SOLVED_OPTIONS);
  }
}

// Returns null when the text is not valid notation.
export function parseAlg(text: string): Alg | null {
  try {
    return new Alg(text.trim());
  } catch {
    return null;
  }
}

export function isValidMove(text: string): boolean {
  try {
    Move.fromString(text);
    return true;
  } catch {
    return false;
  }
}

export async function randomScramble(): Promise<string> {
  const { randomScrambleForEvent } = await import("cubing/scramble");
  return (await randomScrambleForEvent("333")).toString();
}
