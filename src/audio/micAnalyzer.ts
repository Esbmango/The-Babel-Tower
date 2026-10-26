import { estimatePitch, FeatureSmoother, NoiseFloor, pitchToNorm } from './audioFeatures';
import type { AudioFeatures } from '../types';

const BANDS: [number, number][] = [
  [40, 250], // low
  [250, 2000], // mid
  [2000, 8000], // high
];

/**
 * Real shared-microphone analysis with the Web Audio API.
 * The analyser is never connected to the speakers, and no audio is stored:
 * only per-frame features are computed and then discarded.
 */
export class MicAnalyzer {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private time = new Float32Array(2048);
  private freq = new Float32Array(1024);
  private floor = new NoiseFloor(-65);
  private bandFloors = BANDS.map(() => new NoiseFloor(-95));
  private smoother = new FeatureSmoother('mic');
  private binEdges: [number, number][] = [];
  private pitchTick = 0;
  private pitchHist: number[] = [];
  private cancelled = false;
  deviceLabel = '';

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    if (this.cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;
    this.deviceLabel = this.stream.getAudioTracks()[0]?.label ?? '';
    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.resume();
    if (this.cancelled) return;
    this.src = ctx.createMediaStreamSource(this.stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.5;
    this.src.connect(an); // analysis only — deliberately NOT connected to ctx.destination
    this.analyser = an;
    this.time = new Float32Array(an.fftSize);
    this.freq = new Float32Array(an.frequencyBinCount);

    // 32 log-spaced bins, 60 Hz – 10 kHz, for the spectrum view.
    const hzPerBin = ctx.sampleRate / an.fftSize;
    this.binEdges = Array.from({ length: 32 }, (_, i) => {
      const lo = 60 * Math.pow(10000 / 60, i / 32);
      const hi = 60 * Math.pow(10000 / 60, (i + 1) / 32);
      return [Math.max(1, Math.floor(lo / hzPerBin)), Math.max(1, Math.ceil(hi / hzPerBin))];
    });
  }

  get running() {
    return !!this.analyser;
  }

  update(dt: number): AudioFeatures {
    const an = this.analyser;
    const f = this.smoother.f;
    if (!an || !this.ctx) return f;
    an.getFloatTimeDomainData(this.time);
    an.getFloatFrequencyData(this.freq);

    let sum = 0;
    for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
    f.rms = Math.sqrt(sum / this.time.length);
    f.db = 20 * Math.log10(f.rms + 1e-9);
    this.floor.update(f.db, dt);

    const hzPerBin = this.ctx.sampleRate / an.fftSize;
    const bandNorm = BANDS.map(([lo, hi], b) => {
      let p = 0, n = 0;
      for (let i = Math.floor(lo / hzPerBin); i <= Math.min(this.freq.length - 1, Math.ceil(hi / hzPerBin)); i++) {
        p += Math.pow(10, this.freq[i] / 10);
        n++;
      }
      const db = 10 * Math.log10(p / Math.max(1, n) + 1e-12);
      this.bandFloors[b].update(db, dt);
      return this.bandFloors[b].norm(db);
    });

    let num = 0, den = 0;
    for (let i = Math.floor(60 / hzPerBin); i < Math.min(this.freq.length, 8000 / hzPerBin); i++) {
      const mag = Math.pow(10, this.freq[i] / 20);
      num += i * hzPerBin * mag;
      den += mag;
    }

    this.smoother.apply(dt, { level: this.floor.norm(f.db), low: bandNorm[0], mid: bandNorm[1], high: bandNorm[2] });
    f.centroid = f.active && den > 0 ? num / den : 0;

    // Pitch at ~20 Hz (autocorrelation is the costliest step), median of the last 5 voiced frames.
    if (++this.pitchTick % 3 === 0) {
      const hz = f.active ? estimatePitch(this.time, this.ctx.sampleRate) : 0;
      if (hz > 0) {
        this.pitchHist.push(hz);
        if (this.pitchHist.length > 5) this.pitchHist.shift();
      } else if (!f.active) this.pitchHist = [];
      const sorted = [...this.pitchHist].sort((a, b) => a - b);
      f.pitchHz = sorted.length ? sorted[sorted.length >> 1] : 0;
      f.pitchNorm = pitchToNorm(f.pitchHz);
    }

    const stride = Math.floor(this.time.length / 2 / 64); // central ~half window
    const off = Math.floor(this.time.length / 4);
    for (let i = 0; i < 64; i++) f.wave[i] = this.time[off + i * stride];
    for (let i = 0; i < 32; i++) {
      const [a, b] = this.binEdges[i];
      let m = -Infinity;
      for (let k = a; k <= Math.min(b, this.freq.length - 1); k++) m = Math.max(m, this.freq[k]);
      f.spectrum[i] = Math.max(0, Math.min(1, (m + 95) / 70));
    }
    return f;
  }

  stop() {
    this.cancelled = true;
    this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.src = null;
    this.analyser = null;
    this.ctx = null;
    this.stream = null;
  }
}
