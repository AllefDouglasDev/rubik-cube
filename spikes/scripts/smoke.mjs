// End-to-end smoke test: runs S1 and S2 in Chrome with Chrome's fake camera.
// It checks that the pipeline loads and processes frames; the numbers are not representative of the real webcam.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const server = await createServer({ logLevel: "error", server: { port: 5199, strictPort: true } });
await server.listen();
const base = "http://localhost:5199";

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: process.env.HEADED ? false : true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-webgpu"],
});

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`FAIL ${msg}`);
};

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} ${m.location().url}`));

  // --- S1 ---
  await page.goto(`${base}/s1.html`);
  await page.evaluate(() => window.__spike.startCamera());
  await page.evaluate(() => window.__spike.startPipeline());
  await page.waitForFunction(() => window.__spike.snapshot().stages.every((s) => s.status !== "loading"), null, { timeout: 120_000 });
  await page.fill("#duration", "5");
  await page.evaluate(() => window.__spike.runBenchmark());
  const s1 = await page.evaluate(() => window.__spike.results[0]);
  console.log("S1", JSON.stringify({ camera: s1.camera, bitmap: s1.createImageBitmapMs, stages: s1.stages.map((s) => ({ stage: s.stage, backend: s.backend, status: s.status, error: s.error?.slice(0, 300), fps: s.processedFps, procMs: s.procMs, detail: s.detail })) }, null, 1));
  if (s1.camera.measuredFps <= 0) fail("S1 camera produced no frames");
  for (const s of s1.stages) {
    if (s.status !== "ready") fail(`S1 stage ${s.stage} not ready: ${s.error}`);
    else if (s.processed === 0) fail(`S1 stage ${s.stage} processed no frames`);
  }

  // --- S2 ---
  await page.goto(`${base}/s2.html`);
  await page.evaluate(() => window.__spike.startCamera());
  for (const c of ["W", "Y", "R", "O", "B", "G"]) await page.evaluate((color) => window.__spike.calibrate(color), c);
  await page.fill("#duration", "3");
  await page.evaluate(() => window.__spike.measure());
  const s2 = await page.evaluate(() => ({ fps: window.__spike.fps(), result: window.__spike.results[0] }));
  console.log("S2", JSON.stringify({ fps: s2.fps, metrics: s2.result?.metrics }, null, 1));
  if (!s2.result || s2.result.metrics.de2000.frames === 0) fail("S2 measured no frames");

  if (errors.length) fail(`page errors:\n${errors.join("\n")}`);
} finally {
  await browser.close();
  await server.close();
}

if (failed) process.exit(1);
console.log("smoke OK");
