import { describe, expect, it } from "vitest";
import { rgbToLab } from "./color";
import type { CubeColor } from "./classifier";
import { assignColors, hungarian } from "./assign";

describe("hungarian", () => {
  it("finds the minimum cost matching", () => {
    expect(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]])).toEqual([1, 0, 2]);
  });
});

describe("assignColors", () => {
  const refs: Record<CubeColor, ReturnType<typeof rgbToLab>> = {
    W: rgbToLab([220, 220, 215]),
    Y: rgbToLab([230, 210, 40]),
    R: rgbToLab([170, 30, 40]),
    O: rgbToLab([235, 100, 30]),
    B: rgbToLab([20, 70, 170]),
    G: rgbToLab([20, 150, 80]),
  };

  it("fixes a red read as orange using the 9-per-color constraint", () => {
    const truth: CubeColor[] = (["W", "Y", "R", "O", "B", "G"] as CubeColor[]).flatMap((c) => Array<CubeColor>(9).fill(c));
    const samples = truth.map((c) => ({ lab: refs[c], refs }));
    // One red sticker under a hotspot reads nearer to orange than to red; a 10th orange is not allowed.
    const hot = rgbToLab([222, 88, 38]);
    samples[18] = { lab: hot, refs };
    expect(assignColors(samples)).toEqual(truth);
  });

  it("cannot undo two symmetric errors (left to the piece validation)", () => {
    const truth: CubeColor[] = (["W", "Y", "R", "O", "B", "G"] as CubeColor[]).flatMap((c) => Array<CubeColor>(9).fill(c));
    const samples = truth.map((c) => ({ lab: refs[c], refs }));
    samples[18] = { lab: rgbToLab([222, 88, 38]), refs }; // red that looks orange
    samples[27] = { lab: rgbToLab([185, 55, 38]), refs }; // orange that looks red
    const result = assignColors(samples);
    expect([result[18], result[27]]).toEqual(["O", "R"]);
  });
});
