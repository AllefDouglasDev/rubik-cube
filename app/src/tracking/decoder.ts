// Move decoder (S3 / F3.3): the start state is known and the camera sees only the front face. After each
// stable observation, every hypothesis is extended by 0–2 moves; hypotheses whose front face disagrees
// with the observation pay per mismatched sticker, and only the cheapest few survive (beam search).
// Back-face turns are invisible when they happen and get inferred once their effect reaches the front.
import { type StickerState, applyMove, stateKey } from "./stickerModel";

const FACE_TURNS = ["U", "D", "R", "L", "F", "B"].flatMap((f) => [f, `${f}'`, `${f}2`]);
const SLICES = ["M", "E", "S"].flatMap((f) => [f, `${f}'`, `${f}2`]);
const ROTATIONS = ["x", "y", "z"].flatMap((f) => [f, `${f}'`, `${f}2`]);

export interface DecoderOptions {
  beamWidth: number;
  maxMovesPerStep: number;
  mismatchCost: number;
  // Per move: face turns are the expected case; slices and whole-cube rotations need more evidence.
  moveCost: (move: string) => number;
  allowSlices: boolean;
  allowRotations: boolean;
}

export const DEFAULT_DECODER: DecoderOptions = {
  beamWidth: 24,
  maxMovesPerStep: 2,
  mismatchCost: 1.5, // one misread is cheaper than inventing two moves to explain it
  moveCost: (m) => (/^[xyz]/.test(m) ? 2.5 : /^[MES]/.test(m) ? 1.5 : 1),
  allowSlices: true,
  allowRotations: false,
};

export interface DecodedMove {
  m: string;
  t: number;
  inferred?: boolean; // not observed: added to reach a known final state
}

interface Hypothesis {
  state: StickerState;
  moves: DecodedMove[];
  cost: number;
}

const sameAxis = (a: string, b: string) => a[0] === b[0];

export class MoveDecoder {
  private beam: Hypothesis[];
  private readonly options: DecoderOptions;
  private readonly moveSet: string[];

  constructor(start: StickerState, options: Partial<DecoderOptions> = {}) {
    this.options = { ...DEFAULT_DECODER, ...options };
    this.moveSet = [...FACE_TURNS, ...(this.options.allowSlices ? SLICES : []), ...(this.options.allowRotations ? ROTATIONS : [])];
    this.beam = [{ state: start, moves: [], cost: 0 }];
  }

  // `observed`: the 9 front stickers as face indices (camera view), null where unknown (hand, glare).
  observe(observed: (number | null)[], t: number): void {
    const { maxMovesPerStep, mismatchCost, moveCost, beamWidth } = this.options;
    const candidates = new Map<string, Hypothesis>();
    const consider = (h: Hypothesis) => {
      let mismatches = 0;
      for (let i = 0; i < 9; i++) if (observed[i] !== null && observed[i] !== h.state[i]) mismatches++;
      const scored = { ...h, cost: h.cost + mismatches * mismatchCost };
      const k = stateKey(h.state);
      const existing = candidates.get(k);
      if (!existing || scored.cost < existing.cost || (scored.cost === existing.cost && scored.moves.length < existing.moves.length)) {
        candidates.set(k, scored);
      }
    };
    for (const h of this.beam) {
      consider(h);
      const expand = (state: StickerState, moves: DecodedMove[], cost: number, depth: number) => {
        if (depth === 0) return;
        const last = moves.at(-1)?.m;
        for (const m of this.moveSet) {
          if (last && moves.length > h.moves.length && sameAxis(last, m)) continue;
          const next = { state: applyMove(state, m), moves: [...moves, { m, t }], cost: cost + moveCost(m) };
          consider(next);
          expand(next.state, next.moves, next.cost, depth - 1);
        }
      };
      expand(h.state, h.moves, h.cost, maxMovesPerStep);
    }
    this.beam = [...candidates.values()].sort((a, b) => a.cost - b.cost || a.moves.length - b.moves.length).slice(0, beamWidth);
  }

  // The final state is known (e.g. solved when the timer stops): the cheapest hypothesis that reaches it
  // with at most `maxExtra` more moves. Those extra moves were never seen and are marked as inferred.
  finish(target: StickerState, t: number, maxExtra = 2): DecodedMove[] | null {
    const goal = stateKey(target);
    let best: Hypothesis | null = null;
    const consider = (h: Hypothesis) => {
      if (stateKey(h.state) === goal && (!best || h.cost < best.cost)) best = h;
    };
    for (const h of this.beam) {
      consider(h);
      const expand = (state: StickerState, moves: DecodedMove[], cost: number, depth: number) => {
        if (depth === 0) return;
        for (const m of this.moveSet) {
          const next = { state: applyMove(state, m), moves: [...moves, { m, t, inferred: true }], cost: cost + this.options.moveCost(m) };
          consider(next);
          expand(next.state, next.moves, next.cost, depth - 1);
        }
      };
      expand(h.state, h.moves, h.cost, maxExtra);
    }
    return best ? (best as Hypothesis).moves : null;
  }

  best(): DecodedMove[] {
    return this.beam[0].moves;
  }

  bestState(): StickerState {
    return this.beam[0].state;
  }

  // Moves every surviving hypothesis agrees on: safe to show as final.
  confirmed(): DecodedMove[] {
    const first = this.beam[0].moves;
    let n = first.length;
    for (const h of this.beam) {
      let k = 0;
      while (k < n && k < h.moves.length && h.moves[k].m === first[k].m) k++;
      n = k;
    }
    return first.slice(0, n);
  }

  // How much better the best hypothesis is than the runner-up (0 = tie).
  margin(): number {
    return this.beam.length > 1 ? this.beam[1].cost - this.beam[0].cost : Infinity;
  }
}
