import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

const REMOTE_MODEL = (v: string) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task`;

export interface PoseResult {
  poses: NormalizedLandmark[][];
  /** performance.now() timestamp of the analysed frame */
  t: number;
  inferenceMs: number;
}

async function localAssetExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    // Vite's dev server answers unknown paths with index.html, so reject HTML.
    return res.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

/**
 * Wraps MediaPipe Pose Landmarker (numPoses = 2). Detection runs on its own timer at
 * `targetFps` (default 15), fully decoupled from the 60 fps render loop.
 */
export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private timer: number | null = null;
  private lastVideoTime = -1;
  delegate: 'GPU' | 'CPU' = 'GPU';
  modelSource = '';
  fps = 0;
  private frameTimes: number[] = [];

  constructor(
    private targetFps = 15,
    private variant: 'lite' | 'full' = 'lite',
  ) {}

  async init(onStatus: (s: string) => void) {
    onStatus('Loading MediaPipe runtime…');
    const wasmBase = new URL('mediapipe/wasm', document.baseURI).href;
    const vision = await FilesetResolver.forVisionTasks(wasmBase);

    const localModel = new URL(`models/pose_landmarker_${this.variant}.task`, document.baseURI).href;
    const modelAssetPath = (await localAssetExists(localModel)) ? localModel : REMOTE_MODEL(this.variant);
    this.modelSource = modelAssetPath === localModel ? 'local' : 'remote';
    onStatus(`Loading pose model (${this.variant}, ${this.modelSource})…`);

    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      this.landmarker = await make('GPU');
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('[the-babel] GPU delegate failed, falling back to CPU', err);
      this.landmarker = await make('CPU');
      this.delegate = 'CPU';
    }
    onStatus('');
  }

  start(video: HTMLVideoElement, onResult: (r: PoseResult) => void) {
    const interval = 1000 / this.targetFps;
    const tick = () => {
      const started = performance.now();
      if (this.landmarker && video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime;
        try {
          const res = this.landmarker.detectForVideo(video, started);
          const done = performance.now();
          this.frameTimes.push(done);
          while (this.frameTimes.length && done - this.frameTimes[0] > 1000) this.frameTimes.shift();
          this.fps = this.frameTimes.length;
          onResult({ poses: res.landmarks, t: started, inferenceMs: done - started });
        } catch (err) {
          console.error('[the-babel] pose detection error', err);
        }
      }
      const spent = performance.now() - started;
      this.timer = window.setTimeout(tick, Math.max(0, interval - spent));
    };
    tick();
  }

  stop() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose() {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }
}
