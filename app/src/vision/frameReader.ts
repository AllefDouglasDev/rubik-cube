// Reads the 9 stickers of the face in front of the camera, either inside the fixed guide or wherever the
// face locator (OpenCV, F3.1) finds it, and draws the matching overlay on the mirrored preview.
import { COLOR_INFO, type Reading } from "./classifier";
import type { Lab } from "./color";
import { FaceTracker } from "./faceTracker";
import { coveredAt } from "./handMask";
import { type Guide, GuideSampler, PointSampler, guideRect } from "./sampler";

type Pt = [number, number];

export interface FrameReading {
  labs: Lab[] | null; // null when auto mode has not found the face
  centers: Pt[]; // pixels, camera view
  corners: Pt[]; // pixels, camera view
  cell: number; // pixels
  auto: boolean;
}

export class FrameReader {
  private readonly guideSampler = new GuideSampler();
  private readonly pointSampler = new PointSampler();
  private tracker: FaceTracker | null = null;
  error: string | null = null;

  get auto(): boolean {
    return this.tracker !== null;
  }

  setAuto(on: boolean): void {
    if (on && !this.tracker) {
      this.tracker = new FaceTracker();
      this.tracker.ready.catch((e) => (this.error = `Localizador indisponível: ${e.message}`));
    } else if (!on && this.tracker) {
      this.tracker.terminate();
      this.tracker = null;
    }
  }

  read(video: HTMLVideoElement, now: number, guide: Guide): FrameReading {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!this.tracker) {
      const g = guideRect(w, h, guide);
      const cell = g.size / 3;
      return {
        labs: this.guideSampler.read(video, guide),
        centers: Array.from({ length: 9 }, (_, i) => [g.x + (i % 3) * cell + cell / 2, g.y + Math.floor(i / 3) * cell + cell / 2]),
        corners: [
          [g.x, g.y],
          [g.x + g.size, g.y],
          [g.x + g.size, g.y + g.size],
          [g.x, g.y + g.size],
        ],
        cell,
        auto: false,
      };
    }
    void this.tracker.track(video, now);
    const face = this.tracker.current(now);
    if (!face) return { labs: null, centers: [], corners: [], cell: 0, auto: true };
    return {
      labs: this.pointSampler.read(video, face.centers, face.cellSize, guide.sampleFrac),
      centers: face.centers.map(([x, y]) => [x * w, y * h]),
      corners: face.corners.map(([x, y]) => [x * w, y * h]),
      cell: face.cellSize * w,
      auto: true,
    };
  }

  dispose(): void {
    this.setAuto(false);
  }
}

export function handCovered(reading: FrameReading, hands: Pt[][], video: HTMLVideoElement, sampleFrac: number): boolean[] {
  if (!reading.labs || !hands.length) return Array(9).fill(false);
  return coveredAt(hands, reading.centers, reading.cell, reading.cell * sampleFrac, video.videoWidth, video.videoHeight);
}

// Overlay on a canvas laid over the mirrored preview: x is flipped so marks land where the user sees them.
export function drawReading(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  reading: FrameReading,
  colors: Reading[] | null,
  options: { accepted?: boolean; covered?: boolean[] } = {},
): void {
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const flip = ([x, y]: Pt): Pt => [canvas.width - x, y];
  if (reading.corners.length === 4) {
    ctx.beginPath();
    reading.corners.map(flip).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.strokeStyle = options.accepted ? "#1f8a4c" : "rgba(255,255,255,0.9)";
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  reading.centers.map(flip).forEach(([x, y], i) => {
    const c = colors?.[i];
    ctx.beginPath();
    ctx.arc(x, y, Math.max(6, reading.cell * 0.13), 0, Math.PI * 2);
    ctx.fillStyle = !c || c === "?" ? "rgba(128,128,128,0.8)" : COLOR_INFO[c].swatch;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = options.covered?.[i] ? "#ffb400" : "#000";
    ctx.stroke();
  });
  if (reading.auto && !reading.labs) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "28px system-ui";
    ctx.fillText("Procurando a face…", 24, 44);
  }
}
