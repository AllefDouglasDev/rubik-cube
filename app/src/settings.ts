// Per-device preferences in localStorage. Every access is guarded: storage may be unavailable.
import { useCallback, useState } from "react";

export interface Settings {
  inspection: boolean;
  holdMs: number;
  sessionId?: string;
}

const KEY = "cubo-trainer.settings";
const DEFAULTS: Settings = { inspection: true, holdMs: 300 };

function read(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(read);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Preferences just won't persist.
      }
      return next;
    });
  }, []);
  return [settings, update];
}
