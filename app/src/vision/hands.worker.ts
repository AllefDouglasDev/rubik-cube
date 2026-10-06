// MediaPipe Hand Landmarker in a worker (measured in S1: ~13 ms per frame on the GPU delegate).
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let landmarker: HandLandmarker | undefined;
let lastTimestamp = 0;

self.onmessage = async (event: MessageEvent<{ type: "init" } | { type: "frame"; bitmap: ImageBitmap; t: number }>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      const fileset = await FilesetResolver.forVisionTasks("/vendor/mediapipe", true);
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
        canvas: new OffscreenCanvas(1, 1),
        runningMode: "VIDEO",
        numHands: 2,
      });
      self.postMessage({ type: "ready" });
      return;
    }
    if (!landmarker) return msg.bitmap.close();
    lastTimestamp = Math.max(lastTimestamp + 1, Math.round(msg.t));
    const result = landmarker.detectForVideo(msg.bitmap, lastTimestamp);
    msg.bitmap.close();
    // Normalised [0,1] image coordinates (camera view, not mirrored).
    self.postMessage({ type: "hands", hands: result.landmarks.map((h) => h.map((p) => [p.x, p.y])) });
  } catch (e) {
    self.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
