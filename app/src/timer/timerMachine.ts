// Stackmat-style keyboard timer as a pure state machine (no DOM, no clock): every event carries its timestamp.
//
// idle ─space↓─▶ inspecting (if enabled) ─space↓─▶ armed ─held ≥ holdMs─▶ ready ─space↑─▶ running ─any key↓─▶ stopped
// Esc cancels from any phase; in `stopped` the caller discards the solve that was just saved.
import type { Penalty } from "../stats/stats";

export const INSPECTION_MS = 15_000;
export const INSPECTION_DNF_MS = 17_000;

export interface TimerConfig {
  inspection: boolean;
  holdMs: number;
}

export interface SolveResult {
  timeMs: number;
  inspectionMs?: number;
  penalty: Penalty;
}

export type TimerState =
  | { phase: "idle" }
  | { phase: "inspecting"; inspectionStart: number }
  | { phase: "armed"; holdStart: number; inspectionStart?: number }
  | { phase: "ready"; inspectionStart?: number }
  | { phase: "running"; startedAt: number; inspectionMs?: number; penalty: Penalty }
  | { phase: "stopped"; result: SolveResult }
  | { phase: "cancelled"; from: TimerState["phase"] };

export type TimerEvent =
  | { type: "spaceDown"; t: number }
  | { type: "spaceUp"; t: number }
  | { type: "keyDown"; t: number }
  | { type: "tick"; t: number }
  | { type: "cancel" };

export const initialTimerState: TimerState = { phase: "idle" };

export function inspectionPenalty(inspectionMs: number | undefined): Penalty {
  if (inspectionMs === undefined || inspectionMs <= INSPECTION_MS) return "none";
  return inspectionMs <= INSPECTION_DNF_MS ? "+2" : "dnf";
}

export function timerReducer(state: TimerState, event: TimerEvent, config: TimerConfig): TimerState {
  if (event.type === "cancel") {
    return state.phase === "idle" || state.phase === "cancelled" ? state : { phase: "cancelled", from: state.phase };
  }

  switch (state.phase) {
    case "idle":
    case "stopped":
    case "cancelled":
      if (event.type !== "spaceDown") return state;
      return config.inspection ? { phase: "inspecting", inspectionStart: event.t } : { phase: "armed", holdStart: event.t };

    case "inspecting":
      if (event.type !== "spaceDown") return state;
      return { phase: "armed", holdStart: event.t, inspectionStart: state.inspectionStart };

    case "armed":
      if (event.type === "spaceUp") {
        // Released too early: back to where the user was.
        return state.inspectionStart === undefined ? { phase: "idle" } : { phase: "inspecting", inspectionStart: state.inspectionStart };
      }
      if ((event.type === "tick" || event.type === "spaceDown") && event.t - state.holdStart >= config.holdMs) {
        return { phase: "ready", inspectionStart: state.inspectionStart };
      }
      return state;

    case "ready": {
      if (event.type !== "spaceUp") return state;
      const inspectionMs = state.inspectionStart === undefined ? undefined : event.t - state.inspectionStart;
      return { phase: "running", startedAt: event.t, inspectionMs, penalty: inspectionPenalty(inspectionMs) };
    }

    case "running":
      if (event.type !== "spaceDown" && event.type !== "keyDown") return state;
      return {
        phase: "stopped",
        result: { timeMs: event.t - state.startedAt, inspectionMs: state.inspectionMs, penalty: state.penalty },
      };
  }
}
