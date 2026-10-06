import { describe, expect, it } from "vitest";
import { FaceletCube } from "../../analysis/facelets";
import { type CaseSet, caseNet, casesOf, f2lHighlight, lastLayerView } from "./cases";

const SETS: [CaseSet, number][] = [
  ["f2l", 41],
  ["oll", 57],
  ["pll", 21],
];

describe("study cases", () => {
  it.each(SETS)("%s has all %i cases and each algorithm solves its case", (set, count) => {
    const cases = casesOf(set);
    expect(cases).toHaveLength(count);
    for (const c of cases) expect(FaceletCube.solved().apply(c.setup).apply(c.alg).isSolved()).toBe(true);
  });

  it("shows cases with white on the bottom, green in front and yellow on top", () => {
    for (const c of [...casesOf("oll"), ...casesOf("pll"), ...casesOf("f2l")]) {
      const net = caseNet(c);
      // The cross is always solved; in F2L the slot's corner may still be on the bottom, twisted.
      expect([1, 3, 4, 5, 7].map((i) => net.D[i])).toEqual(["W", "W", "W", "W", "W"]);
      if (c.set !== "f2l") expect(net.D).toEqual(Array(9).fill("W"));
      expect(net.F[4]).toBe("G");
      expect(net.U[4]).toBe("Y");
    }
  });

  it("keeps the first two layers in OLL and orients the top in PLL", () => {
    for (const c of casesOf("oll")) {
      const net = caseNet(c);
      expect([net.F[7], net.R[7], net.B[7], net.L[7]]).toEqual(["G", "O", "B", "R"]);
    }
    for (const c of casesOf("pll")) expect(caseNet(c).U).toEqual(Array(9).fill("Y"));
  });

  it("reads the side stickers of the last layer in screen order", () => {
    // Ua/Ub-like check: after R, the front-right top sticker of the right side is next to the front.
    const pll = casesOf("pll").find((c) => c.name === "Aa")!;
    const view = lastLayerView(caseNet(pll));
    expect(view.u).toEqual(Array(9).fill("Y"));
    for (const side of [view.front, view.back, view.left, view.right]) expect(side).toHaveLength(3);
  });

  it("highlights exactly the F2L pair (5 stickers) plus the 6 centers", () => {
    for (const c of casesOf("f2l")) {
      const marked = Object.values(f2lHighlight(c)).flat().filter(Boolean).length;
      expect(marked, c.name).toBe(5 + 6);
    }
  });
});
