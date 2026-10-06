// Main-thread side of the face locator: sends downscaled frames to the worker (one at a time) and keeps
// the latest located face, normalised to [0,1] image coordinates (camera view).
export interface NormalizedFace {
  centers: [number, number][];
  corners: [number, number][];
  cellSize: number; // fraction of the image width
  stickersFound: number;
  at: number; // performance.now() of the frame
}

const WORK_WIDTH = 640;

export class FaceTracker {
  private worker = new Worker(new URL("./locator.worker.ts", import.meta.url), { type: "module" });
  private busy = false;
  private isReady = false;
  latest: NormalizedFace | null = null;
  ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.isReady = true;
          resolve();
        } else if (e.data.type === "error") reject(new Error(e.data.message));
      };
    });
    this.worker.postMessage({ type: "init" });
  }

  // Sends the current frame if the worker is idle; the result lands in `latest`.
  async track(video: HTMLVideoElement, at: number): Promise<void> {
    // Frames sent while OpenCV is still loading would only come back as errors.
    if (!this.isReady || this.busy || !video.videoWidth) return;
    this.busy = true;
    try {
      const bitmap = await createImageBitmap(video, {
        resizeWidth: WORK_WIDTH,
        resizeHeight: Math.round((video.videoHeight * WORK_WIDTH) / video.videoWidth),
      });
      const face = await new Promise<Omit<NormalizedFace, "at"> | null>((resolve) => {
        this.worker.onmessage = (e) => {
          if (e.data.type === "face") resolve(e.data.face);
          else if (e.data.type === "error") resolve(null);
        };
        this.worker.postMessage({ type: "frame", bitmap }, [bitmap]);
      });
      this.latest = face ? { ...face, at } : null;
    } finally {
      this.busy = false;
    }
  }

  // The latest face, if recent enough to sample the current frame with it.
  current(now: number, maxAgeMs = 400): NormalizedFace | null {
    return this.latest && now - this.latest.at <= maxAgeMs ? this.latest : null;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
