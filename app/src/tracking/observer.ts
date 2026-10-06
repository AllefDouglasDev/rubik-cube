// Turns per-frame sticker readings into stable observations for the decoder. A sticker counts when its
// known readings agree over the last frames; during a turn the face blurs and nothing stable comes out.
import type { Reading } from "../vision/classifier";
import { FACE_INDEX } from "./stickerModel";

// Standard color scheme: the color of each face's center.
const FACE_OF_COLOR = { W: "U", Y: "D", G: "F", B: "B", R: "R", O: "L" } as const;

export type Observation = (number | null)[]; // face index per sticker (camera view), null = unknown

export function toFaceIndex(reading: Reading): number | null {
  return reading === "?" ? null : FACE_INDEX[FACE_OF_COLOR[reading]];
}

export class FaceObserver {
  private frames: Reading[][] = [];
  private last: Observation | null = null;

  constructor(
    private readonly windowSize = 4,
    private readonly minKnown = 5,
  ) {}

  reset(): void {
    this.frames = [];
    this.last = null;
  }

  // Returns a new observation when the face is stable and differs from the previous one.
  push(readings: Reading[]): Observation | null {
    this.frames = [...this.frames, readings].slice(-this.windowSize);
    if (this.frames.length < this.windowSize) return null;
    const observation: Observation = Array.from({ length: 9 }, (_, i) => {
      const known = this.frames.map((f) => f[i]).filter((r) => r !== "?");
      if (known.length < Math.ceil(this.windowSize / 2) || known.some((r) => r !== known[0])) return null;
      return toFaceIndex(known[0]);
    });
    if (observation.filter((v) => v !== null).length < this.minKnown) return null;
    const changed = !this.last || observation.some((v, i) => v !== null && this.last![i] !== null && v !== this.last![i]);
    if (!changed) return null;
    this.last = observation;
    return observation;
  }
}
