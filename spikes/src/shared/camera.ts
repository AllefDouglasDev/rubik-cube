// Webcam capture, introspection and exposure/white-balance locking.
// The Image Capture constraints (exposureMode, whiteBalanceMode…) are not in the TS DOM lib, so they are typed here.

export interface CameraRequest {
  width: number;
  height: number;
  frameRate: number;
  deviceId?: string;
}

type ControlMode = "none" | "manual" | "single-shot" | "continuous";

interface ImageCaptureCapabilities extends MediaTrackCapabilities {
  exposureMode?: ControlMode[];
  whiteBalanceMode?: ControlMode[];
  focusMode?: ControlMode[];
  exposureTime?: MediaSettingsRange;
  colorTemperature?: MediaSettingsRange;
}

interface ImageCaptureSettings extends MediaTrackSettings {
  exposureMode?: ControlMode;
  whiteBalanceMode?: ControlMode;
  exposureTime?: number;
  colorTemperature?: number;
}

export interface CameraHandle {
  stream: MediaStream;
  track: MediaStreamTrack;
  video: HTMLVideoElement;
}

export interface LockResult {
  exposure: "locked" | "unsupported" | string;
  whiteBalance: "locked" | "unsupported" | string;
  settingsAfter: ImageCaptureSettings;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export async function openCamera(video: HTMLVideoElement, req: CameraRequest): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      deviceId: req.deviceId ? { exact: req.deviceId } : undefined,
      width: { ideal: req.width },
      height: { ideal: req.height },
      frameRate: { ideal: req.frameRate },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return { stream, track: stream.getVideoTracks()[0], video };
}

export function closeCamera(handle: CameraHandle | undefined): void {
  handle?.stream.getTracks().forEach((t) => t.stop());
  if (handle) handle.video.srcObject = null;
}

export function describeTrack(track: MediaStreamTrack) {
  const capabilities = (track.getCapabilities?.() ?? {}) as ImageCaptureCapabilities;
  const settings = track.getSettings() as ImageCaptureSettings;
  return { label: track.label, settings, capabilities };
}

// Freezes exposure and white balance at their current values, when the camera exposes those controls.
export async function lockExposureAndWhiteBalance(track: MediaStreamTrack): Promise<LockResult> {
  const { capabilities, settings } = describeTrack(track);
  const result: LockResult = { exposure: "unsupported", whiteBalance: "unsupported", settingsAfter: settings };

  if (capabilities.exposureMode?.includes("manual")) {
    const constraint: Record<string, unknown> = { exposureMode: "manual" };
    if (settings.exposureTime !== undefined) constraint.exposureTime = settings.exposureTime;
    result.exposure = await apply(track, constraint);
  }
  if (capabilities.whiteBalanceMode?.includes("manual")) {
    const constraint: Record<string, unknown> = { whiteBalanceMode: "manual" };
    if (settings.colorTemperature !== undefined) constraint.colorTemperature = settings.colorTemperature;
    result.whiteBalance = await apply(track, constraint);
  }
  result.settingsAfter = track.getSettings() as ImageCaptureSettings;
  return result;
}

async function apply(track: MediaStreamTrack, constraint: Record<string, unknown>): Promise<string> {
  try {
    await track.applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] });
    return "locked";
  } catch (err) {
    return `error: ${(err as Error).message}`;
  }
}

// Calls `onFrame` for every frame the browser presents, and measures the real camera fps.
export class FrameLoop {
  private handle = 0;
  private running = false;
  private lastPresented = -1;
  readonly presentTimes: number[] = [];
  droppedFrames = 0;
  totalFrames = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onFrame: (now: number, meta: VideoFrameCallbackMetadata) => void,
  ) {}

  start(): void {
    this.running = true;
    const tick = (now: number, meta: VideoFrameCallbackMetadata) => {
      if (!this.running) return;
      if (this.lastPresented >= 0 && meta.presentedFrames > this.lastPresented + 1) {
        this.droppedFrames += meta.presentedFrames - this.lastPresented - 1;
      }
      this.lastPresented = meta.presentedFrames;
      this.totalFrames++;
      this.presentTimes.push(now);
      if (this.presentTimes.length > 240) this.presentTimes.shift();
      this.onFrame(now, meta);
      this.handle = this.video.requestVideoFrameCallback(tick);
    };
    this.handle = this.video.requestVideoFrameCallback(tick);
  }

  stop(): void {
    this.running = false;
    this.video.cancelVideoFrameCallback(this.handle);
  }

  // Frames per second over the last second.
  fps(): number {
    const t = this.presentTimes;
    if (t.length < 2) return 0;
    const last = t[t.length - 1];
    const recent = t.filter((x) => last - x <= 1000);
    if (recent.length < 2) return 0;
    return ((recent.length - 1) * 1000) / (last - recent[0]);
  }

  resetCounters(): void {
    this.droppedFrames = 0;
    this.totalFrames = 0;
  }
}
