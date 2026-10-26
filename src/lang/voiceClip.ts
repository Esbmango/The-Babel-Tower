/**
 * Records one short voice clip from the microphone (push-to-talk) for cloud transcription.
 * The clip lives in memory only; it is uploaded once (with consent) and then discarded.
 * The microphone track is stopped as soon as the clip ends.
 */
const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function pickAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export class VoiceClip {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer: number | null = null;
  private cancelled = false;
  private stopping: Promise<{ blob: Blob; seconds: number } | null> | null = null;
  readonly maxSec = 15;
  onAutoStop: () => void = () => {};

  get recording() {
    return !!this.rec && this.rec.state === 'recording';
  }
  get elapsed() {
    return this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async start() {
    const mime = pickAudioMime();
    if (!mime) throw new Error('Audio recording is not supported in this browser');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (this.cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;
    this.chunks = [];
    try {
      this.rec = new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.startedAt = performance.now();
    this.timer = window.setTimeout(() => this.onAutoStop(), this.maxSec * 1000);
    } catch (err) {
      this.release();
      throw err;
    }
  }

  stop(): Promise<{ blob: Blob; seconds: number } | null> {
    this.cancelled = true;
    if (this.stopping) return this.stopping;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const rec = this.rec;
    const seconds = this.elapsed;
    if (!rec || rec.state === 'inactive') { this.release(); return Promise.resolve(null); }
    this.stopping = new Promise((resolve) => {
      rec.onstop = () => {
        this.release();
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        resolve(this.chunks.length ? { blob: new Blob(this.chunks, { type }), seconds } : null);
        this.chunks = [];
      };
      rec.stop();
    });
    return this.stopping;
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}
