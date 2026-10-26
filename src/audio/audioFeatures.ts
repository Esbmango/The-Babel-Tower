import { silentAudio, type AudioFeatures, type AudioSource } from '../types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Activity thresholds on the normalized level (hysteresis + hold). */
const ON = 0.16;
const OFF = 0.08;
const HOLD_SEC = 0.35;

/**
 * Shared post-processing for real and simulated audio:
 * attack/release smoothing, activity detection with hysteresis, silence timer.
 */
export class FeatureSmoother {
  readonly f: AudioFeatures;
  private belowFor = 0;
  private clock = 0;
  private valley = 0;
  private lastOnset = -1;
  private onsets: number[] = [];

  constructor(source: AudioSource) {
    this.f = silentAudio(source);
  }

  /** Raw normalized values in, smoothed features out. */
  apply(dt: number, raw: { level: number; low: number; mid: number; high: number }) {
    const s = (cur: number, target: number) => {
      const rate = target > cur ? 18 : 5; // fast attack, slow release
      return cur + (target - cur) * (1 - Math.exp(-dt * rate));
    };
    const f = this.f;
    f.level = s(f.level, clamp01(raw.level));
    f.low = s(f.low, clamp01(raw.low));
    f.mid = s(f.mid, clamp01(raw.mid));
    f.high = s(f.high, clamp01(raw.high));

    if (!f.active && f.level > ON) {
      f.active = true;
      this.belowFor = 0;
    } else if (f.active) {
      this.belowFor = f.level < OFF ? this.belowFor + dt : 0;
      if (this.belowFor > HOLD_SEC) f.active = false;
    }
    f.silenceSec = f.active ? 0 : f.silenceSec + dt;

    // Rhythm: count loudness onsets (a rise of 0.12 above the recent valley, ≥ 120 ms apart).
    this.clock += dt;
    this.valley = Math.min(f.level, this.valley + dt * 0.6);
    if (f.level - this.valley > 0.12 && this.clock - this.lastOnset > 0.12) {
      this.lastOnset = this.clock;
      this.onsets.push(this.clock);
      this.valley = f.level;
    }
    while (this.onsets.length && this.clock - this.onsets[0] > 3) this.onsets.shift();
    f.onsetRate = this.onsets.length / Math.min(3, Math.max(0.5, this.clock));
    return f;
  }
}

/** Adaptive noise floor in dB: follows quiet quickly, rises very slowly (absorbs steady room noise). */
export class NoiseFloor {
  constructor(public db = -70) {}
  update(db: number, dt: number) {
    const rate = db < this.db ? 2.5 : 0.03;
    this.db += (db - this.db) * Math.min(1, dt * rate);
    this.db = Math.max(-90, Math.min(-30, this.db));
    return this.db;
  }
  /** Normalized level: 6 dB above floor = 0, 42 dB above = 1. */
  norm(db: number) {
    return clamp01((db - this.db - 6) / 36);
  }
}

/**
 * Fundamental frequency by normalised autocorrelation (75–400 Hz).
 * Returns 0 when the frame is not clearly voiced. A signal measurement, not an emotion estimate.
 */
export function estimatePitch(buf: Float32Array, sampleRate: number): number {
  const n = Math.min(buf.length, 1024);
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 75));
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (energy < 1e-4) return 0;
  const corr = new Float32Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0, e1 = 0, e2 = 0;
    for (let i = 0; i + lag < n; i++) {
      c += buf[i] * buf[i + lag];
      e1 += buf[i] * buf[i];
      e2 += buf[i + lag] * buf[i + lag];
    }
    corr[lag] = c / Math.sqrt(e1 * e2 + 1e-12);
    if (corr[lag] > best) best = corr[lag];
  }
  if (best < 0.55) return 0;
  // Earliest local peak within 90% of the best avoids locking onto a sub-octave.
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= 0.9 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) return sampleRate / lag;
  }
  return 0;
}

export function pitchToNorm(hz: number) {
  return hz > 0 ? clamp01(Math.log2(hz / 80) / Math.log2(400 / 80)) : 0;
}
