// Describes the case an algorithm solves: the pattern reached by applying its inverse to a solved cube.
// Used to verify the curriculum algorithms (docs/curriculum/*.json) and, later, to recognise OLL/PLL cases.
import { Alg } from "cubing/alg";
import type { KPattern } from "cubing/kpuzzle";
import { loadKPuzzle } from "../cube-state/cubeState";

// cubing.js 3x3x3 orbits: edges UF UR UB UL DF DR DB DL FR FL BR BL; corners UFR URB UBL ULF DRF DFL DLB DBR.
const U_SLOTS = [0, 1, 2, 3];
const D_EDGES = [4, 5, 6, 7];
const MIDDLE_EDGES = [8, 9, 10, 11];
const D_CORNERS = [4, 5, 6, 7];

export interface CaseProfile {
  centersSolved: boolean;
  firstLayerSolved: boolean; // D edges and D corners in place and oriented
  f2lSolved: boolean; // first layer + middle edges
  flippedEdges: number[]; // U edge slots that are misoriented
  twistedCorners: number; // U corners that are misoriented
  // Pieces of the U layer out of place, after the best U adjustment (AUF).
  edgesOutOfPlace: number;
  cornersOutOfPlace: number;
}

function solvedAt(pattern: KPattern, orbit: "EDGES" | "CORNERS", slots: number[]): boolean {
  const { pieces, orientation } = pattern.patternData[orbit];
  return slots.every((i) => pieces[i] === i && orientation[i] === 0);
}

function outOfPlace(pattern: KPattern, orbit: "EDGES" | "CORNERS"): number {
  const { pieces } = pattern.patternData[orbit];
  return U_SLOTS.filter((i) => pieces[i] !== i).length;
}

export function profilePattern(pattern: KPattern): CaseProfile {
  const centers = pattern.patternData.CENTERS.pieces;
  const firstLayerSolved = solvedAt(pattern, "EDGES", D_EDGES) && solvedAt(pattern, "CORNERS", D_CORNERS);
  let best = { edges: 4, corners: 4 };
  for (const auf of ["", "U", "U2", "U'"]) {
    const p = auf ? pattern.applyAlg(auf) : pattern;
    const candidate = { edges: outOfPlace(p, "EDGES"), corners: outOfPlace(p, "CORNERS") };
    if (candidate.edges + candidate.corners < best.edges + best.corners) best = candidate;
  }
  return {
    centersSolved: centers.every((piece, i) => piece === i),
    firstLayerSolved,
    f2lSolved: firstLayerSolved && solvedAt(pattern, "EDGES", MIDDLE_EDGES),
    flippedEdges: U_SLOTS.filter((i) => pattern.patternData.EDGES.orientation[i] !== 0),
    twistedCorners: U_SLOTS.filter((i) => pattern.patternData.CORNERS.orientation[i] !== 0).length,
    edgesOutOfPlace: best.edges,
    cornersOutOfPlace: best.corners,
  };
}

export async function caseOf(alg: string): Promise<KPattern> {
  return (await loadKPuzzle()).defaultPattern().applyAlg(new Alg(alg).invert());
}

export async function profileAlg(alg: string): Promise<CaseProfile> {
  return profilePattern(await caseOf(alg));
}

// Two flipped U edges are "opposite" (a line) or "adjacent" (an L).
export function flipShape(flipped: number[]): "none" | "line" | "L" | "dot" | "other" {
  if (flipped.length === 0) return "none";
  if (flipped.length === 4) return "dot";
  if (flipped.length === 2) return Math.abs(flipped[0] - flipped[1]) === 2 ? "line" : "L";
  return "other";
}
