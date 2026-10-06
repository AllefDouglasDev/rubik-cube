// The color calibration is shared by the camera scan and the tracking pages (per browser).
import { type StoredCalibration, normalizeCalibration } from "./classifier";

const KEY = "cubo-trainer.calibration";

export function loadCalibration(): StoredCalibration {
  try {
    return normalizeCalibration(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { global: {}, cells: {} };
  }
}

export function saveCalibration(calibration: StoredCalibration): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(calibration));
  } catch {
    // Calibration just won't persist.
  }
}
