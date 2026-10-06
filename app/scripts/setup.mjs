// Copies the MediaPipe WASM runtime into public/vendor and downloads the hand model into public/models.
// Run once after `npm install` (skips files that already exist). Needed only for hand masking in tracking.
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

await cp(join(root, "node_modules/@mediapipe/tasks-vision/wasm"), join(pub, "vendor/mediapipe"), { recursive: true });
console.log("MediaPipe runtime copied to public/vendor/mediapipe");
await mkdir(join(pub, "models"), { recursive: true });
const target = join(pub, "models/hand_landmarker.task");
try {
  await stat(target);
  console.log("skip hand_landmarker.task (already exists)");
} catch {
  const res = await fetch(MODEL);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log("downloaded hand_landmarker.task");
}
