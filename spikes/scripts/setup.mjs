// Copies the WASM runtimes into public/vendor and downloads the models into public/models.
// Run once after `npm install` (it skips files that already exist).
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

const MODELS = [
  {
    file: "hand_landmarker.task",
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
  {
    // Ultralytics YOLO11n (AGPL-3.0). Used only as a load reference for the local benchmark; do not redistribute.
    file: "yolo11n.onnx",
    url: "https://raw.githubusercontent.com/nomi30701/yolo-onnx-benchmark-web/main/public/models/yolo11n.onnx",
  },
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyRuntimes() {
  await cp(join(root, "node_modules/@mediapipe/tasks-vision/wasm"), join(pub, "vendor/mediapipe"), { recursive: true });
  const ortDist = join(root, "node_modules/onnxruntime-web/dist");
  await cp(ortDist, join(pub, "vendor/ort"), {
    recursive: true,
    filter: (src) => src === ortDist || /ort-wasm[^/]*\.(mjs|wasm)$/.test(src),
  });
  console.log("runtimes copied to public/vendor");
}

async function downloadModels() {
  await mkdir(join(pub, "models"), { recursive: true });
  for (const { file, url } of MODELS) {
    const target = join(pub, "models", file);
    if (await exists(target)) {
      console.log(`skip ${file} (already exists)`);
      continue;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed ${url}: ${res.status}`);
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    console.log(`downloaded ${file}`);
  }
}

await copyRuntimes();
await downloadModels();
