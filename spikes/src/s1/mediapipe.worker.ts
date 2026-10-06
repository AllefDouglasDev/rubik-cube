// MediaPipe Hand Landmarker (21 landmarks per hand) in VIDEO mode.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { serveStage } from "./protocol";

let landmarker: HandLandmarker;
let lastTimestamp = 0;

serveStage(
  async (config) => {
    const delegate = config.backend === "CPU" ? "CPU" : "GPU";
    // useModule=true: module workers have no importScripts.
    const fileset = await FilesetResolver.forVisionTasks("/vendor/mediapipe", true);
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
      canvas: new OffscreenCanvas(1, 1),
      runningMode: "VIDEO",
      numHands: 2,
    });
    return { delegate };
  },
  (bitmap, timestamp) => {
    // detectForVideo requires strictly increasing timestamps.
    lastTimestamp = Math.max(lastTimestamp + 1, Math.round(timestamp));
    const result = landmarker.detectForVideo(bitmap, lastTimestamp);
    return { hands: result.landmarks.length };
  },
);
