// Sticker classification against a per-cube calibration (per guide position), with rejection of unknown
// readings and multi-frame voting. Ported from the S2 spike (spikes/src/s2), where it was measured.
import { type Lab, deltaE2000, deltaE76 } from "./color";

export const COLORS = ["W", "Y", "R", "O", "B", "G"] as const;
export type CubeColor = (typeof COLORS)[number];

export const COLOR_INFO: Record<CubeColor, { name: string; swatch: string; opposite: CubeColor }> = {
  W: { name: "Branco", swatch: "#f4f4f4", opposite: "Y" },
  Y: { name: "Amarelo", swatch: "#ffd500", opposite: "W" },
  R: { name: "Vermelho", swatch: "#c41e3a", opposite: "O" },
  O: { name: "Laranja", swatch: "#ff5800", opposite: "R" },
  B: { name: "Azul", swatch: "#0051ba", opposite: "G" },
  G: { name: "Verde", swatch: "#009e60", opposite: "B" },
};

// ΔE76 with lightness at half weight: a brighter or darker sticker (uneven light) moves mostly in L,
// while red/orange and white/yellow are told apart by a*/b*.
export function deltaE76HalfL(a: Lab, b: Lab): number {
  return Math.hypot((a[0] - b[0]) / 2, a[1] - b[1], a[2] - b[2]);
}

export type Metric = "de2000" | "de76" | "de76L";
export const METRICS: Record<Metric, (a: Lab, b: Lab) => number> = { de2000: deltaE2000, de76: deltaE76, de76L: deltaE76HalfL };

// Mean Lab of each color, captured from the faces of a solved cube.
export type Calibration = Partial<Record<CubeColor, Lab>>;

// Same capture kept per guide position (9 per color): compensates light that is uneven across the guide.
export type CellCalibration = Partial<Record<CubeColor, Lab[]>>;

export interface StoredCalibration {
  global: Calibration;
  cells: CellCalibration;
}

// Reference colors to compare the sticker at `cell` against.
export function referencesFor(stored: StoredCalibration, cell: number, perCell: boolean): Record<CubeColor, Lab> | null {
  if (!isCalibrated(stored.global)) return null;
  if (!perCell) return stored.global;
  const refs = {} as Record<CubeColor, Lab>;
  for (const c of COLORS) refs[c] = stored.cells[c]?.[cell] ?? stored.global[c]!;
  return refs;
}

// Calibrations saved before per-cell support were a plain Calibration.
export function normalizeCalibration(raw: unknown): StoredCalibration {
  const obj = (raw ?? {}) as Partial<StoredCalibration> & Calibration;
  if (obj.global) return { global: obj.global, cells: obj.cells ?? {} };
  return { global: obj as Calibration, cells: {} };
}

// "?" = the reading is not close enough to any calibrated color (background, hand, glare).
export type Reading = CubeColor | "?";

export interface RejectLimits {
  // Above this distance to the nearest calibrated color the sticker is unknown.
  maxDistance: number;
  // Below this confidence (nearest vs second nearest) the sticker is unknown.
  minConfidence: number;
}

// Starting points; S2 records the distance of correct readings so they can be tuned.
export const DEFAULT_LIMITS: Record<Metric, RejectLimits> = {
  de76: { maxDistance: 25, minConfidence: 0.1 },
  de76L: { maxDistance: 25, minConfidence: 0.1 },
  de2000: { maxDistance: 16, minConfidence: 0.1 },
};

export interface StickerGuess {
  color: Reading;
  // Nearest calibrated color, even when the reading was rejected.
  nearest: CubeColor;
  distance: number;
  // (second - best) / (second + best): 0 = ambiguous, 1 = unambiguous.
  confidence: number;
}

export function isCalibrated(cal: Calibration): cal is Record<CubeColor, Lab> {
  return COLORS.every((c) => cal[c] !== undefined);
}

export function classify(lab: Lab, cal: Record<CubeColor, Lab>, metric: Metric, limits?: RejectLimits): StickerGuess {
  const distanceFn = METRICS[metric];
  const ranked = COLORS.map((color) => ({ color, distance: distanceFn(lab, cal[color]) })).sort((a, b) => a.distance - b.distance);
  const [best, second] = ranked;
  const confidence = (second.distance - best.distance) / (second.distance + best.distance || 1);
  const rejected = limits !== undefined && (best.distance > limits.maxDistance || confidence < limits.minConfidence);
  return { color: rejected ? "?" : best.color, nearest: best.color, distance: best.distance, confidence };
}

export function meanLab(samples: Lab[]): Lab {
  const sum = samples.reduce<Lab>((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]], [0, 0, 0]);
  return [sum[0] / samples.length, sum[1] / samples.length, sum[2] / samples.length];
}

// Keeps the last N frame readings of the 9 stickers and accepts the face once every sticker reaches the agreement threshold
// with a known color: a stable "?" (background, hand) never makes a face acceptable.
export class FaceVoter {
  private frames: Reading[][] = [];

  constructor(
    public windowSize = 10,
    public threshold = 0.8,
  ) {}

  push(face: Reading[]): void {
    this.frames.push(face);
    while (this.frames.length > this.windowSize) this.frames.shift();
  }

  reset(): void {
    this.frames = [];
  }

  result(): { colors: Reading[]; agreement: number[]; accepted: boolean } {
    const colors: Reading[] = [];
    const agreement: number[] = [];
    for (let i = 0; i < 9; i++) {
      const counts = new Map<Reading, number>();
      for (const f of this.frames) counts.set(f[i], (counts.get(f[i]) ?? 0) + 1);
      let best: Reading = "?";
      let bestCount = 0;
      counts.forEach((n, c) => {
        if (n > bestCount) {
          best = c;
          bestCount = n;
        }
      });
      colors.push(best);
      agreement.push(this.frames.length ? bestCount / this.frames.length : 0);
    }
    const full = this.frames.length >= this.windowSize;
    const accepted = full && agreement.every((a) => a >= this.threshold) && !colors.includes("?");
    return { colors, agreement, accepted };
  }
}
