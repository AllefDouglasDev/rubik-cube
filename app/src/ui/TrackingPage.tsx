// Phase 3 (experimental): track moves with the webcam while the front (green) face looks at the camera.
//  - Livre: live decoding from a known start state.
//  - Guiado (S4/F3.7): execute a known algorithm; the decoder's accuracy is measured and the run is saved
//    as a labelled dataset (observations + optional video download).
//  - Solve com câmera (F3.5/F3.6): timed solve with live decoding and video; reconstruct later from the video.
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alg } from "cubing/alg";
import { FaceletCube } from "../analysis/facelets";
import { analyzeSolve } from "../analysis/stages";
import { type CameraHandle, FrameLoop, closeCamera, lockExposureAndWhiteBalance, openCamera } from "../camera/camera";
import { LEVELS } from "../curriculum/curriculum";
import { CubeView, type CubeViewHandle } from "../renderer/CubeView";
import { formatTime } from "../stats/stats";
import type { Repo } from "../storage/repo";
import { type DecodedMove, MoveDecoder } from "../tracking/decoder";
import { moveAccuracy } from "../tracking/metrics";
import { FaceObserver, type Observation } from "../tracking/observer";
import { solveGap } from "../tracking/fill";
import { type StickerState, solvedState, stateFromCube } from "../tracking/stickerModel";
import { decodeVideo } from "../tracking/videoDecode";
import { useTimer } from "../timer/useTimer";
import { loadCalibration } from "../vision/calibrationStore";
import { DEFAULT_LIMITS, type Reading, classify, isCalibrated, referencesFor } from "../vision/classifier";
import { FrameReader, drawReading, handCovered } from "../vision/frameReader";
import { DEFAULT_GUIDE } from "../vision/sampler";

type Mode = "free" | "guided" | "solve";

interface Props {
  repo: Repo;
  active: boolean;
  sessionId: string;
  timerScramble: string | null;
  holdMs: number;
}

const GUIDED_ALGS = LEVELS.flatMap((l) => l.itens.flatMap((i) => i.algoritmos.map((a) => ({ label: `${i.titulo} · ${a.nome}`, alg: a.alg }))));

const stateOf = (scramble: string) => stateFromCube(FaceletCube.solved().apply(scramble));

// Hand landmarks in a worker; resolves with the hands of each frame sent.
class HandTracker {
  private worker = new Worker(new URL("../vision/hands.worker.ts", import.meta.url), { type: "module" });
  private pending: ((h: [number, number][][]) => void) | null = null;
  ready: Promise<void>;

  constructor() {
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        if (e.data.type === "ready") resolve();
        else if (e.data.type === "error") reject(new Error(e.data.message));
        else if (e.data.type === "hands") {
          this.pending?.(e.data.hands);
          this.pending = null;
        }
      };
    });
    this.worker.postMessage({ type: "init" });
  }

  detect = (bitmap: ImageBitmap, t: number): Promise<[number, number][][]> =>
    new Promise((resolve) => {
      this.pending = resolve;
      this.worker.postMessage({ type: "frame", bitmap, t }, [bitmap]);
    });

  terminate() {
    this.worker.terminate();
  }
}

export function TrackingPage({ repo, active, sessionId, timerScramble, holdMs }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const camera = useRef<CameraHandle | undefined>(undefined);
  const loop = useRef<FrameLoop | undefined>(undefined);
  const reader = useMemo(() => new FrameReader(), []);
  const observer = useMemo(() => new FaceObserver(4), []);
  const cube = useRef<CubeViewHandle>(null);
  const hands = useRef<HandTracker | null>(null);
  const lastHands = useRef<[number, number][][]>([]);
  const handsBusy = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const [calibration] = useState(loadCalibration);
  const [cameraOn, setCameraOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("free");
  const [startFrom, setStartFrom] = useState<"solved" | "timer">("solved");
  const [useHands, setUseHands] = useState(false);
  const [autoLocate, setAutoLocate] = useState(false);
  const [record, setRecord] = useState(false);
  const [guidedAlg, setGuidedAlg] = useState(GUIDED_ALGS.find((a) => a.alg === "R U R' U R U2 R'")?.alg ?? "R U R' U'");
  const [setup, setSetup] = useState("");
  const [running, setRunning] = useState(false);
  const [decoded, setDecoded] = useState<{ best: DecodedMove[]; confirmed: DecodedMove[] }>({ best: [], confirmed: [] });
  const [result, setResult] = useState<string | null>(null);
  const [lastVideo, setLastVideo] = useState<Blob | null>(null);
  const [lastSolve, setLastSolve] = useState<{ id: string; scramble: string; start: StickerState } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const decoder = useRef<MoveDecoder | null>(null);
  const observations = useRef<{ t: number; face: Observation }[]>([]);
  const t0 = useRef(0);
  const applied = useRef(0);
  const runs = useLiveQuery(() => repo.listTrackingRuns(), [repo]);
  const calibrated = isCalibrated(calibration.global);

  // --- camera -------------------------------------------------------------

  const stopCamera = useCallback(() => {
    loop.current?.stop();
    closeCamera(camera.current);
    camera.current = undefined;
    hands.current?.terminate();
    hands.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (!active) stopCamera();
    return stopCamera;
  }, [active, stopCamera]);

  const startCamera = async () => {
    try {
      camera.current = await openCamera(video.current!, { width: 1280, height: 720, frameRate: 30 });
      await lockExposureAndWhiteBalance(camera.current.track);
      loop.current = new FrameLoop(camera.current.video, (now) => onFrame(now));
      loop.current.start();
      setCameraOn(true);
    } catch (e) {
      setMessage(`Não foi possível abrir a câmera: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useEffect(() => {
    reader.setAuto(autoLocate);
  }, [reader, autoLocate]);
  useEffect(() => () => reader.dispose(), [reader]);

  useEffect(() => {
    if (!useHands || !cameraOn) return;
    const tracker = new HandTracker();
    hands.current = tracker;
    tracker.ready.catch((e) => {
      setMessage(`Detecção de mãos indisponível (${e.message}). Rode "npm run setup".`);
      setUseHands(false);
    });
    return () => {
      tracker.terminate();
      hands.current = null;
      lastHands.current = [];
    };
  }, [useHands, cameraOn]);

  // --- per frame ----------------------------------------------------------

  const live = useRef({ running });
  live.current = { running };

  function onFrame(now: number) {
    const v = camera.current?.video;
    if (!v) return;
    if (hands.current && !handsBusy.current) {
      handsBusy.current = true;
      createImageBitmap(v)
        .then((bmp) => hands.current?.detect(bmp, now) ?? [])
        .then((h) => (lastHands.current = h))
        .catch(() => undefined)
        .finally(() => (handsBusy.current = false));
    }
    const reading = reader.read(v, now, DEFAULT_GUIDE);
    const covered = handCovered(reading, lastHands.current, v, DEFAULT_GUIDE.sampleFrac);
    const readings: Reading[] = reading.labs
      ? reading.labs.map((lab, i) =>
          covered[i] || !isCalibrated(calibration.global) ? "?" : classify(lab, referencesFor(calibration, i, true)!, "de76", DEFAULT_LIMITS.de76).color,
        )
      : Array(9).fill("?");
    if (overlay.current) drawReading(overlay.current, v, reading, readings, { covered });
    if (!live.current.running || !decoder.current) return;
    const obs = observer.push(readings);
    if (!obs) return;
    const t = performance.now() - t0.current;
    observations.current.push({ t, face: obs });
    decoder.current.observe(obs, t);
    const confirmed = decoder.current.confirmed();
    // Show only confirmed moves on the 3D cube.
    for (; applied.current < confirmed.length; applied.current++) cube.current?.addMove(confirmed[applied.current].m);
    setDecoded({ best: decoder.current.best(), confirmed });
  }

  // --- runs ---------------------------------------------------------------

  // Redraws the 3D cube with a whole sequence (after the final state filled in the last moves).
  const showMoves = (moves: DecodedMove[]) => {
    cube.current?.reset();
    for (const m of moves) cube.current?.addMove(m.m);
    applied.current = moves.length;
    setDecoded({ best: moves, confirmed: moves });
  };

  const begin = (scramble: string) => {
    setSetup(scramble);
    cube.current?.reset();
    applied.current = 0;
    observer.reset();
    observations.current = [];
    decoder.current = new MoveDecoder(stateOf(scramble));
    setDecoded({ best: [], confirmed: [] });
    setResult(null);
    t0.current = performance.now();
    if (record && camera.current) {
      chunks.current = [];
      try {
        const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
        const r = new MediaRecorder(camera.current.stream, mimeType ? { mimeType } : undefined);
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.start(1000);
        recorder.current = r;
      } catch (e) {
        recorder.current = null;
        setMessage(`Gravação de vídeo indisponível neste navegador (${e instanceof Error ? e.message : String(e)}); o rastreamento continua sem vídeo.`);
      }
    }
    setRunning(true);
  };

  const stopRecording = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const r = recorder.current;
      recorder.current = null;
      if (!r) return resolve(null);
      r.onstop = () => resolve(new Blob(chunks.current, { type: r.mimeType || "video/webm" }));
      r.stop();
    });

  const finishGuided = async () => {
    setRunning(false);
    const expected = new Alg(guidedAlg).experimentalLeafMoves();
    const expectedMoves = [...expected].map((m) => m.toString());
    const best = decoder.current?.best() ?? [];
    showMoves(best);
    const got = best.map((m) => m.m);
    const accuracy = moveAccuracy(got, expectedMoves);
    await repo.addTrackingRun({ mode: "guided", expected: expectedMoves, decoded: got, accuracy, observations: observations.current });
    setLastVideo(await stopRecording());
    setResult(`Acerto por giro: ${(accuracy * 100).toFixed(0)}% · esperado ${expectedMoves.join(" ")} · decodificado ${got.join(" ") || "(nada)"}`);
  };

  const finishFree = async () => {
    setRunning(false);
    await repo.addTrackingRun({ mode: "free", decoded: decoder.current?.best().map((m) => m.m) ?? [], observations: observations.current });
    setLastVideo(await stopRecording());
  };

  // Timed solve with the camera.
  const timer = useTimer({
    config: { inspection: false, holdMs },
    enabled: active && mode === "solve" && cameraOn && calibrated && !!timerScramble,
    onComplete: async (r) => {
      setRunning(false);
      // The cube is solved when the timer stops (unless DNF): use it as the final observation.
      const d = decoder.current;
      let decodedMoves = d?.best() ?? [];
      if (d && r.penalty !== "dnf") {
        decodedMoves = d.finish(solvedState(), r.timeMs) ?? [...decodedMoves, ...((await solveGap(d.bestState(), r.timeMs)) ?? [])];
      }
      const moves = decodedMoves.map((m) => ({ m: m.m, t: m.t, inferred: m.inferred }));
      const scramble = timerScramble!;
      const solve = await repo.addSolve({
        sessionId,
        scramble,
        timeMs: r.timeMs,
        penalty: r.penalty,
        source: "camera",
        trackingMode: "realtime",
        moves,
      });
      setLastSolve({ id: solve.id, scramble, start: stateOf(scramble) });
      setLastVideo(await stopRecording());
      showMoves(decodedMoves);
      const inferred = moves.filter((m) => m.inferred).length;
      setResult(`Solve salvo no histórico com ${moves.length} giros decodificados ao vivo${inferred ? ` (${inferred} inferidos no fim)` : ""}.`);
    },
    onDiscard: () => undefined,
  });
  useEffect(() => {
    if (mode === "solve" && timer.state.phase === "running" && !running && timerScramble) begin(timerScramble);
    if (timer.state.phase === "cancelled" && running) {
      setRunning(false);
      stopRecording();
    }
    // Runs on timer transitions only.
  }, [timer.state.phase]);

  const reconstruct = async () => {
    if (!lastVideo || !lastSolve) return;
    setProgress(0);
    const tracker = useHands ? new HandTracker() : null;
    try {
      await tracker?.ready;
      const moves = await decodeVideo({
        blob: lastVideo,
        start: lastSolve.start,
        end: solvedState(),
        calibration,
        guide: DEFAULT_GUIDE,
        hands: tracker?.detect,
        onProgress: setProgress,
      });
      showMoves(moves);
      const timed = moves.map((m) => ({ m: m.m, t: m.t, inferred: m.inferred }));
      const analysis = analyzeSolve(lastSolve.scramble, timed);
      await repo.setReconstruction(
        lastSolve.id,
        timed,
        analysis.stages.map((s) => ({ name: s.name, moveCount: s.moveCount, rotations: s.rotations, startMs: s.startMs, endMs: s.endMs, recognitionMs: s.recognitionMs, caseId: s.caseId })),
      );
      setResult(`Reconstruído do vídeo: ${moves.length} giros${analysis.solved ? ", termina resolvido" : ", não termina resolvido"}. Veja a análise no histórico.`);
    } catch (e) {
      setResult(`Falha na reconstrução: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      tracker?.terminate();
      setProgress(null);
    }
  };

  const downloadVideo = () => {
    if (!lastVideo) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(lastVideo);
    a.download = `rastreamento-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.webm`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportRuns = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(runs ?? [], null, 1)], { type: "application/json" }));
    a.download = "rastreamento-dataset.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const guidedRuns = (runs ?? []).filter((r) => r.mode === "guided" && r.accuracy !== undefined);
  const meanAccuracy = guidedRuns.length ? guidedRuns.reduce((a, r) => a + r.accuracy!, 0) / guidedRuns.length : null;

  return (
    <div className="timer-layout tracking">
      <div className="timer-main">
        <div className="stage">
          <video ref={video} className="mirror" muted playsInline />
          <canvas ref={overlay} className="overlay" />
          {!cameraOn && (
            <div className="stage-cover">
              <button type="button" className="selected" onClick={startCamera} disabled={!calibrated}>
                Abrir câmera
              </button>
            </div>
          )}
        </div>
        {!calibrated && <p className="error">Calibre as cores na aba Câmera primeiro.</p>}
        {message && <p className="muted">{message}</p>}
        <p className="muted">
          Experimental. Segure o cubo com o centro verde para a câmera e o branco em cima, sem girar o cubo inteiro, e gire devagar
          (cerca de 1 giro por segundo). A câmera vê só a face da frente: giros de B aparecem quando o efeito deles chega à frente.
        </p>
        <section className="panel">
          <h2>Giros decodificados</h2>
          <p className="moves-line">
            <span>{decoded.confirmed.map((m) => m.m).join(" ")}</span>{" "}
            <span className="muted">{decoded.best.slice(decoded.confirmed.length).map((m) => m.m).join(" ")}</span>
          </p>
          {result && <p>{result}</p>}
          {progress !== null && <p className="muted">Reconstruindo do vídeo… {Math.round(progress * 100)}%</p>}
          <div className="row">
            {lastVideo && (
              <button type="button" onClick={downloadVideo}>
                Baixar vídeo
              </button>
            )}
            {lastVideo && lastSolve && mode === "solve" && (
              <button type="button" onClick={reconstruct} disabled={progress !== null}>
                Reconstruir do vídeo
              </button>
            )}
          </div>
        </section>
      </div>

      <aside className="timer-side">
        <section className="panel">
          <h2>Modo</h2>
          <div className="row">
            {(
              [
                ["free", "Livre"],
                ["guided", "Guiado"],
                ["solve", "Solve com câmera"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={mode === id ? "selected" : ""} disabled={running} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={useHands} onChange={(e) => setUseHands(e.target.checked)} />
            Ignorar adesivos cobertos pelas mãos (MediaPipe)
          </label>
          <label>
            <input type="checkbox" checked={autoLocate} onChange={(e) => setAutoLocate(e.target.checked)} />
            Localizar a face automaticamente (OpenCV)
          </label>
          <label>
            <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} disabled={running} />
            Gravar vídeo
          </label>

          {mode === "free" && (
            <>
              <label>
                Começar do
                <select value={startFrom} onChange={(e) => setStartFrom(e.target.value as "solved" | "timer")} disabled={running}>
                  <option value="solved">cubo resolvido</option>
                  <option value="timer" disabled={!timerScramble}>
                    scramble do timer
                  </option>
                </select>
              </label>
              <div className="row">
                <button type="button" className="selected" disabled={!cameraOn || running} onClick={() => begin(startFrom === "timer" && timerScramble ? timerScramble : "")}>
                  Iniciar
                </button>
                <button type="button" disabled={!running} onClick={finishFree}>
                  Parar
                </button>
              </div>
            </>
          )}

          {mode === "guided" && (
            <>
              <p className="muted">Comece com o cubo resolvido e execute o algoritmo devagar.</p>
              <select value={guidedAlg} onChange={(e) => setGuidedAlg(e.target.value)} disabled={running} aria-label="Algoritmo">
                {GUIDED_ALGS.map((a) => (
                  <option key={a.label} value={a.alg}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p>
                <code className="alg-code">{guidedAlg}</code>
              </p>
              <div className="row">
                <button type="button" className="selected" disabled={!cameraOn || running} onClick={() => begin("")}>
                  Iniciar
                </button>
                <button type="button" disabled={!running} onClick={finishGuided}>
                  Concluir
                </button>
              </div>
            </>
          )}

          {mode === "solve" && (
            <>
              <p className="muted">
                Aplique o scramble do timer, segure o espaço, solte e resolva. Qualquer tecla para.{" "}
                {!timerScramble && "Gere um scramble na aba Timer."}
              </p>
              {timerScramble && <code className="alg-code">{timerScramble}</code>}
              <div className={`timer-display phase-${timer.state.phase} compact`}>
                <div className="time">{formatTime(timer.elapsedMs, timer.state.phase === "running" ? 1 : 2)}</div>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Cubo decodificado</h2>
          <CubeView setup={setup} ref={cube} />
        </section>

        <section className="panel">
          <div className="row spread">
            <h2>Dataset de rastreamento</h2>
            <button type="button" onClick={exportRuns} disabled={!runs?.length}>
              Exportar JSON
            </button>
          </div>
          <p className="muted">
            {runs?.length ?? 0} sessões salvas · acerto médio no guiado: {meanAccuracy === null ? "-" : `${(meanAccuracy * 100).toFixed(0)}%`}
          </p>
          <ul className="runs">
            {guidedRuns.slice(0, 8).map((r) => (
              <li key={r.id}>
                {(r.accuracy! * 100).toFixed(0)}% · <code>{r.expected?.join(" ")}</code>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
