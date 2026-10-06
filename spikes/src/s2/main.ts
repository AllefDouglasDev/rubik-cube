// S2: per-cube color calibration, CIEDE2000 vs ΔE76 classification and multi-frame voting,
// measured against known faces (solved or checkerboard) under different lighting.
import { type CameraHandle, FrameLoop, closeCamera, describeTrack, lockExposureAndWhiteBalance, openCamera } from "../shared/camera";
import { downloadJson, environmentInfo, timestampSlug } from "../shared/report";
import { round } from "../shared/stats";
import {
  COLORS,
  COLOR_INFO,
  type StoredCalibration,
  type CubeColor,
  FaceVoter,
  type Metric,
  type Pattern,
  type Reading,
  type RejectLimits,
  classify,
  expectedFace,
  isCalibrated,
  meanLab,
  normalizeCalibration,
  referencesFor,
} from "./classifier";
import { type Lab, medianRgb, rgbToLab } from "./color";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORAGE_KEY = "s2.calibrations";
const SAMPLE_CANVAS = 180;
const CALIBRATION_FRAMES = 15;

let camera: CameraHandle | undefined;
let loop: FrameLoop | undefined;
let calibration: StoredCalibration = { global: {}, cells: {} };
let lockInfo: unknown;
const liveVoter = new FaceVoter();
const sampler = new OffscreenCanvas(SAMPLE_CANVAS, SAMPLE_CANVAS);
const samplerCtx = sampler.getContext("2d", { willReadFrequently: true })!;

// Hooks fed by every processed frame (calibration capture and measurement).
const frameListeners = new Set<(labs: Lab[]) => void>();

function rejectLimits(metric: Metric): RejectLimits | undefined {
  if (!$<HTMLInputElement>("reject").checked) return undefined;
  const max = Number($<HTMLInputElement>(metric === "de2000" ? "maxDe2000" : "maxDe76").value);
  return { maxDistance: max, minConfidence: Number($<HTMLInputElement>("minConf").value) };
}

const swatch = (r: Reading) => (r === "?" ? "#808080" : COLOR_INFO[r].swatch);

// --- geometry -------------------------------------------------------------

function guideRect(video: HTMLVideoElement) {
  const frac = Number($<HTMLInputElement>("guide").value) / 100;
  const size = Math.round(Math.min(video.videoWidth, video.videoHeight) * frac);
  return { x: Math.round((video.videoWidth - size) / 2), y: Math.round((video.videoHeight - size) / 2), size };
}

// Reads the 9 stickers in the order the user sees them (mirrored display).
function readStickers(video: HTMLVideoElement): Lab[] {
  const g = guideRect(video);
  samplerCtx.drawImage(video, g.x, g.y, g.size, g.size, 0, 0, SAMPLE_CANVAS, SAMPLE_CANVAS);
  const { data } = samplerCtx.getImageData(0, 0, SAMPLE_CANVAS, SAMPLE_CANVAS);
  const cell = SAMPLE_CANVAS / 3;
  const sample = Math.max(2, Math.round((cell * Number($<HTMLInputElement>("sample").value)) / 100));
  const labs: Lab[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const srcCol = 2 - col;
      const x0 = Math.round(srcCol * cell + (cell - sample) / 2);
      const y0 = Math.round(row * cell + (cell - sample) / 2);
      labs.push(rgbToLab(medianRgb(data, SAMPLE_CANVAS, x0, y0, sample, sample)));
    }
  }
  return labs;
}

// --- per-frame processing -------------------------------------------------

function onFrame(): void {
  if (!camera) return;
  const labs = readStickers(camera.video);
  frameListeners.forEach((fn) => fn(labs));
  liveVoter.windowSize = Number($<HTMLInputElement>("window").value);
  liveVoter.threshold = Number($<HTMLInputElement>("threshold").value);

  let guesses: ReturnType<typeof classify>[] | undefined;
  if (isCalibrated(calibration.global)) {
    const metric = $<HTMLSelectElement>("metric").value as Metric;
    const perCell = $<HTMLInputElement>("perCell").checked;
    guesses = labs.map((lab, i) => classify(lab, referencesFor(calibration, i, perCell)!, metric, rejectLimits(metric)));
    liveVoter.push(guesses.map((g) => g.color));
  }
  drawOverlay(guesses);
}

function drawOverlay(guesses?: ReturnType<typeof classify>[]): void {
  if (!camera) return;
  const video = camera.video;
  const canvas = $<HTMLCanvasElement>("overlay");
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = guideRect(video);
  const cell = g.size / 3;
  const sample = (cell * Number($<HTMLInputElement>("sample").value)) / 100;
  const voted = guesses ? liveVoter.result() : undefined;

  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const x = g.x + col * cell;
    const y = g.y + row * cell;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.strokeRect(x, y, cell, cell);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(x + (cell - sample) / 2, y + (cell - sample) / 2, sample, sample);
    ctx.setLineDash([]);
    if (guesses && voted) {
      const r = cell * 0.14;
      ctx.fillStyle = swatch(voted.colors[i]);
      ctx.beginPath();
      ctx.arc(x + cell - r - 6, y + r + 6, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = voted.agreement[i] >= liveVoter.threshold ? "#1f8a4c" : "#c0392b";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.round(cell * 0.12)}px system-ui`;
      ctx.fillText(`${Math.round(guesses[i].confidence * 100)}%`, x + 6, y + cell - 8);
    }
  }
  ctx.strokeStyle = voted?.accepted ? "#1f8a4c" : "rgba(255,255,255,0.9)";
  ctx.lineWidth = 6;
  ctx.strokeRect(g.x, g.y, g.size, g.size);

  if (voted) {
    $("live").innerHTML = `${voted.accepted ? '<b class="ok">Face aceita</b>' : '<span class="muted">Aguardando estabilidade…</span>'}<br>${voted.colors
      .map((c, i) => `${c}${i % 3 === 2 ? "<br>" : " "}`)
      .join("")}`;
  }
}

// --- calibration ----------------------------------------------------------

function captureFrames(count: number): Promise<Lab[][]> {
  return new Promise((resolve) => {
    const frames: Lab[][] = [];
    const listener = (labs: Lab[]) => {
      frames.push(labs);
      if (frames.length >= count) {
        frameListeners.delete(listener);
        resolve(frames);
      }
    };
    frameListeners.add(listener);
  });
}

async function calibrate(color: CubeColor): Promise<void> {
  const frames = await captureFrames(CALIBRATION_FRAMES);
  calibration.global[color] = meanLab(frames.flat());
  calibration.cells[color] = Array.from({ length: 9 }, (_, i) => meanLab(frames.map((f) => f[i])));
  liveVoter.reset();
  renderCalibration();
}

function renderCalibration(): void {
  const container = $("calButtons");
  container.innerHTML = "";
  for (const c of COLORS) {
    const b = document.createElement("button");
    b.textContent = `${calibration.global[c] ? (calibration.cells[c] ? "✓ " : "✓* ") : ""}${COLOR_INFO[c].name}`;
    b.style.borderColor = COLOR_INFO[c].swatch;
    b.disabled = !camera;
    b.onclick = () => calibrate(c);
    container.appendChild(b);
  }
  $<HTMLButtonElement>("measure").disabled = !camera || !isCalibrated(calibration.global);
}

function storedCalibrations(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function renderCalibrationList(): void {
  $("calList").innerHTML = Object.keys(storedCalibrations())
    .map((name) => `<option>${name}</option>`)
    .join("");
}

// --- measurement ----------------------------------------------------------

interface MetricTally {
  stickers: number;
  correct: number;
  frames: number;
  framesAllCorrect: number;
  votedAcceptedCorrect: number;
  votedAcceptedWrong: number;
  firstAcceptMs?: number;
  confidenceSum: number;
  unknown: number;
  nearestCorrect: number;
  // Distance to the calibrated color for correct readings: used to tune the reject limit.
  correctDistances: number[];
  confusions: Record<string, number>;
}

const results: Record<string, unknown>[] = [];

// Every measurement runs all classifier variants over the same frames.
const VARIANTS: { id: string; metric: Metric; perCell: boolean }[] = [
  { id: "de76", metric: "de76", perCell: false },
  { id: "de2000", metric: "de2000", perCell: false },
  { id: "de76-pos", metric: "de76", perCell: true },
  { id: "de2000-pos", metric: "de2000", perCell: true },
  { id: "de76L-pos", metric: "de76L", perCell: true },
];

async function measure(): Promise<void> {
  if (!isCalibrated(calibration.global)) return;
  const cal = calibration;
  const pattern = $<HTMLSelectElement>("pattern").value as Pattern;
  const center = $<HTMLSelectElement>("center").value as CubeColor;
  const expected = expectedFace(pattern, center);
  const seconds = Number($<HTMLInputElement>("duration").value);
  const windowSize = Number($<HTMLInputElement>("window").value);
  const threshold = Number($<HTMLInputElement>("threshold").value);
  const log = $("measureLog");
  const button = $<HTMLButtonElement>("measure");
  button.disabled = true;

  const metrics = VARIANTS.map((v) => v.id);
  const variant = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
  const tallies = Object.fromEntries(
    metrics.map((m) => [m, { stickers: 0, correct: 0, frames: 0, framesAllCorrect: 0, votedAcceptedCorrect: 0, votedAcceptedWrong: 0, confidenceSum: 0, unknown: 0, nearestCorrect: 0, correctDistances: [], confusions: {} } as MetricTally]),
  ) as Record<string, MetricTally>;
  const voters = Object.fromEntries(metrics.map((m) => [m, new FaceVoter(windowSize, threshold)])) as Record<string, FaceVoter>;
  const limits = Object.fromEntries(metrics.map((m) => [m, rejectLimits(variant[m].metric)])) as Record<string, RejectLimits | undefined>;
  const start = performance.now();

  const listener = (labs: Lab[]) => {
    for (const m of metrics) {
      const t = tallies[m];
      const { metric, perCell } = variant[m];
      const guesses = labs.map((lab, i) => classify(lab, referencesFor(cal, i, perCell)!, metric, limits[m]));
      let allCorrect = true;
      guesses.forEach((g, i) => {
        t.stickers++;
        t.confidenceSum += g.confidence;
        if (g.nearest === expected[i]) {
          t.nearestCorrect++;
          t.correctDistances.push(g.distance);
        }
        if (g.color === "?") t.unknown++;
        if (g.color === expected[i]) t.correct++;
        else {
          allCorrect = false;
          // Position 1–9, row by row as the user sees the face.
          const key = `${expected[i]}→${g.color}@${i + 1}`;
          t.confusions[key] = (t.confusions[key] ?? 0) + 1;
        }
      });
      t.frames++;
      if (allCorrect) t.framesAllCorrect++;
      voters[m].push(guesses.map((g) => g.color));
      const voted = voters[m].result();
      if (voted.accepted) {
        const ok = voted.colors.every((c, i) => c === expected[i]);
        if (ok) {
          t.votedAcceptedCorrect++;
          t.firstAcceptMs ??= performance.now() - start;
        } else t.votedAcceptedWrong++;
      }
    }
  };
  frameListeners.add(listener);
  for (let left = seconds; left > 0; left--) {
    log.textContent = `Medindo… ${left}s (mantenha a face parada no guia)`;
    await new Promise((r) => setTimeout(r, 1000));
  }
  frameListeners.delete(listener);

  const result = {
    lighting: $<HTMLInputElement>("lighting").value,
    calibration: $<HTMLInputElement>("calName").value,
    perCellCalibration: COLORS.every((c) => cal.cells[c]),
    pattern,
    center,
    durationS: seconds,
    voting: { windowSize, threshold },
    rejectLimits: limits,
    cameraSettings: camera && describeTrack(camera.track).settings,
    lock: lockInfo,
    metrics: Object.fromEntries(
      metrics.map((m) => {
        const t = tallies[m];
        return [
          m,
          {
            frames: t.frames,
            stickerAccuracy: round((100 * t.correct) / t.stickers, 2),
            frameAccuracy: round((100 * t.framesAllCorrect) / t.frames, 2),
            votedAcceptedCorrect: t.votedAcceptedCorrect,
            votedAcceptedWrong: t.votedAcceptedWrong,
            firstAcceptMs: t.firstAcceptMs && round(t.firstAcceptMs, 0),
            meanConfidence: round(t.confidenceSum / t.stickers, 3),
            unknownRate: round((100 * t.unknown) / t.stickers, 2),
            // Accuracy of the nearest color without rejection: the gap to stickerAccuracy is the cost of rejecting.
            nearestAccuracy: round((100 * t.nearestCorrect) / t.stickers, 2),
            correctDistance: distanceSummary(t.correctDistances),
            confusions: t.confusions,
          },
        ];
      }),
    ),
  };
  results.push(result);
  log.textContent = JSON.stringify(result.metrics, null, 1);
  renderResults();
  button.disabled = false;
}

function distanceSummary(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { mean: round(values.reduce((a, b) => a + b, 0) / values.length, 1), p95: round(at(0.95), 1), max: round(sorted[sorted.length - 1], 1) };
}

function renderResults(): void {
  const head = "<tr><th>Luz</th><th>Padrão</th><th>Métrica</th><th>Adesivos</th><th>?</th><th>Frames</th><th>Aceita errada</th></tr>";
  const rows = results.flatMap((r) => {
    const metrics = r.metrics as Record<string, { stickerAccuracy: number; unknownRate: number; frameAccuracy: number; votedAcceptedWrong: number }>;
    return Object.entries(metrics).map(
      ([m, v]) =>
        `<tr><td>${r.lighting}</td><td>${r.pattern} ${r.center}</td><td>${m}</td><td class="${v.stickerAccuracy >= 99 ? "ok" : "bad"}">${v.stickerAccuracy}%</td><td>${v.unknownRate}%</td><td>${v.frameAccuracy}%</td><td class="${v.votedAcceptedWrong ? "bad" : "ok"}">${v.votedAcceptedWrong}</td></tr>`,
    );
  });
  $("results").innerHTML = head + rows.join("");
  $<HTMLButtonElement>("download").disabled = results.length === 0;
}

// --- wiring ---------------------------------------------------------------

async function startCamera(): Promise<void> {
  loop?.stop();
  closeCamera(camera);
  const [width, height] = $<HTMLSelectElement>("resolution").value.split("x").map(Number);
  camera = await openCamera($<HTMLVideoElement>("video"), { width, height, frameRate: 30 });
  loop = new FrameLoop(camera.video, onFrame);
  loop.start();
  $<HTMLButtonElement>("lock").disabled = false;
  const { label, settings } = describeTrack(camera.track);
  $("cameraInfo").textContent = `${label}\n${settings.width}×${settings.height} @ ${settings.frameRate}`;
  renderCalibration();
}

$("center").innerHTML = COLORS.map((c) => `<option value="${c}">${COLOR_INFO[c].name}</option>`).join("");
$("startCamera").onclick = () => startCamera().catch((e) => ($("cameraInfo").textContent = String(e)));
$("lock").onclick = async () => {
  if (!camera) return;
  lockInfo = await lockExposureAndWhiteBalance(camera.track);
  $("cameraInfo").textContent = JSON.stringify(lockInfo, null, 1);
};
$("calSave").onclick = () => {
  const all = storedCalibrations();
  all[$<HTMLInputElement>("calName").value] = calibration;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  renderCalibrationList();
};
$("calLoad").onclick = () => {
  const name = $<HTMLSelectElement>("calList").value;
  calibration = normalizeCalibration(storedCalibrations()[name]);
  $<HTMLInputElement>("calName").value = name;
  liveVoter.reset();
  renderCalibration();
};
$("measure").onclick = () => measure();
$("download").onclick = async () =>
  downloadJson(`s2-${timestampSlug()}.json`, { spike: "S2", environment: await environmentInfo(), calibration, results });
renderCalibration();
renderCalibrationList();

// Hook for scripts/smoke.mjs.
Object.assign(window, {
  __spike: { startCamera, calibrate, measure, results, getCalibration: () => calibration, fps: () => loop?.fps() ?? 0 },
});
