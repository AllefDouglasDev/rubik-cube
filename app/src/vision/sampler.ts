// Reads the 9 stickers inside the square guide of a video frame, in camera view (not mirrored), row by row.
import { type Lab, medianRgb, rgbToLab } from "./color";

const SIZE = 180;

export interface Guide {
  // Fraction of the smaller video side covered by the guide square, and of each cell that is sampled.
  sizeFrac: number;
  sampleFrac: number;
}

export const DEFAULT_GUIDE: Guide = { sizeFrac: 0.55, sampleFrac: 0.4 };

export function guideRect(width: number, height: number, guide: Guide) {
  const size = Math.round(Math.min(width, height) * guide.sizeFrac);
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
}

export class GuideSampler {
  private readonly canvas = new OffscreenCanvas(SIZE, SIZE);
  private readonly ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;

  read(video: HTMLVideoElement, guide: Guide): Lab[] {
    const g = guideRect(video.videoWidth, video.videoHeight, guide);
    this.ctx.drawImage(video, g.x, g.y, g.size, g.size, 0, 0, SIZE, SIZE);
    const { data } = this.ctx.getImageData(0, 0, SIZE, SIZE);
    const cell = SIZE / 3;
    const sample = Math.max(2, Math.round(cell * guide.sampleFrac));
    const labs: Lab[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x0 = Math.round(col * cell + (cell - sample) / 2);
        const y0 = Math.round(row * cell + (cell - sample) / 2);
        labs.push(rgbToLab(medianRgb(data, SIZE, x0, y0, sample, sample)));
      }
    }
    return labs;
  }
}

// Samples 9 stickers at arbitrary centers (from the face locator), normalised to [0,1] image coordinates.
export class PointSampler {
  private readonly canvas = new OffscreenCanvas(1, 1);
  private readonly ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;

  read(video: HTMLVideoElement, centers: [number, number][], cellSize: number, sampleFrac: number, workWidth = 640): Lab[] {
    const w = workWidth;
    const h = Math.round((video.videoHeight * workWidth) / video.videoWidth);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    const { data } = this.ctx.getImageData(0, 0, w, h);
    const half = Math.max(1, Math.round((cellSize * w * sampleFrac) / 2));
    return centers.map(([nx, ny]) => {
      const x = Math.min(w - half - 1, Math.max(half, Math.round(nx * w)));
      const y = Math.min(h - half - 1, Math.max(half, Math.round(ny * h)));
      return rgbToLab(medianRgb(data, w, x - half, y - half, half * 2, half * 2));
    });
  }
}

// Camera-view index ↔ index as drawn on the mirrored preview (same row, column flipped).
export const mirrorIndex = (i: number) => Math.floor(i / 3) * 3 + (2 - (i % 3));
