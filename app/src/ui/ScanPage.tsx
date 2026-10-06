// Phase 2: scan the real cube with the webcam (F2.1–F2.5).
// Calibrate the 6 colors per guide position, scan the 6 faces guided by their center color, assign colors
// with exactly 9 per color, validate the state, show it in 3D and hand it to the timer.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaceletCube, type Face } from "../analysis/facelets";
import { type CameraHandle, FrameLoop, closeCamera, lockExposureAndWhiteBalance, openCamera } from "../camera/camera";
import { CubeView } from "../renderer/CubeView";
import { assignColors } from "../vision/assign";
import {
  COLORS,
  COLOR_INFO,
  type CubeColor,
  DEFAULT_LIMITS,
  FaceVoter,
  type Reading,
  type StoredCalibration,
  classify,
  isCalibrated,
  meanLab,
  referencesFor,
} from "../vision/classifier";
import { loadCalibration, saveCalibration } from "../vision/calibrationStore";
import type { Lab } from "../vision/color";
import { type CubeNet, SCAN_ORDER, STANDARD_SCHEME, analyzeNet, describeProblem, netOf, setupAlgFor } from "../vision/cubeNet";
import { FrameReader, drawReading } from "../vision/frameReader";
import { DEFAULT_GUIDE } from "../vision/sampler";
import { NetView } from "./NetView";

const CAL_FRAMES = 15;

interface Props {
  active: boolean;
  timerScramble: string | null;
  onUseState: (setupAlg: string) => void;
}

export function ScanPage({ active, timerScramble, onUseState }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const camera = useRef<CameraHandle | undefined>(undefined);
  const loop = useRef<FrameLoop | undefined>(undefined);
  const reader = useMemo(() => new FrameReader(), []);
  const voter = useMemo(() => new FaceVoter(10, 0.8), []);
  const recent = useRef<Lab[][]>([]);
  const listeners = useRef(new Set<(labs: Lab[]) => void>());

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraMsg, setCameraMsg] = useState<string | null>(null);
  const [guideFrac, setGuideFrac] = useState(DEFAULT_GUIDE.sizeFrac);
  const [autoLocate, setAutoLocate] = useState(false);
  const [calibration, setCalibration] = useState(loadCalibration);
  const [live, setLive] = useState<{ colors: Reading[]; accepted: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const [captured, setCaptured] = useState<Partial<Record<Face, Lab[]>>>({});
  const [net, setNet] = useState<CubeNet | null>(null);
  const [setupAlg, setSetupAlg] = useState<string | null>(null);
  // Scanning starts on request: right after calibrating, the solved green face is still in front of the camera.
  const [started, setStarted] = useState(false);

  const calibrated = isCalibrated(calibration.global);
  const scanning = started && calibrated && step < SCAN_ORDER.length && !net;

  // --- camera -------------------------------------------------------------

  const stopCamera = useCallback(() => {
    loop.current?.stop();
    closeCamera(camera.current);
    camera.current = undefined;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (!active) stopCamera();
    return stopCamera;
  }, [active, stopCamera]);

  useEffect(() => {
    reader.setAuto(autoLocate);
  }, [reader, autoLocate]);
  useEffect(() => () => reader.dispose(), [reader]);

  const startCamera = async () => {
    try {
      camera.current = await openCamera(video.current!, { width: 1280, height: 720, frameRate: 30 });
      const lock = await lockExposureAndWhiteBalance(camera.current.track);
      setCameraMsg(
        lock.exposure === "locked" || lock.whiteBalance === "locked"
          ? "Exposição/WB travados."
          : "Esta câmera não permite travar exposição e WB no navegador: evite mudar a luz durante o escaneamento.",
      );
      loop.current = new FrameLoop(camera.current.video, (now) => onFrame(now));
      loop.current.start();
      setCameraOn(true);
    } catch (e) {
      setCameraMsg(`Não foi possível abrir a câmera: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // --- per frame ----------------------------------------------------------

  const state = useRef({ calibration, guideFrac, scanning });
  state.current = { calibration, guideFrac, scanning };

  function onFrame(now: number) {
    const v = camera.current?.video;
    if (!v) return;
    const guide = { ...DEFAULT_GUIDE, sizeFrac: state.current.guideFrac };
    const reading = reader.read(v, now, guide);
    const labs = reading.labs;
    let colors: Reading[] | null = null;
    let accepted = false;
    if (labs) {
      listeners.current.forEach((fn) => fn(labs));
      recent.current = [...recent.current, labs].slice(-voter.windowSize);
      const cal = state.current.calibration;
      if (isCalibrated(cal.global)) {
        voter.push(labs.map((lab, i) => classify(lab, referencesFor(cal, i, true)!, "de76", DEFAULT_LIMITS.de76).color));
        const voted = voter.result();
        accepted = voted.accepted;
        colors = voted.colors;
      }
    } else {
      voter.push(Array(9).fill("?")); // face not found: nothing can be accepted
    }
    if (overlay.current) drawReading(overlay.current, v, reading, colors, { accepted });
    setLive(colors ? { colors, accepted } : null);
  }

  // --- calibration --------------------------------------------------------

  const calibrate = async (color: CubeColor) => {
    const frames = await new Promise<Lab[][]>((resolve) => {
      const got: Lab[][] = [];
      const fn = (labs: Lab[]) => {
        got.push(labs);
        if (got.length >= CAL_FRAMES) {
          listeners.current.delete(fn);
          resolve(got);
        }
      };
      listeners.current.add(fn);
    });
    setCalibration((prev) => {
      const next: StoredCalibration = {
        global: { ...prev.global, [color]: meanLab(frames.flat()) },
        cells: { ...prev.cells, [color]: Array.from({ length: 9 }, (_, i) => meanLab(frames.map((f) => f[i]))) },
      };
      saveCalibration(next);
      return next;
    });
    voter.reset();
  };

  // --- scanning -----------------------------------------------------------

  const expected = SCAN_ORDER[step];
  const capture = useCallback(() => {
    if (!expected || recent.current.length === 0) return;
    const labs = Array.from({ length: 9 }, (_, i) => meanLab(recent.current.map((f) => f[i])));
    setCaptured((prev) => ({ ...prev, [expected.face]: labs }));
    voter.reset();
    recent.current = [];
    setStep((s) => s + 1);
  }, [expected, voter]);

  // Auto-capture: stable face whose center is the expected one.
  useEffect(() => {
    if (scanning && live?.accepted && expected && live.colors[4] === expected.center) capture();
  }, [scanning, live, expected, capture]);

  // All faces captured: assign colors (9 per color) and build the net.
  useEffect(() => {
    if (net || SCAN_ORDER.some(({ face }) => !captured[face])) return;
    const samples = SCAN_ORDER.flatMap(({ face }) =>
      captured[face]!.map((lab, i) => ({ lab, refs: referencesFor(calibration, i, true)! })),
    );
    const colors = assignColors(samples);
    const built = {} as CubeNet;
    SCAN_ORDER.forEach(({ face }, f) => (built[face] = colors.slice(f * 9, f * 9 + 9)));
    setNet(built);
  }, [captured, net, calibration]);

  const analysis = useMemo(() => (net ? analyzeNet(net) : null), [net]);
  useEffect(() => {
    setSetupAlg(null);
    if (net && analysis && analysis.problems.length === 0) setupAlgFor(net).then(setSetupAlg);
  }, [net, analysis]);

  const restart = () => {
    setStep(0);
    setCaptured({});
    setNet(null);
    voter.reset();
    recent.current = [];
    setStarted(true);
  };

  const timerCheck = useMemo(() => {
    if (!net || !timerScramble) return null;
    const expectedNet = netOf(FaceletCube.solved().apply(timerScramble), STANDARD_SCHEME);
    let diff = 0;
    for (const { face } of SCAN_ORDER) for (let i = 0; i < 9; i++) if (expectedNet[face][i] !== net[face][i]) diff++;
    return diff;
  }, [net, timerScramble]);

  return (
    <div className="timer-layout scan">
      <div className="timer-main">
        <div className="stage">
          <video ref={video} className="mirror" muted playsInline />
          <canvas ref={overlay} className="overlay" />
          {!cameraOn && (
            <div className="stage-cover">
              <button type="button" className="selected" onClick={startCamera}>
                Abrir câmera
              </button>
            </div>
          )}
        </div>
        {cameraMsg && <p className="muted">{cameraMsg}</p>}
        <div className="row">
          <label>
            <input type="checkbox" checked={autoLocate} onChange={(e) => setAutoLocate(e.target.checked)} />
            Localizar a face automaticamente (OpenCV)
          </label>
          {!autoLocate && (
            <label>
              Tamanho do guia
              <input type="range" min={30} max={85} value={guideFrac * 100} onChange={(e) => setGuideFrac(Number(e.target.value) / 100)} />
            </label>
          )}
        </div>
      </div>

      <aside className="timer-side">
        <section className="panel">
          <h2>1 · Calibração {calibrated && <span className="ok-text">✓</span>}</h2>
          <p className="muted">Com o cubo resolvido, encaixe cada face no guia e clique na cor dela. Refaça se a luz mudar.</p>
          <div className="row">
            {COLORS.map((c) => (
              <button key={c} type="button" disabled={!cameraOn} onClick={() => calibrate(c)} style={{ borderColor: COLOR_INFO[c].swatch }}>
                {calibration.cells[c] ? "✓ " : ""}
                {COLOR_INFO[c].name}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>2 · Escanear</h2>
          {!calibrated ? (
            <p className="muted">Calibre as 6 cores primeiro.</p>
          ) : !started ? (
            <>
              <p className="muted">Embaralhe o cubo (ou aplique o scramble do timer) e comece pela face verde.</p>
              <button type="button" className="selected" disabled={!cameraOn} onClick={restart}>
                Começar a escanear
              </button>
            </>
          ) : scanning ? (
            <>
              <p>
                <strong>
                  Face {step + 1} de 6: centro {COLOR_INFO[expected.center].name.toLowerCase()} para a câmera, {COLOR_INFO[expected.top].name.toLowerCase()} em
                  cima.
                </strong>
              </p>
              <p className="muted">
                A captura é automática quando a leitura estabiliza.
                {live && live.colors[4] !== "?" && live.colors[4] !== expected.center && ` O centro lido é ${COLOR_INFO[live.colors[4] as CubeColor].name.toLowerCase()}.`}
              </p>
              <div className="row">
                <button type="button" onClick={capture} disabled={!cameraOn}>
                  Capturar agora
                </button>
                <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  Voltar uma face
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={restart}>
              Escanear de novo
            </button>
          )}
          <NetView
            net={net ?? {}}
            onChange={(face, i, color) => setNet((n) => (n ? { ...n, [face]: n[face].map((c, k) => (k === i ? color : c)) } : n))}
          />
        </section>

        {net && analysis && (
          <section className="panel">
            <h2>3 · Resultado</h2>
            {analysis.problems.length ? (
              <ul className="tips">
                {analysis.problems.map((p, i) => (
                  <li key={i} className="tip tip-warn">
                    {describeProblem(p)}
                  </li>
                ))}
                <li className="tip">
                  <span className="muted">Clique nos adesivos da planificação para corrigir, ou escaneie de novo.</span>
                </li>
              </ul>
            ) : (
              <>
                <p className="ok-text">Estado válido.</p>
                {setupAlg && <CubeView setup={setupAlg} />}
                {timerCheck !== null && (
                  <p className={timerCheck === 0 ? "ok-text" : "error"}>
                    {timerCheck === 0
                      ? "O cubo está exatamente no scramble do timer."
                      : `O cubo difere do scramble do timer em ${timerCheck} adesivos: confira o scramble.`}
                  </p>
                )}
                <button type="button" className="selected" disabled={!setupAlg} onClick={() => setupAlg && onUseState(setupAlg)}>
                  Usar este estado no timer
                </button>
              </>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
