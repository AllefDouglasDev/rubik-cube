// A scramble that sets up an algorithm's case without revealing the algorithm: random AUFs around the
// case, then the inverse of a solver solution for that pattern.
import { Alg } from "cubing/alg";
import { loadKPuzzle } from "../cube-state/cubeState";

const AUFS = ["", "U", "U2", "U'"];

export async function caseScramble(alg: string, random = Math.random): Promise<string> {
  const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
  const pre = AUFS[Math.floor(random() * 4)];
  const post = AUFS[Math.floor(random() * 4)];
  const kpuzzle = await loadKPuzzle();
  const pattern = kpuzzle.defaultPattern().applyAlg(new Alg(`${pre} ${new Alg(alg).invert()} ${post}`.trim()));
  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern);
  // Inverting turns "R2" into "R2'"; both are the same half turn, and "R2" is how scrambles are written.
  return solution.invert().toString().replace(/2'/g, "2");
}
