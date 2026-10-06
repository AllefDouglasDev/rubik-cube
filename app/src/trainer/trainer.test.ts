import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { loadKPuzzle } from "../cube-state/cubeState";
import { caseScramble } from "./caseScramble";
import { emptyStat, pickNext, recordAttempt } from "./scheduler";

describe("scheduler", () => {
  it("promotes fast clean executions and demotes mistakes", () => {
    let s = emptyStat("k");
    s = recordAttempt(s, { ok: true, ms: 1500 }, 2000);
    expect(s.box).toBe(2);
    s = recordAttempt(s, { ok: true, ms: 2500 }, 2000);
    expect(s.box).toBe(2); // clean but slow: stays
    s = recordAttempt(s, { ok: false }, 2000);
    expect(s).toMatchObject({ box: 1, reps: 3, fails: 1, bestMs: 1500, recentMs: [1500, 2500] });
  });

  it("draws weak cases more often and avoids immediate repeats", () => {
    const stats = new Map([["known", { ...emptyStat("known"), box: 5 }]]);
    const counts = { weak: 0, known: 0 };
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) counts[pickNext(["weak", "known"], stats, null, random) as "weak" | "known"]++;
    expect(counts.weak).toBeGreaterThan(counts.known * 10);
    expect(pickNext(["a", "b"], new Map(), "a")).toBe("b");
  });
});

describe("caseScramble", () => {
  it("sets up a case that the algorithm then solves (up to AUF)", async () => {
    const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const kpuzzle = await loadKPuzzle();
    const scramble = await caseScramble(tperm, () => 0.6);
    expect(scramble).not.toContain(tperm);
    expect(scramble).not.toMatch(/2'/);
    const solvedAfter = ["", "U", "U2", "U'"].some((pre) =>
      ["", "U", "U2", "U'"].some((post) =>
        kpuzzle
          .defaultPattern()
          .applyAlg(new Alg(`${scramble} ${pre} ${tperm} ${post}`))
          .experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true }),
      ),
    );
    expect(solvedAfter).toBe(true);
  });
});
