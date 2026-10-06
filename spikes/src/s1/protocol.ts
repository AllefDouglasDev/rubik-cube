// Messages exchanged between the S1 page and the pipeline workers.

export type StageName = "opencv" | "mediapipe" | "ort";

export interface StageConfig {
  // MediaPipe: "GPU" | "CPU"; ORT: "webgpu" | "wasm". Ignored by OpenCV.
  backend?: string;
}

export type ToWorker =
  | { type: "init"; config: StageConfig }
  | { type: "frame"; id: number; bitmap: ImageBitmap; timestamp: number };

export type FromWorker =
  | { type: "ready"; initMs: number; info: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "result"; id: number; procMs: number; detail: Record<string, number> };

// Wraps a worker handler with the init/frame protocol and timing.
export function serveStage(
  init: (config: StageConfig) => Promise<Record<string, unknown>>,
  process: (bitmap: ImageBitmap, timestamp: number) => Promise<Record<string, number>> | Record<string, number>,
): void {
  const post = (msg: FromWorker) => self.postMessage(msg);
  self.onmessage = async (event: MessageEvent<ToWorker>) => {
    const msg = event.data;
    try {
      if (msg.type === "init") {
        const t0 = performance.now();
        const info = await init(msg.config);
        post({ type: "ready", initMs: performance.now() - t0, info });
        return;
      }
      const t0 = performance.now();
      const detail = await process(msg.bitmap, msg.timestamp);
      msg.bitmap.close();
      post({ type: "result", id: msg.id, procMs: performance.now() - t0, detail });
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err) });
    }
  };
}
