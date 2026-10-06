import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { FaceletCube } from "./facelets";
import { type TimedMove, analyzeSolve, parseMoves } from "./stages";

// A synthetic CFOP solve built backwards: scramble = inverse of the solution, so every segment
// restores exactly its stage. Each F2L segment pulls a pair out and puts it back from another angle.
const SEGMENTS = {
  cross: "F2 R'",
  f2l1: "U R U' R'",
  f2l2: "y U' L' U L y'",
  f2l3: "U' L U L'",
  f2l4: "R' U R U' R' U R",
  oll: "R U R' U R U2 R'",
  pll: "R U R' U' R' F R2 U' R' U' R U R' F'",
};
const solution = Object.values(SEGMENTS).join(" ");

describe("analyzeSolve", () => {
  it("builds a scramble whose solution passes through each stage in order", () => {
    // Guard for the fixture itself: each prefix must leave exactly the expected stages solved.
    const scramble = new Alg(solution).invert().toString();
    let cube = FaceletCube.solved().apply(scramble);
    expect(cube.crossSolved("D")).toBe(false);
    cube = cube.apply(SEGMENTS.cross);
    expect(cube.crossSolved("D")).toBe(true);
  });

  it("finds the stage boundaries of a CFOP solve", () => {
    const scramble = new Alg(solution).invert().toString();
    const analysis = analyzeSolve(scramble, parseMoves(solution));
    expect(analysis.solved).toBe(true);
    expect(analysis.crossColor).toBe("D");
    expect(analysis.stages.map((s) => s.name)).toEqual(["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"]);
    const counts = analysis.stages.map((s) => s.moveCount);
    // The fixture leaves one slot solved after the cross, so the first pair is free (0 moves).
    expect(counts).toEqual([2, 0, 8, 4, 7, 7, 14]);
    expect(analysis.stages[1].skipped).toBe(true);
    // The y' after the pair is inserted already belongs to the next stage.
    expect(analysis.stages.map((s) => s.rotations)).toEqual([0, 0, 1, 1, 0, 0, 0]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(analysis.moveCount);
    expect(analysis.rotations).toBe(2);
    expect(analysis.stages.find((s) => s.name === "oll")!.caseId).toBe("OLL 27 (Sune)");
    expect(analysis.stages.find((s) => s.name === "pll")!.caseId).toBe("T");
  });

  it("detects OLL and PLL skips", () => {
    // Ends with F2L: the last layer is already oriented and permuted.
    const f2lOnly = [SEGMENTS.cross, SEGMENTS.f2l1, SEGMENTS.f2l2, SEGMENTS.f2l3, SEGMENTS.f2l4].join(" ");
    const analysis = analyzeSolve(new Alg(f2lOnly).invert().toString(), parseMoves(f2lOnly));
    expect(analysis.solved).toBe(true);
    const byName = Object.fromEntries(analysis.stages.map((s) => [s.name, s]));
    expect(byName.oll.skipped).toBe(true);
    expect(byName.pll.skipped).toBe(true);
  });

  it("is color neutral and survives rotations", () => {
    // Same solve held upside down (x2): the cross is now built with the U color.
    const scramble = new Alg(`x2 ${new Alg(solution).invert()} x2`).toString();
    const analysis = analyzeSolve(scramble, parseMoves(`x2 ${solution} x2`));
    expect(analysis.solved).toBe(true);
    expect(analysis.crossColor).toBe("U");
    expect(analysis.stages.at(-1)?.name).toBe("pll");
  });

  it("measures recognition and execution when moves are timed", () => {
    const moves: TimedMove[] = parseMoves(solution).map((mv, i) => ({ ...mv, t: 1000 + i * 200 }));
    // A 1.5 s pause before the first move of the OLL.
    const ollStart = analyzeSolve(new Alg(solution).invert().toString(), moves).stages.find((s) => s.name === "oll")!.from;
    for (let i = ollStart; i < moves.length; i++) moves[i].t! += 1500;
    const analysis = analyzeSolve(new Alg(solution).invert().toString(), moves);
    const oll = analysis.stages.find((s) => s.name === "oll")!;
    expect(analysis.timed).toBe(true);
    expect(oll.recognitionMs).toBe(1700);
    expect(oll.executionMs).toBe(6 * 200);
    expect(analysis.stages[0].startMs).toBe(0);
  });

  it("reports partial progress for an unfinished solve", () => {
    const scramble = new Alg(solution).invert().toString();
    const partial = parseMoves(`${SEGMENTS.cross} ${SEGMENTS.f2l1}`);
    const analysis = analyzeSolve(scramble, partial);
    expect(analysis.solved).toBe(false);
    expect(analysis.stages.map((s) => s.name)).toEqual(["cross", "f2l1"]);
  });
});
