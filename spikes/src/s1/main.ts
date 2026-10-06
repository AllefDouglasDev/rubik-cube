// S1: measures real webcam fps and the cost of OpenCV.js + MediaPipe Hands + ONNX Runtime running together in workers.
import {
  type CameraHandle,
  FrameLoop,
  closeCamera,
  describeTrack,
  listCameras,
  lockExposureAndWhiteBalance,
  openCamera,
} from "../shared/camera";
import { downloadJson, environmentInfo, timestampSlug } from "../shared/report";
import { RateCounter, RollingStats, round } from "../shared/stats";
import type { FromWorker, StageName, ToWorker } from "./protocol";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const WORKER_FACTORIES: Record<StageName, () => Worker> = {
  opencv: () => new Worker(new URL("./opencv.worker.ts", import.meta.url), { type: "module" }),
  mediapipe: () => new Worker(new URL("./mediapipe.worker.ts", import.meta.url), { type: "module" }),
  ort: () => new Worker(new URL("./ort.worker.ts", import.meta.url), { type: "module" }),
};

class Stage {
  readonly worker: Worker;
  status: "loading" | "ready" | "error" = "loading";
  error = "";
  initMs = 0;
  info: Record<string, unknown> = {};
  busy = false;
  skipped = 0;
  readonly proc = new RollingStats();
  readonly latency = new RollingStats();
  readonly rate = new RateCounter();
  readonly details = new Map<string, RollingStats>();
  private sentAt = new Map<number, number>();

  constructor(
    readonly name: StageName,
    readonly backend: string | undefined,
  ) {
    this.worker = WORKER_FACTORIES[name]();
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.worker.onerror = (e) => {
      this.status = "error";
      this.error = e.message || "worker error";
    };
    this.post({ type: "init", config: { backend } });
  }

  post(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  send(id: number, bitmap: ImageBitmap, capturedAt: number): void {
    this.busy = true;
    this.sentAt.set(id, capturedAt);
    this.post({ type: "frame", id, bitmap, timestamp: capturedAt }, [bitmap]);
  }

  private onMessage(msg: FromWorker): void {
    if (msg.type === "ready") {
      this.status = "ready";
      this.initMs = msg.initMs;
      this.info = msg.info;
    } else if (msg.type === "error") {
      this.status = "error";
      this.error = msg.message;
      this.busy = false;
    } else {
      this.busy = false;
      this.proc.add(msg.procMs);
      this.latency.add(performance.now() - (this.sentAt.get(msg.id) ?? performance.now()));
      this.sentAt.delete(msg.id);
      this.rate.tick();
      for (const [key, value] of Object.entries(msg.detail)) {
        if (!this.details.has(key)) this.details.set(key, new RollingStats());
        this.details.get(key)!.add(value);
      }
    }
  }

  resetStats(): void {
    this.proc.reset();
    this.latency.reset();
    this.details.forEach((s) => s.reset());
    this.skipped = 0;
  }

  snapshot() {
    return {
      stage: this.name,
      backend: this.backend,
      status: this.status,
      error: this.error || undefined,
      initMs: round(this.initMs),
      info: this.info,
      processedFps: round(this.rate.rate()),
      processed: this.proc.count,
      skippedBusy: this.skipped,
      procMs: this.proc.summary(),
      latencyMs: this.latency.summary(),
      detail: Object.fromEntries([...this.details].map(([k, s]) => [k, s.summary()])),
    };
  }

  terminate(): void {
    this.worker.terminate();
  }
}

let camera: CameraHandle | undefined;
let loop: FrameLoop | undefined;
let stages: Stage[] = [];
let frameId = 0;
const bitmapMs = new RollingStats();
const results: unknown[] = [];

async function populateDevices(): Promise<void> {
  const select = $<HTMLSelectElement>("device");
  const cams = await listCameras();
  select.innerHTML = cams.map((c, i) => `<option value="${c.deviceId}">${c.label || `Câmera ${i + 1}`}</option>`).join("");
}

function cameraConfig() {
  const [width, height] = $<HTMLSelectElement>("resolution").value.split("x").map(Number);
  return { width, height, frameRate: Number($<HTMLSelectElement>("fps").value), deviceId: $<HTMLSelectElement>("device").value || undefined };
}

async function startCamera(): Promise<void> {
  loop?.stop();
  closeCamera(camera);
  camera = await openCamera($<HTMLVideoElement>("video"), cameraConfig());
  await populateDevices();
  $<HTMLSelectElement>("device").value = camera.track.getSettings().deviceId ?? "";
  loop = new FrameLoop(camera.video, onFrame);
  loop.start();
  showCameraInfo();
  ["lock", "startPipeline", "runBench"].forEach((id) => ($<HTMLButtonElement>(id).disabled = false));
}

function showCameraInfo(extra?: unknown): void {
  if (!camera) return;
  const { label, settings, capabilities } = describeTrack(camera.track);
  $("cameraInfo").textContent = JSON.stringify(
    {
      label,
      settings: pick(settings, ["width", "height", "frameRate", "exposureMode", "whiteBalanceMode", "exposureTime", "colorTemperature"]),
      capabilities: pick(capabilities, ["frameRate", "exposureMode", "whiteBalanceMode", "exposureTime", "colorTemperature", "focusMode"]),
      lock: extra,
    },
    null,
    1,
  );
}

function pick<T extends object>(obj: T, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, (obj as Record<string, unknown>)[k]]));
}

function startPipeline(): void {
  stopPipeline();
  const enabled: StageName[] = (["opencv", "mediapipe", "ort"] as StageName[]).filter((n) => $<HTMLInputElement>(`use-${n}`).checked);
  stages = enabled.map((n) => new Stage(n, $<HTMLSelectElement>(`backend-${n}`)?.value));
  $<HTMLButtonElement>("stopPipeline").disabled = false;
}

function stopPipeline(): void {
  stages.forEach((s) => s.terminate());
  stages = [];
  $<HTMLButtonElement>("stopPipeline").disabled = true;
}

function onFrame(now: number): void {
  if (!camera) return;
  const procWidth = Number($<HTMLSelectElement>("procWidth").value);
  const { videoWidth, videoHeight } = camera.video;
  const resize = procWidth && procWidth < videoWidth ? { resizeWidth: procWidth, resizeHeight: Math.round((videoHeight * procWidth) / videoWidth) } : {};
  for (const stage of stages) {
    if (stage.status !== "ready") continue;
    if (stage.busy) {
      stage.skipped++;
      continue;
    }
    const id = frameId++;
    stage.busy = true;
    const t0 = performance.now();
    createImageBitmap(camera.video, resize).then(
      (bitmap) => {
        bitmapMs.add(performance.now() - t0);
        stage.send(id, bitmap, now);
      },
      () => (stage.busy = false),
    );
  }
}

function snapshot() {
  const settings = camera?.track.getSettings();
  return {
    camera: {
      requested: cameraConfig(),
      actual: settings ? { width: settings.width, height: settings.height, frameRate: settings.frameRate } : undefined,
      measuredFps: round(loop?.fps() ?? 0),
      framesPresented: loop?.totalFrames ?? 0,
      droppedFrames: loop?.droppedFrames ?? 0,
    },
    processingWidth: Number($<HTMLSelectElement>("procWidth").value) || "native",
    createImageBitmapMs: bitmapMs.summary(),
    stages: stages.map((s) => s.snapshot()),
  };
}

function renderMetrics(): void {
  const snap = snapshot();
  const rows: string[] = [
    `<tr><th>Câmera</th><td>${snap.camera.measuredFps} fps medido · ${snap.camera.actual?.width ?? "-"}×${snap.camera.actual?.height ?? "-"} @ ${snap.camera.actual?.frameRate ?? "-"} · ${snap.camera.droppedFrames} frames perdidos</td></tr>`,
    `<tr><th>createImageBitmap</th><td>${fmt(snap.createImageBitmapMs)}</td></tr>`,
  ];
  for (const s of snap.stages) {
    const head = `${s.stage}${s.backend ? ` (${s.backend})` : ""}`;
    if (s.status !== "ready") {
      rows.push(`<tr><th>${head}</th><td class="${s.status === "error" ? "bad" : "muted"}">${s.status} ${s.error ?? ""}</td></tr>`);
      continue;
    }
    const detail = Object.entries(s.detail)
      .map(([k, v]) => `${k} ${v.mean}`)
      .join(" · ");
    const cls = s.processedFps >= 30 ? "ok" : "bad";
    rows.push(
      `<tr><th>${head}</th><td><span class="${cls}">${s.processedFps} fps</span> · proc ${fmt(s.procMs)} · latência ${fmt(s.latencyMs)}<br><span class="muted">${detail} · init ${s.initMs} ms</span></td></tr>`,
    );
  }
  $("metrics").innerHTML = rows.join("");
}

function fmt(s: { mean: number; p95: number }): string {
  return Number.isFinite(s.mean) ? `${s.mean} ms (p95 ${s.p95})` : "-";
}

async function runBenchmark(): Promise<void> {
  const seconds = Number($<HTMLInputElement>("duration").value);
  const log = $("benchLog");
  const button = $<HTMLButtonElement>("runBench");
  button.disabled = true;
  // Without a running pipeline the run would only measure the camera.
  if (!stages.length) startPipeline();
  log.textContent = "Esperando os workers carregarem…";
  while (stages.some((s) => s.status === "loading")) await new Promise((r) => setTimeout(r, 200));
  stages.forEach((s) => s.resetStats());
  bitmapMs.reset();
  loop?.resetCounters();
  for (let left = seconds; left > 0; left--) {
    log.textContent = `Medindo… ${left}s`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const result = { durationS: seconds, ...snapshot() };
  results.push(result);
  log.textContent = `Rodada ${results.length} registrada.\n` + JSON.stringify(result, null, 1);
  button.disabled = false;
  $<HTMLButtonElement>("download").disabled = false;
}

async function download(): Promise<void> {
  downloadJson(`s1-${timestampSlug()}.json`, { spike: "S1", environment: await environmentInfo(), camera: camera && describeTrack(camera.track), runs: results });
}

$("startCamera").onclick = () => startCamera().catch((e) => ($("cameraInfo").textContent = String(e)));
$("lock").onclick = async () => camera && showCameraInfo(await lockExposureAndWhiteBalance(camera.track));
$("startPipeline").onclick = startPipeline;
$("stopPipeline").onclick = stopPipeline;
$("runBench").onclick = () => runBenchmark();
$("download").onclick = () => download();
setInterval(renderMetrics, 500);

// Hook for scripts/smoke.mjs.
Object.assign(window, {
  __spike: {
    snapshot,
    results,
    startCamera,
    startPipeline,
    runBenchmark,
    environment: environmentInfo,
    cameraDescription: () => camera && describeTrack(camera.track),
  },
});
