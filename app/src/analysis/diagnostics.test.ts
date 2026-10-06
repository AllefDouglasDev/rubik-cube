import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { diagnose } from "./diagnostics";
import { analyzeSolve, parseMoves } from "./stages";

const SEGMENTS = [
  "F2 R'",
  "U R U' R'",
  "y U' L' U L y'",
  "U' L U L'",
  "R' U R U' R' U R",
  "R U R' U R U2 R'",
  "R U R' U' R' F R2 U' R' U' R U R' F'",
];
const solution = SEGMENTS.join(" ");
const scramble = new Alg(solution).invert().toString();

const ids = (tips: { id: string; level: string }[]) => tips.map((t) => `${t.id}:${t.level}`);

describe("diagnose", () => {
  it("praises an efficient cross and gives no timing tips without timestamps", () => {
    const tips = diagnose(analyzeSolve(scramble, parseMoves(solution)));
    expect(ids(tips)).toContain("cross-moves:good");
    expect(tips.some((t) => t.id === "lookahead" || t.id === "tps")).toBe(false);
  });

  it("flags a long cross, rotations and a long pair", () => {
    // Padding goes before each stage completes, so it is counted in that stage.
    const wasteful = ["D D' L L' B B' U U' F2 R'", "U U U U U U U U U U U R U' R'", ...SEGMENTS.slice(2)].join(" ");
    const moves = parseMoves(`${wasteful} x x' y y' x x'`);
    const tips = diagnose(analyzeSolve(new Alg(wasteful).invert().toString(), moves));
    expect(ids(tips)).toContain("cross-moves:warn");
    expect(ids(tips)).toContain("pair-moves:warn");
    expect(ids(tips)).toContain("rotations:warn");
  });

  it("detects lookahead pauses, slow recognition and reports TPS with timestamps", () => {
    const moves = parseMoves(solution);
    const analysisUntimed = analyzeSolve(scramble, moves);
    const ollFrom = analysisUntimed.stages.find((s) => s.name === "oll")!.from;
    const f2l2From = analysisUntimed.stages.find((s) => s.name === "f2l2")!.from;
    let t = 0;
    const times = moves.map((_, i) => {
      t += i === f2l2From ? 1800 : i === ollFrom ? 2500 : 150;
      return t;
    });
    const timed = moves.map((mv, i) => ({ ...mv, t: times[i] }));
    const tips = diagnose(analyzeSolve(scramble, timed), times);
    expect(ids(tips)).toContain("lookahead:warn");
    expect(ids(tips)).toContain("oll-recognition:warn");
    expect(ids(tips)).toContain("tps:info");
  });

  it("celebrates skips", () => {
    const f2lOnly = SEGMENTS.slice(0, 5).join(" ");
    const tips = diagnose(analyzeSolve(new Alg(f2lOnly).invert().toString(), parseMoves(f2lOnly)));
    expect(ids(tips)).toEqual(expect.arrayContaining(["oll-skip:good", "pll-skip:good"]));
  });

  it("handles a solver (non-CFOP) solution without failing", async () => {
    const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
    const { loadKPuzzle } = await import("../cube-state/cubeState");
    const s = "R U2 F' L D2 B R' U F2 D' L2 B2";
    const solution = await experimentalSolve3x3x3IgnoringCenters((await loadKPuzzle()).defaultPattern().applyAlg(s));
    const analysis = analyzeSolve(s, parseMoves(solution.toString()));
    expect(analysis.solved).toBe(true);
    expect(() => diagnose(analysis)).not.toThrow();
  });
});
