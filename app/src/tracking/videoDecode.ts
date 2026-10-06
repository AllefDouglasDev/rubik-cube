// F3.6: post-solve reconstruction. Plays a recorded solve slowly through the same pipeline as live
// tracking (sampler → classifier → hand mask → observer → decoder), with more time per frame.
import type { StoredCalibration } from "../vision/classifier";
import { DEFAULT_LIMITS, classify, referencesFor } from "../vision/classifier";
import { coveredCells } from "../vision/handMask";
import { GuideSampler, type Guide } from "../vision/sampler";
import { type DecodedMove, MoveDecoder } from "./decoder";
import { solveGap } from "./fill";
import { FaceObserver } from "./observer";
import type { StickerState } from "./stickerModel";

export interface VideoDecodeOptions {
  blob: Blob;
  start: StickerState;
  // Known final state (solved at the end of a timed solve), used to recover moves never seen.
  end?: StickerState;
  calibration: StoredCalibration;
  guide: Guide;
  playbackRate?: number;
  hands?: (bitmap: ImageBitmap, t: number) => Promise<[number, number][][]>;
  onProgress?: (fraction: number) => void;
}

export async function decodeVideo(o: VideoDecodeOptions): Promise<DecodedMove[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = URL.createObjectURL(o.blob);
  const sampler = new GuideSampler();
  const observer = new FaceObserver(3);
  const decoder = new MoveDecoder(o.start, { beamWidth: 48 });
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("não foi possível ler o vídeo gravado"));
    });
    video.playbackRate = o.playbackRate ?? 0.5;
    let hands: [number, number][][] = [];
    let handsBusy = false;
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        const t = meta.mediaTime * 1000;
        if (o.hands && !handsBusy) {
          handsBusy = true;
          createImageBitmap(video)
            .then((bmp) => o.hands!(bmp, t))
            .then((h) => (hands = h))
            .finally(() => (handsBusy = false));
        }
        const labs = sampler.read(video, o.guide);
        const covered = coveredCells(hands, video.videoWidth, video.videoHeight, o.guide);
        const readings = labs.map((lab, i) =>
          covered[i] ? "?" : classify(lab, referencesFor(o.calibration, i, true)!, "de76", DEFAULT_LIMITS.de76).color,
        );
        const obs = observer.push(readings);
        if (obs) decoder.observe(obs, t);
        if (Number.isFinite(video.duration)) o.onProgress?.(video.currentTime / video.duration);
        if (!video.ended) video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.play();
    });
    if (!o.end) return decoder.best();
    const t = (video.duration || 0) * 1000;
    return decoder.finish(o.end, t) ?? [...decoder.best(), ...((await solveGap(decoder.bestState(), t)) ?? [])];
  } finally {
    URL.revokeObjectURL(video.src);
  }
}
