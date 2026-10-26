import type { WeavingEngine } from '../engine/weavingEngine';

const CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

/** First container/codec this browser can record, or null (then the UI shows a fallback message). */
export function pickVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export const videoExt = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm');

/**
 * Records the Story Film: the artwork (ground + ink + live strokes + symbols) plus the film overlay
 * (two-sided subtitles, event ticker, title/end cards — see export/film.ts). The engine copies each
 * frame into a private canvas *before* drawing signal marks, so the video never contains the camera
 * preview, controls, data panel, marks or any microphone sound. Stays in memory on this device.
 */
export class ArtRecorder {
  readonly canvas = document.createElement('canvas');
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer: number | null = null;
  private stopping: Promise<Blob | null> | null = null;
  readonly mime = pickVideoMime();
  /** Safety cap so a forgotten recording cannot exhaust memory (~190 MB at 2.5 Mbps). */
  readonly maxSec = 600;
  onAutoStop: () => void = () => {};

  constructor(private engine: WeavingEngine) {
    this.canvas.width = 1600;
    this.canvas.height = 900;
  }

  get supported() {
    return !!this.mime;
  }
  get recording() {
    return !!this.rec && this.rec.state === 'recording';
  }
  get elapsed() {
    return this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  start(): boolean {
    if (!this.mime || this.recording || this.stopping) return false;
    this.chunks = [];
    try {
    this.engine.recordTarget = this.canvas;
    this.stream = this.canvas.captureStream(30);
    this.rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 2_500_000 });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.startedAt = performance.now();
    this.timer = window.setTimeout(() => this.onAutoStop(), this.maxSec * 1000);
    return true;
    } catch {
      this.engine.recordTarget = null;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.rec = null;
      return false;
    }
  }

  stop(): Promise<Blob | null> {
    if (this.stopping) return this.stopping;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const rec = this.rec;
    this.engine.recordTarget = null;
    if (!rec) return Promise.resolve(null);
    this.stopping = new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.rec = null;
        this.stopping = null;
        rec.ondataavailable = rec.onstop = rec.onerror = null;
        const type = (this.mime ?? 'video/webm').split(';')[0];
        const blob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        this.chunks = [];
        resolve(blob);
      };
      const timeout = window.setTimeout(finish, 5000);
      rec.onstop = finish;
      rec.onerror = finish;
      try { if (rec.state !== 'inactive') rec.stop(); } catch { finish(); }
    });
    return this.stopping;
  }
}
