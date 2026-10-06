import { describe, expect, it } from "vitest";
import { solveGap } from "./fill";
import { applyMove, solvedState } from "./stickerModel";

describe("solveGap", () => {
  it("returns inferred moves that solve the state", async () => {
    let s = solvedState();
    for (const m of "R U F' L2 B D'".split(" ")) s = applyMove(s, m);
    const gap = (await solveGap(s, 5))!;
    let after = s;
    for (const { m } of gap) after = applyMove(after, m);
    expect(after.join()).toBe(solvedState().join());
    expect(gap.every((m) => m.inferred && m.t === 5)).toBe(true);
  });
});
