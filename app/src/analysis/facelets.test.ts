import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { loadKPuzzle } from "../cube-state/cubeState";
import { FACES, FaceletCube } from "./facelets";

const solved = FaceletCube.solved();
const same = (a: FaceletCube, b: FaceletCube) => FACES.every((f) => a.faceColors(f).join() === b.faceColors(f).join());

describe("FaceletCube", () => {
  it("returns to solved after four quarter turns of every family", () => {
    for (const m of ["U", "D", "R", "L", "F", "B", "r", "Uw", "M", "E", "S", "x", "y", "z"]) {
      expect(solved.apply(`${m} ${m} ${m} ${m}`).isSolved(), m).toBe(true);
      expect(solved.apply(m).apply(`${m}'`).isSolved(), m).toBe(true);
    }
  });

  it("is solved after a whole-cube rotation", () => {
    expect(solved.apply("x y2 z'").isSolved()).toBe(true);
  });

  it("matches the standard slice and wide definitions", () => {
    expect(same(solved.apply("M"), solved.apply("R L' x'"))).toBe(true);
    expect(same(solved.apply("E"), solved.apply("U D' y'"))).toBe(true);
    expect(same(solved.apply("S"), solved.apply("F' B z"))).toBe(true);
    expect(same(solved.apply("r"), solved.apply("L x"))).toBe(true);
  });

  it("agrees with KPuzzle on whether random sequences solve the cube", async () => {
    const kpuzzle = await loadKPuzzle();
    const families = ["U", "D", "R", "L", "F", "B", "M", "r", "x", "y"];
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 60; i++) {
      const moves = Array.from({ length: 6 }, () => families[Math.floor(rand() * families.length)] + ["", "'", "2"][Math.floor(rand() * 3)]);
      const alg = new Alg(moves.join(" "));
      // alg followed by its inverse is always solved; alg alone almost never is.
      const roundTrip = new Alg(`${alg} ${alg.invert()}`);
      expect(solved.apply(roundTrip).isSolved()).toBe(true);
      const kp = kpuzzle.defaultPattern().applyAlg(alg).experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true });
      expect(solved.apply(alg).isSolved(), alg.toString()).toBe(kp);
    }
  });

  it("solves a scramble with the solver's solution", async () => {
    const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
    const kpuzzle = await loadKPuzzle();
    const scramble = "R U2 F' L D2 B R' U F2 D' L2 B2";
    const solution = await experimentalSolve3x3x3IgnoringCenters(kpuzzle.defaultPattern().applyAlg(scramble));
    const cube = solved.apply(scramble);
    expect(cube.isSolved()).toBe(false);
    expect(cube.apply(solution).isSolved()).toBe(true);
  });

  it("tracks the cross, pairs and last layer", () => {
    expect(solved.crossSolved("D")).toBe(true);
    expect(solved.f2lPairs("D")).toBe(4);
    const broken = solved.apply("R U R'"); // pulls the FR pair out
    expect(broken.crossSolved("D")).toBe(true);
    expect(broken.f2lPairs("D")).toBe(3);
    expect(solved.apply("R U R' U R U2 R'").lastLayerOriented("D")).toBe(false); // Sune
    expect(solved.apply("R U R' U' R' F R2 U' R' U' R U R' F'").lastLayerOriented("D")).toBe(true); // T-perm
  });

  it("follows the cross color through rotations", () => {
    const rotated = solved.apply("x2"); // white cross now on D... and yellow on U
    expect(rotated.crossSolved("U")).toBe(true);
    expect(rotated.faceOfColor("U")).toBe("D");
    expect(rotated.apply("F2").crossSolved("U")).toBe(false);
  });
});
