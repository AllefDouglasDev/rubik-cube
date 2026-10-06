import { describe, expect, it } from "vitest";
import { type TimerConfig, type TimerEvent, type TimerState, initialTimerState, timerReducer } from "./timerMachine";

const NO_INSPECTION: TimerConfig = { inspection: false, holdMs: 300 };
const WITH_INSPECTION: TimerConfig = { inspection: true, holdMs: 300 };

function run(events: TimerEvent[], config: TimerConfig, from: TimerState = initialTimerState): TimerState {
  return events.reduce((s, e) => timerReducer(s, e, config), from);
}

describe("timerReducer without inspection", () => {
  it("runs a full solve", () => {
    const s = run(
      [
        { type: "spaceDown", t: 0 },
        { type: "tick", t: 350 },
        { type: "spaceUp", t: 400 },
        { type: "keyDown", t: 12_400 },
      ],
      NO_INSPECTION,
    );
    expect(s).toEqual({ phase: "stopped", result: { timeMs: 12_000, inspectionMs: undefined, penalty: "none" } });
  });

  it("does not start when space is released before the hold time", () => {
    const s = run(
      [
        { type: "spaceDown", t: 0 },
        { type: "tick", t: 100 },
        { type: "spaceUp", t: 150 },
      ],
      NO_INSPECTION,
    );
    expect(s).toEqual({ phase: "idle" });
  });

  it("ignores the space release that follows the stop", () => {
    const stopped = run(
      [
        { type: "spaceDown", t: 0 },
        { type: "tick", t: 300 },
        { type: "spaceUp", t: 300 },
        { type: "spaceDown", t: 5_000 },
      ],
      NO_INSPECTION,
    );
    expect(stopped.phase).toBe("stopped");
    expect(timerReducer(stopped, { type: "spaceUp", t: 5_100 }, NO_INSPECTION)).toBe(stopped);
  });

  it("starts a new attempt from stopped", () => {
    const stopped: TimerState = { phase: "stopped", result: { timeMs: 1, penalty: "none" } };
    expect(timerReducer(stopped, { type: "spaceDown", t: 0 }, NO_INSPECTION)).toEqual({ phase: "armed", holdStart: 0 });
  });
});

describe("timerReducer with inspection", () => {
  const solveWithInspection = (startAt: number) =>
    run(
      [
        { type: "spaceDown", t: 0 },
        { type: "spaceUp", t: 50 },
        { type: "spaceDown", t: startAt - 400 },
        { type: "tick", t: startAt - 50 },
        { type: "spaceUp", t: startAt },
        { type: "keyDown", t: startAt + 10_000 },
      ],
      WITH_INSPECTION,
    );

  it("has no penalty within 15 s", () => {
    expect(solveWithInspection(14_000)).toMatchObject({ result: { penalty: "none", inspectionMs: 14_000, timeMs: 10_000 } });
  });

  it("adds +2 between 15 and 17 s", () => {
    expect(solveWithInspection(16_000)).toMatchObject({ result: { penalty: "+2" } });
  });

  it("is DNF after 17 s", () => {
    expect(solveWithInspection(17_500)).toMatchObject({ result: { penalty: "dnf" } });
  });

  it("returns to inspection when released early", () => {
    const s = run(
      [
        { type: "spaceDown", t: 0 },
        { type: "spaceUp", t: 50 },
        { type: "spaceDown", t: 3_000 },
        { type: "spaceUp", t: 3_100 },
      ],
      WITH_INSPECTION,
    );
    expect(s).toEqual({ phase: "inspecting", inspectionStart: 0 });
  });
});

describe("cancel", () => {
  it("cancels a running solve without a result", () => {
    const running: TimerState = { phase: "running", startedAt: 0, penalty: "none" };
    expect(timerReducer(running, { type: "cancel" }, NO_INSPECTION)).toEqual({ phase: "cancelled", from: "running" });
  });

  it("marks a stopped solve as cancelled so the caller discards it", () => {
    const stopped: TimerState = { phase: "stopped", result: { timeMs: 1, penalty: "none" } };
    expect(timerReducer(stopped, { type: "cancel" }, NO_INSPECTION)).toEqual({ phase: "cancelled", from: "stopped" });
  });

  it("is a no-op when idle", () => {
    expect(timerReducer(initialTimerState, { type: "cancel" }, NO_INSPECTION)).toBe(initialTimerState);
  });
});
