import { FeatureSmoother, pitchToNorm } from './audioFeatures';
import type { AudioFeatures } from '../types';

/**
 * Simulated shared audio for demos without a microphone. Clearly labelled "SIMULATED" in the UI.
 * Produces a speech-like pattern: phrases of syllables (~4 Hz) separated by pauses.
 * Holding the V key forces "speaking" so a presenter can drive it by hand.
 */
export class AudioSim {
  private smoother = new FeatureSmoother('audio_sim');
  private t = 0;
  private phaseEnd = 2;
  private talking = true;
  private seed = 7;
  manualGate = false;

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  update(dt: number): AudioFeatures {
    this.t += dt;
    const t = this.t;
    if (t > this.phaseEnd) {
      this.talking = !this.talking;
      this.phaseEnd = t + (this.talking ? 1.6 + this.rand() * 2.2 : 0.9 + this.rand() * 1.8);
    }
    const speaking = this.manualGate || this.talking;
    const syll = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 4.2 * t)), 0.6) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * t));
    const env = speaking ? syll : 0;
    const noise = 0.02 * this.rand();
    const raw = {
      level: speaking ? 0.12 + 0.7 * env : noise,
      low: speaking ? 0.25 + 0.55 * env * (0.5 + 0.5 * Math.sin(t * 0.9)) : noise,
      mid: speaking ? 0.75 * env : noise,
      high: speaking ? 0.12 + env * 0.55 * (0.5 + 0.5 * Math.sin(t * 3.1)) : noise,
    };
    const f = this.smoother.apply(dt, raw);
    f.db = -62 + 50 * f.level;
    f.rms = Math.pow(10, f.db / 20);
    f.centroid = f.active ? 500 + 2600 * f.high : 0;
    // Simulated intonation: a slow phrase contour around 170 Hz.
    f.pitchHz = f.active ? 170 + 60 * Math.sin(t * 1.3) + 25 * Math.sin(t * 4.1) : 0;
    f.pitchNorm = pitchToNorm(f.pitchHz);
    for (let i = 0; i < 64; i++) {
      f.wave[i] = f.level * (0.6 * Math.sin(i * 0.55 + t * 22) + 0.3 * Math.sin(i * 1.7 + t * 37) + 0.1 * Math.sin(i * 3.9 + t * 11));
    }
    for (let i = 0; i < 32; i++) {
      const formant = Math.exp(-((i - 8) ** 2) / 18) + 0.7 * Math.exp(-((i - 17) ** 2) / 14) + 0.4 * Math.exp(-((i - 25) ** 2) / 10) * f.high * 2;
      f.spectrum[i] = Math.min(1, 0.05 + f.level * formant);
    }
    return f;
  }
}
