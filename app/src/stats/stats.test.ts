import { describe, expect, it } from "vitest";
import { DNF, type TimedResult, averageOf, formatDelta, formatResult, formatTime, meanOf, rollingAverage, sessionStats } from "./stats";

const ok = (s: number): TimedResult => ({ timeMs: s * 1000, penalty: "none" });
const plus2 = (s: number): TimedResult => ({ timeMs: s * 1000, penalty: "+2" });
const dnf = (s = 10): TimedResult => ({ timeMs: s * 1000, penalty: "dnf" });

describe("averageOf", () => {
  it("drops best and worst for ao5", () => {
    expect(averageOf([ok(10), ok(12), ok(11), ok(30), ok(5)], 5)).toBeCloseTo(11000);
  });

  it("uses only the last n results", () => {
    expect(averageOf([ok(99), ok(10), ok(10), ok(10), ok(10), ok(10)], 5)).toBe(10000);
  });

  it("counts a single DNF as the worst and trims it", () => {
    expect(averageOf([ok(10), ok(12), ok(11), dnf(), ok(5)], 5)).toBeCloseTo(11000);
  });

  it("is DNF with two DNFs in ao5", () => {
    expect(averageOf([ok(10), dnf(), ok(11), dnf(), ok(5)], 5)).toBe(DNF);
  });

  it("applies +2 before averaging", () => {
    expect(averageOf([plus2(10), ok(12), ok(11), ok(30), ok(5)], 5)).toBeCloseTo(11667, 0);
  });

  it("trims one from each end in ao12", () => {
    const results = [ok(1), ...Array.from({ length: 10 }, () => ok(10)), ok(100)];
    expect(averageOf(results, 12)).toBe(10000);
  });

  it("returns null with too few results", () => {
    expect(averageOf([ok(1), ok(2)], 5)).toBeNull();
  });
});

describe("meanOf", () => {
  it("is a plain mean for mo3", () => {
    expect(meanOf([ok(9), ok(10), ok(11)], 3)).toBe(10000);
  });

  it("is DNF when any result is DNF", () => {
    expect(meanOf([ok(9), dnf(), ok(11)], 3)).toBe(DNF);
  });
});

describe("sessionStats", () => {
  it("summarizes a session", () => {
    const results = [ok(12), ok(10), dnf(), ok(14), ok(11), ok(9)];
    const s = sessionStats(results);
    expect(s).toMatchObject({ count: 6, dnfCount: 1, best: 9000, worst: 14000, mean: 11200 });
    expect(s.ao5).toBeCloseTo(11667, 0);
    expect(s.bestAo5).toBeCloseTo(11667, 0);
    expect(s.ao12).toBeNull();
    expect(s.stdDev).toBeCloseTo(1923.5, 0);
  });

  it("handles an empty session", () => {
    expect(sessionStats([])).toMatchObject({ count: 0, best: null, mean: null, ao5: null });
  });
});

describe("rollingAverage", () => {
  it("is null until enough results exist", () => {
    expect(rollingAverage([ok(1), ok(2), ok(3)], 3).map((v) => v && Math.round(v))).toEqual([null, null, 2000]);
  });
});

describe("formatting", () => {
  it("formats times", () => {
    expect(formatTime(9876)).toBe("9.87");
    expect(formatTime(62345)).toBe("1:02.34");
    expect(formatTime(120_000, 0)).toBe("2:00");
    expect(formatTime(30_000, 0)).toBe("30");
    expect(formatTime(DNF)).toBe("DNF");
    expect(formatTime(null)).toBe("-");
  });

  it("formats results with penalties", () => {
    expect(formatResult(plus2(10))).toBe("12.00+");
    expect(formatResult(dnf(10))).toBe("DNF(10.00)");
  });

  it("formats deltas", () => {
    expect(formatDelta(11230, 10000)).toBe("+1.23");
    expect(formatDelta(9550, 10000)).toBe("-0.45");
    expect(formatDelta(DNF, 10000)).toBeNull();
  });
});
