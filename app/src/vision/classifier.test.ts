import { describe, expect, it } from "vitest";
import { type CubeColor, FaceVoter, type Reading, classify } from "./classifier";
import { rgbToLab } from "./color";

const CAL = {
  W: rgbToLab([220, 220, 215]),
  Y: rgbToLab([230, 210, 40]),
  R: rgbToLab([170, 30, 40]),
  O: rgbToLab([235, 100, 30]),
  B: rgbToLab([20, 70, 170]),
  G: rgbToLab([20, 150, 80]),
};

describe("classify", () => {
  it("picks the nearest calibrated color", () => {
    expect(classify(rgbToLab([180, 35, 45]), CAL, "de2000").color).toBe("R");
    expect(classify(rgbToLab([225, 110, 35]), CAL, "de2000").color).toBe("O");
  });

  it("reports low confidence halfway between red and orange", () => {
    const sharp = classify(CAL.R, CAL, "de2000");
    const midway = classify(rgbToLab([202, 65, 35]), CAL, "de2000");
    expect(sharp.confidence).toBeCloseTo(1, 5);
    expect(midway.confidence).toBeLessThan(0.3);
  });
});

describe("classify with reject limits", () => {
  it("marks a reading far from every calibrated color as unknown", () => {
    const skin = rgbToLab([224, 172, 140]);
    const g = classify(skin, CAL, "de76", { maxDistance: 20, minConfidence: 0.1 });
    expect(g.color).toBe("?");
    expect(g.nearest).toBeDefined();
  });

  it("keeps readings close to a calibrated color", () => {
    expect(classify(rgbToLab([24, 152, 82]), CAL, "de76", { maxDistance: 20, minConfidence: 0.1 }).color).toBe("G");
  });

  it("marks an ambiguous reading as unknown", () => {
    expect(classify(rgbToLab([202, 65, 35]), CAL, "de76", { maxDistance: 100, minConfidence: 0.3 }).color).toBe("?");
  });
});

describe("FaceVoter", () => {
  const face = (c: CubeColor) => Array<CubeColor>(9).fill(c);

  it("only accepts after the window is full and agreement reaches the threshold", () => {
    const voter = new FaceVoter(5, 0.8);
    for (let i = 0; i < 4; i++) voter.push(face("G"));
    expect(voter.result().accepted).toBe(false);
    voter.push(face("G"));
    expect(voter.result()).toMatchObject({ accepted: true, colors: face("G") });
  });

  it("never accepts a face whose stable reading is unknown", () => {
    const voter = new FaceVoter(5, 0.8);
    for (let i = 0; i < 5; i++) {
      const f: Reading[] = face("G");
      f[0] = "?";
      voter.push(f);
    }
    expect(voter.result()).toMatchObject({ accepted: false });
  });

  it("rejects when one sticker flickers too often", () => {
    const voter = new FaceVoter(5, 0.8);
    for (let i = 0; i < 5; i++) {
      const f = face("R");
      if (i % 2 === 0) f[4] = "O";
      voter.push(f);
    }
    const r = voter.result();
    expect(r.accepted).toBe(false);
    expect(r.agreement[4]).toBeCloseTo(0.6);
  });
});

describe("per-position calibration", () => {
  it("tells red from a brightly lit red that a global reference would call orange", async () => {
    const { referencesFor } = await import("./classifier");
    const brightRed = rgbToLab([215, 70, 45]); // red sticker under a hotspot
    const global = { ...CAL };
    const cells = Object.fromEntries(Object.entries(CAL).map(([c, lab]) => [c, Array(9).fill(lab)]));
    cells.R[0] = rgbToLab([212, 68, 46]); // calibrated red at that hotspot
    cells.O[0] = rgbToLab([250, 130, 40]);
    const stored = { global, cells };
    expect(classify(brightRed, referencesFor(stored, 0, false)!, "de76").color).toBe("O");
    expect(classify(brightRed, referencesFor(stored, 0, true)!, "de76").color).toBe("R");
  });

  it("reads calibrations saved before per-position support", async () => {
    const { normalizeCalibration } = await import("./classifier");
    expect(normalizeCalibration({ W: [1, 2, 3] })).toEqual({ global: { W: [1, 2, 3] }, cells: {} });
  });
});
