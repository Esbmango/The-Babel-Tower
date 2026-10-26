/**
 * One Euro Filter (Casiez et al. 2012): low jitter when still, low lag when moving fast.
 * Used to smooth MediaPipe wrist landmarks before they drive the threads.
 */
class LowPass {
  y: number | null = null;
  filter(x: number, a: number) {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }
}

const alpha = (dt: number, cutoff: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | null = null;
  private lastRaw: number | null = null;

  constructor(
    private minCutoff = 1.4,
    private beta = 0.9,
    private dCutoff = 1.0,
  ) {}

  /** @param t milliseconds */
  filter(value: number, t: number): number {
    const dt = this.lastT === null ? 1 / 15 : Math.max(1e-3, (t - this.lastT) / 1000);
    this.lastT = t;
    const deriv = this.lastRaw === null ? 0 : (value - this.lastRaw) / dt;
    this.lastRaw = value;
    const edx = this.dx.filter(deriv, alpha(dt, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(dt, cutoff));
  }

  reset() {
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
    this.lastRaw = null;
  }
}
