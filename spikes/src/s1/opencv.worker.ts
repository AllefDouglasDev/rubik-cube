// Classic contour pipeline, representative of locating the cube and its stickers:
// gray → blur → Canny → dilate → contours → approxPolyDP → count quads.
import cvModule from "@techstark/opencv-js";
import { serveStage } from "./protocol";

// The bundled typings do not cover the runtime-initialization shape, so the module is used untyped.
type CV = any;

let cv: CV;
let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;

async function loadOpenCv(): Promise<CV> {
  const mod = cvModule as unknown as CV;
  if (mod instanceof Promise) return await mod;
  if (mod.Mat) return mod;
  await new Promise<void>((resolve) => {
    mod.onRuntimeInitialized = () => resolve();
  });
  return mod;
}

serveStage(
  async () => {
    cv = await loadOpenCv();
    canvas = new OffscreenCanvas(1, 1);
    ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    return { version: String(cv.getBuildInformation?.().match(/Version control:\s*(\S+)/)?.[1] ?? "unknown") };
  },
  (bitmap) => {
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    ctx.drawImage(bitmap, 0, 0);
    const t0 = performance.now();
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const readMs = performance.now() - t0;

    const src = cv.matFromImageData(image);
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    let quads = 0;
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
      cv.Canny(gray, edges, 40, 120);
      cv.dilate(edges, edges, kernel);
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      const minArea = (bitmap.width * bitmap.height) / 2000;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.08 * cv.arcLength(c, true), true);
        if (approx.rows === 4 && cv.contourArea(approx) > minArea) quads++;
        approx.delete();
        c.delete();
      }
      return { readMs, contours: contours.size(), quads };
    } finally {
      [src, gray, edges, contours, hierarchy, kernel].forEach((m) => m.delete());
    }
  },
);
