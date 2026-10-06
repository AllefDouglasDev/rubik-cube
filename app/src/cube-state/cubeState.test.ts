import { describe, expect, it } from "vitest";
import { CubeState, isValidMove, parseAlg } from "./cubeState";

describe("CubeState", () => {
  it("starts solved", async () => {
    expect((await CubeState.solved()).isSolved()).toBe(true);
  });

  it("is solved after a T-perm applied twice and records the moves", async () => {
    const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const s = (await CubeState.solved()).apply(tperm).apply(tperm);
    expect(s.isSolved()).toBe(true);
    expect(s.moves).toHaveLength(28);
  });

  it("is not solved after a scramble and solved after its inverse", async () => {
    const scrambled = await CubeState.fromScramble("R U F2 D' L B2");
    expect(scrambled.isSolved()).toBe(false);
    expect(scrambled.apply("B2 L' D F2 U' R'").isSolved()).toBe(true);
  });

  it("ignores whole-cube rotations when checking solved", async () => {
    expect((await CubeState.solved()).apply("x y").isSolved()).toBe(true);
  });

  it("is immutable", async () => {
    const a = await CubeState.solved();
    a.apply("R");
    expect(a.isSolved()).toBe(true);
  });
});

describe("notation helpers", () => {
  it("validates notation", () => {
    expect(isValidMove("R'")).toBe(true);
    expect(isValidMove("Rw2")).toBe(true);
    expect(isValidMove("Q")).toBe(true); // syntactically a move; the puzzle rejects it on apply
    expect(isValidMove("R''")).toBe(false);
    expect(parseAlg("R U R' U'")?.toString()).toBe("R U R' U'");
    expect(parseAlg("R (U")).toBeNull();
  });
});
