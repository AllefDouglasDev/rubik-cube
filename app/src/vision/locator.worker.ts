// Face location (OpenCV.js, ~13 MB) in a worker, so the UI thread never waits for it.
import cvModule from "@techstark/opencv-js";
import { locateFace } from "./faceLocator";

// The bundled typings do not describe the runtime-initialisation shape.
type CV = any;
let cv: CV;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

async function loadOpenCv(): Promise<CV> {
  const mod = cvModule as unknown as CV;
  if (mod.Mat) return mod;
  if (typeof mod.then === "function") {
    // A promise of the module whose value also has `then`: resolving with it directly would unwrap it
    // again, so it travels wrapped in an object.
    const wrapped = await new Promise<{ m: CV }>((resolve) => mod.then((m: CV) => resolve({ m })));
    return wrapped.m;
  }
  await new Promise<void>((resolve) => (mod.onRuntimeInitialized = () => resolve()));
  return mod;
}

self.onmessage = async (event: MessageEvent<{ type: "init" } | { type: "frame"; bitmap: ImageBitmap }>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      cv = await loadOpenCv();
      self.postMessage({ type: "ready" });
      return;
    }
    const { bitmap } = msg;
    const w = bitmap.width;
    const h = bitmap.height;
    if (!ctx || ctx.canvas.width !== w || ctx.canvas.height !== h) ctx = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
    ctx!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const mat = cv.matFromImageData(ctx!.getImageData(0, 0, w, h));
    try {
      const face = locateFace(cv, mat);
      // Normalised to [0,1] so the main thread can map to any resolution.
      self.postMessage({
        type: "face",
        face: face && {
          centers: face.centers.map(([x, y]) => [x / w, y / h]),
          corners: face.corners.map(([x, y]) => [x / w, y / h]),
          cellSize: face.cellSize / w,
          stickersFound: face.stickersFound,
        },
      });
    } finally {
      mat.delete();
    }
  } catch (e) {
    self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
