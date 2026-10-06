// Runs the S1 benchmark matrix (docs/spikes/README.md) in Chrome with the real webcam and saves the report.
// Usage: node scripts/bench-s1.mjs [secondsPerRun=20]
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SECONDS = process.argv[2] ?? "20";

const MATRIX = [
  { resolution: "1280x720", fps: "60", procWidth: "640", stages: { opencv: true, mediapipe: false, ort: false } },
  { resolution: "1280x720", fps: "60", procWidth: "640", stages: { opencv: false, mediapipe: "GPU", ort: false } },
  { resolution: "1280x720", fps: "60", procWidth: "640", stages: { opencv: false, mediapipe: false, ort: "webgpu" } },
  { resolution: "1280x720", fps: "60", procWidth: "640", stages: { opencv: true, mediapipe: "GPU", ort: "webgpu" } },
  { resolution: "1280x720", fps: "60", procWidth: "640", stages: { opencv: true, mediapipe: "CPU", ort: "wasm" } },
  { resolution: "1920x1080", fps: "30", procWidth: "960", stages: { opencv: true, mediapipe: "GPU", ort: "webgpu" } },
];

const server = await createServer({ logLevel: "error", server: { port: 5198, strictPort: true } });
await server.listen();
const base = "http://localhost:5198";
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ["--enable-unsafe-webgpu"] });

try {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  await page.goto(`${base}/s1.html`);
  await page.fill("#duration", SECONDS);

  for (const [i, run] of MATRIX.entries()) {
    console.log(`run ${i + 1}/${MATRIX.length}`, JSON.stringify(run));
    await page.selectOption("#resolution", run.resolution);
    await page.selectOption("#fps", run.fps);
    await page.selectOption("#procWidth", run.procWidth);
    for (const [stage, value] of Object.entries(run.stages)) {
      await page.setChecked(`#use-${stage}`, Boolean(value));
      if (typeof value === "string") await page.selectOption(`#backend-${stage}`, value);
    }
    await page.evaluate(() => window.__spike.startCamera());
    await page.evaluate(() => window.__spike.startPipeline());
    await page.waitForFunction(() => window.__spike.snapshot().stages.every((s) => s.status !== "loading"), null, { timeout: 120_000 });
    await page.evaluate(() => window.__spike.runBenchmark());
  }

  const report = await page.evaluate(async () => ({
    spike: "S1",
    environment: await window.__spike.environment(),
    camera: window.__spike.cameraDescription(),
    runs: window.__spike.results,
  }));
  await mkdir("reports", { recursive: true });
  const file = `reports/s1-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  await writeFile(file, JSON.stringify(report, null, 2));
  console.log(`saved ${file}`);
} finally {
  await browser.close();
  await server.close();
}
