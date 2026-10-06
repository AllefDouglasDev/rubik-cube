import { describe, expect, it } from "vitest";
import { type Lab, deltaE2000, deltaE76, medianRgb, rgbToLab } from "./color";

// Reference pairs from Sharma, Wu & Dalal, "The CIEDE2000 Color-Difference Formula" (2005), table 1.
const SHARMA: [Lab, Lab, number][] = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

describe("deltaE2000", () => {
  it.each(SHARMA)("matches Sharma reference %#", (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
    expect(deltaE2000(b, a)).toBeCloseTo(expected, 4);
  });

  it("is zero for identical colors", () => {
    expect(deltaE2000([40, 20, -10], [40, 20, -10])).toBe(0);
  });
});

describe("rgbToLab", () => {
  it("maps white and black to the L extremes", () => {
    const white = rgbToLab([255, 255, 255]);
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1])).toBeLessThan(0.01);
    expect(Math.abs(white[2])).toBeLessThan(0.01);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 5);
  });

  it("matches the reference value for pure sRGB red", () => {
    const [L, a, b] = rgbToLab([255, 0, 0]);
    expect(L).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });
});

describe("deltaE76", () => {
  it("is the euclidean distance in Lab", () => {
    expect(deltaE76([0, 0, 0], [3, 4, 0])).toBe(5);
  });
});

describe("medianRgb", () => {
  it("ignores outlier pixels such as a specular highlight", () => {
    const pixels = [
      [200, 10, 10],
      [202, 12, 11],
      [255, 255, 255],
      [198, 9, 12],
      [201, 11, 10],
    ];
    const data = new Uint8ClampedArray(pixels.flatMap((p) => [...p, 255]));
    expect(medianRgb(data, 5, 0, 0, 5, 1)).toEqual([201, 11, 11]);
  });
});
