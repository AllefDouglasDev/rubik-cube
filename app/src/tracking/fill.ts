// Fills the gap between a decoded state and a known final state with a solver solution (inferred moves),
// for when more than a couple of moves were missed.
import { Alg } from "cubing/alg";
import type { Face } from "../analysis/facelets";
import type { CubeColor } from "../vision/classifier";
import { type CubeNet, SCAN_ORDER, netToPattern } from "../vision/cubeNet";
import type { DecodedMove } from "./decoder";
import { SLOT_FACES, type StickerState } from "./stickerModel";

const COLOR_OF: Record<Face, CubeColor> = { U: "W", D: "Y", F: "G", B: "B", R: "R", L: "O" };

export function netOfState(state: StickerState): CubeNet {
  const net = {} as CubeNet;
  SCAN_ORDER.forEach(({ face }, f) => {
    net[face] = Array.from(state.subarray(f * 9, f * 9 + 9), (i) => COLOR_OF[SLOT_FACES[i]]);
  });
  return net;
}

// Moves from `state` to solved, or null when the state cannot be solved as is (e.g. centers moved).
export async function solveGap(state: StickerState, t: number): Promise<DecodedMove[] | null> {
  try {
    const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
    const solution = await experimentalSolve3x3x3IgnoringCenters(await netToPattern(netOfState(state)));
    return [...new Alg(solution).experimentalLeafMoves()].map((m) => ({ m: m.toString(), t, inferred: true }));
  } catch {
    return null;
  }
}
