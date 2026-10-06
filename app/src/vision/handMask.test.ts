import { describe, expect, it } from "vitest";
import { convexHull, coveredCells } from "./handMask";

describe("handMask", () => {
  it("computes the convex hull", () => {
    expect(convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2]]).length).toBe(4);
  });

  it("marks the cells under a hand on the left column of the guide", () => {
    // 1280x720, guide 55% of 720 = 396 px from x=442, y=162; cells of 132 px.
    const hand: [number, number][] = [];
    for (let k = 0; k < 21; k++) hand.push([(440 + (k % 3) * 40) / 1280, (150 + Math.floor(k / 3) * 60) / 720]);
    const covered = coveredCells([hand], 1280, 720, { sizeFrac: 0.55, sampleFrac: 0.4 });
    expect([covered[0], covered[3], covered[6]]).toEqual([true, true, true]);
    expect([covered[2], covered[5], covered[8]]).toEqual([false, false, false]);
  });

  it("covers nothing without hands", () => {
    expect(coveredCells([], 1280, 720, { sizeFrac: 0.55, sampleFrac: 0.4 })).toEqual(Array(9).fill(false));
  });
});
