import { COBALT, INK, PAPER, PAPER_RGB, rgba, SKY, WHITE } from './palette';

/** Deterministic PRNG so the paper is identical every session (and in every export). */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Static grain, rendered once and laid over the ground. */
export function paintGrain(c: HTMLCanvasElement, W: number, H: number, scale: number) {
  const g = c.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.clearRect(0, 0, W, H);
  const rnd = prng(11);
  const n = Math.round((W * H) / 40);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H;
    const onBlue = x > W / 2 + (rnd() - 0.5) * 200;
    g.fillStyle = onBlue ? rgba(WHITE, 0.04 + rnd() * 0.06) : rgba(INK, 0.025 + rnd() * 0.04);
    const s = rnd() < 0.85 ? 0.8 : 1.4;
    g.fillRect(x, y, s, s);
  }
}

/**
 * The ground: white paper (A's side) and a cobalt field (B's side), meeting through a
 * halftone transition at the centre. `fusion` (0..1) widens that transition as the two
 * people make shared shapes, so the grounds visibly merge through interaction.
 */
export function paintGround(c: HTMLCanvasElement, W: number, H: number, scale: number, fusion: number) {
  const g = c.getContext('2d')!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const cx = W / 2;
  const half = W * (0.07 + 0.26 * Math.max(0, Math.min(1, fusion))); // half-width of the transition
  const x0 = cx - half, x1 = cx + half;

  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  g.fillStyle = rgba(COBALT, 1);
  g.fillRect(cx, 0, W - cx, H);

  // Halftone transition with area-correct dots: coverage goes 0 → 1 across the zone.
  // Paper side: cobalt dots of coverage t (t < 0.5); blue side: paper dots of coverage 1 - t.
  // Both meet at 50% coverage on the centre line, so there is no seam.
  const step = 8;
  for (let x = x0 + step / 2; x < x1; x += step) {
    const t = (x - x0) / (x1 - x0);
    const onPaper = x < cx;
    const cover = onPaper ? t : 1 - t;
    const r = step * Math.sqrt(Math.min(0.5, cover) / Math.PI);
    if (r < 0.3) continue;
    g.fillStyle = onPaper ? rgba(COBALT, 1) : rgba(PAPER_RGB, 1);
    for (let y = (Math.round((x - x0) / step) % 2) * (step / 2); y < H + step; y += step) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Collage panels: a pale-blue cut-out on the white side, a paper cut-out on the blue side.
  g.fillStyle = rgba(SKY, 0.22);
  g.fillRect(W * 0.05, H * 0.58, W * 0.15, H * 0.3);
  g.fillRect(W * 0.2, H * 0.07, W * 0.06, H * 0.2);
  g.fillStyle = rgba(PAPER_RGB, 0.13);
  g.fillRect(W * 0.8, H * 0.1, W * 0.12, H * 0.22);
  g.fillRect(W * 0.7, H * 0.7, W * 0.07, H * 0.19);

  // Shared concentric circles and radiating lines: cobalt on the white side, white on the blue side.
  const drawRings = () => {
    g.lineWidth = 0.7;
    for (const r of [H * 0.18, H * 0.3, H * 0.44]) {
      g.beginPath();
      g.arc(cx, H / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * H * 0.46, H / 2 + Math.sin(a) * H * 0.46);
      g.lineTo(cx + Math.cos(a) * H * 0.5, H / 2 + Math.sin(a) * H * 0.5);
      g.stroke();
    }
  };
  g.save();
  g.beginPath(); g.rect(0, 0, cx, H); g.clip();
  g.strokeStyle = rgba(COBALT, 0.18);
  drawRings();
  g.restore();
  g.save();
  g.beginPath(); g.rect(cx, 0, W - cx, H); g.clip();
  g.strokeStyle = rgba(WHITE, 0.24);
  drawRings();
  g.restore();
}
