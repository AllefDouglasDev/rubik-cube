// YOLO11n (640x640) on ONNX Runtime Web. It only measures the cost of a small detector, not cube detection.
import * as ort from "onnxruntime-web/webgpu";
import { serveStage } from "./protocol";

const SIZE = 640;
const SCORE_THRESHOLD = 0.25;

let session: ort.InferenceSession;
let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;
const input = new Float32Array(3 * SIZE * SIZE);

serveStage(
  async (config) => {
    const backend = config.backend === "wasm" ? "wasm" : "webgpu";
    ort.env.wasm.wasmPaths = "/vendor/ort/";
    session = await ort.InferenceSession.create("/models/yolo11n.onnx", {
      executionProviders: [backend],
      graphOptimizationLevel: "all",
    });
    canvas = new OffscreenCanvas(SIZE, SIZE);
    ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Warm-up: the first WebGPU run compiles shaders.
    await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
    return { backend, inputs: session.inputNames, outputs: session.outputNames };
  },
  async (bitmap) => {
    const t0 = performance.now();
    // Letterbox into SIZE x SIZE keeping the aspect ratio.
    const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    ctx.fillStyle = "#727272";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const plane = SIZE * SIZE;
    for (let i = 0; i < plane; i++) {
      input[i] = data[i * 4] / 255;
      input[plane + i] = data[i * 4 + 1] / 255;
      input[2 * plane + i] = data[i * 4 + 2] / 255;
    }
    const prepMs = performance.now() - t0;

    const t1 = performance.now();
    const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
    const output = outputs[session.outputNames[0]];
    const scores = (await output.getData()) as Float32Array;
    const inferMs = performance.now() - t1;

    // Output [1, 4 + classes, anchors]: count anchors whose best class passes the threshold.
    const [, rows, anchors] = output.dims as number[];
    let candidates = 0;
    for (let a = 0; a < anchors; a++) {
      for (let r = 4; r < rows; r++) {
        if (scores[r * anchors + a] > SCORE_THRESHOLD) {
          candidates++;
          break;
        }
      }
    }
    output.dispose();
    return { prepMs, inferMs, candidates };
  },
);
