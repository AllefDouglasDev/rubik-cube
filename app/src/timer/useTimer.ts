// Binds the timer state machine to the keyboard (and pointer), drives the display clock and inspection beeps.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { type SolveResult, type TimerConfig, type TimerEvent, type TimerState, initialTimerState, timerReducer } from "./timerMachine";

interface Options {
  config: TimerConfig;
  // Only listens to the keyboard while enabled (e.g. the timer tab is visible).
  enabled: boolean;
  onComplete: (result: SolveResult) => void;
  // Esc right after stopping: the caller removes the solve it just saved.
  onDiscard: () => void;
  // Any key stops a running solve (stackmat style). When false, only space stops it.
  stopOnAnyKey?: boolean;
}

const INSPECTION_BEEPS_MS = [8_000, 12_000];

// Fields where the keyboard is for typing. Focused buttons and checkboxes still belong to the timer
// (space is preventDefault-ed on both keydown and keyup, so it never clicks them).
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(target.type);
}

let audio: AudioContext | undefined;
function beep(): void {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.12);
  } catch {
    // Audio is a nicety.
  }
}

export function useTimer({ config, enabled, onComplete, onDiscard, stopOnAnyKey = true }: Options) {
  const configRef = useRef(config);
  configRef.current = config;
  const [state, dispatch] = useReducer((s: TimerState, e: TimerEvent) => timerReducer(s, e, configRef.current), initialTimerState);
  const [now, setNow] = useState(() => performance.now());
  const callbacks = useRef({ onComplete, onDiscard });
  callbacks.current = { onComplete, onDiscard };

  // Side effects of transitions.
  const handled = useRef<TimerState>(state);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.phase === "stopped") callbacks.current.onComplete(state.result);
    if (state.phase === "cancelled" && state.from === "stopped") callbacks.current.onDiscard();
  }, [state]);

  const press = useCallback((type: "spaceDown" | "spaceUp") => dispatch({ type, t: performance.now() }), []);
  const cancel = useCallback(() => dispatch({ type: "cancel" }), []);

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        dispatch({ type: "spaceDown", t: performance.now() });
      } else if (e.code === "Escape") {
        dispatch({ type: "cancel" });
      } else if (stopOnAnyKey && !e.metaKey && !e.ctrlKey) {
        dispatch({ type: "keyDown", t: performance.now() });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.code !== "Space") return;
      e.preventDefault();
      dispatch({ type: "spaceUp", t: performance.now() });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled, stopOnAnyKey]);

  // Clock for the display, the armed → ready promotion and the inspection beeps.
  const live = state.phase === "inspecting" || state.phase === "armed" || state.phase === "ready" || state.phase === "running";
  const beeped = useRef(new Set<number>());
  useEffect(() => {
    if (!live) return;
    let frame = requestAnimationFrame(function loop(t) {
      setNow(t);
      dispatch({ type: "tick", t });
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [live]);

  const inspectionStart = "inspectionStart" in state ? state.inspectionStart : undefined;
  useEffect(() => {
    beeped.current.clear();
  }, [inspectionStart]);
  useEffect(() => {
    if (inspectionStart === undefined || state.phase === "running") return;
    for (const mark of INSPECTION_BEEPS_MS) {
      if (now - inspectionStart >= mark && !beeped.current.has(mark)) {
        beeped.current.add(mark);
        beep();
      }
    }
  }, [now, inspectionStart, state.phase]);

  return {
    state,
    press,
    cancel,
    elapsedMs: state.phase === "running" ? now - state.startedAt : state.phase === "stopped" ? state.result.timeMs : 0,
    inspectionElapsedMs: inspectionStart !== undefined ? Math.max(0, now - inspectionStart) : undefined,
  };
}
