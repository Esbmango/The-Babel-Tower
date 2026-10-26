import { rgba, type RGB } from './palette';
import type { SymbolKind } from '../types';

/**
 * Celestial symbol layer: wings, halo, rays, eye, star, flower, feather and a symmetrical
 * unfolding — drawn as fine linework, geometry and halftone (never as stickers).
 * Every stroke is laid twice: a thin "knockout" halo, then the ink, so a white figure reads on
 * paper and a blue figure reads on the cobalt field.
 * `p` (0..1) is the unfolding progress; the engine animates it live, then stamps the final form.
 */
export interface SymbolStyle {
  ink: RGB;
  halo: RGB | null;
  alpha: number;
}

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

function stroke(ctx: CanvasRenderingContext2D, s: SymbolStyle, width: number, path: () => void) {
  if (s.halo) {
    ctx.strokeStyle = rgba(s.halo, 0.75 * s.alpha);
    ctx.lineWidth = width + 2.2;
    ctx.beginPath();
    path();
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(s.ink, s.alpha);
  ctx.lineWidth = width;
  ctx.beginPath();
  path();
  ctx.stroke();
}

function dots(ctx: CanvasRenderingContext2D, s: SymbolStyle, cx: number, cy: number, R: number, step = 4.5) {
  ctx.fillStyle = rgba(s.ink, 0.8 * s.alpha);
  for (let y = -R; y <= R; y += step) {
    for (let x = -R; x <= R; x += step) {
      const d = Math.hypot(x, y) / R;
      if (d > 1) continue;
      const r = (1 - d) * 1.6;
      if (r < 0.3) continue;
      ctx.beginPath();
      ctx.arc(cx + x, cy + y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** One feather: curved quill with barbs, lying along +x from the origin. */
function feather(ctx: CanvasRenderingContext2D, s: SymbolStyle, len: number, bend: number) {
  const w = len * 0.16;
  stroke(ctx, s, len > 90 ? 1.1 : 0.8, () => {
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, bend - w, len, bend * 1.6);
    ctx.quadraticCurveTo(len * 0.55, bend + w, 0, 0);
  });
  stroke(ctx, s, 0.6, () => {
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, bend, len, bend * 1.6);
  });
  stroke(ctx, s, 0.45, () => {
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const x = len * t, y = bend * (t * t * 1.6 + (1 - t) * t * 1.0);
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * 0.06, y - w * 0.8 * (1 - t * 0.6));
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * 0.06, y + w * 0.8 * (1 - t * 0.6));
    }
  });
}

function wings(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const open = ease(p);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const folded = Math.PI * 0.55;
      const spread = -Math.PI * 0.22 + (i / (n - 1)) * Math.PI * 0.62;
      const a = folded + (spread - folded) * open;
      ctx.save();
      ctx.translate(R * 0.12, 0);
      ctx.rotate(a);
      feather(ctx, s, R * (0.55 + 0.45 * Math.sin((i / (n - 1)) * Math.PI * 0.9 + 0.3)), R * 0.06);
      ctx.restore();
    }
    ctx.restore();
  }
  dots(ctx, s, 0, 0, R * 0.16);
}

function halo(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  stroke(ctx, s, 1, () => ctx.ellipse(0, 0, R * k, R * 0.32 * k, 0, 0, Math.PI * 2));
  stroke(ctx, s, 0.6, () => ctx.ellipse(0, 0, R * 0.86 * k, R * 0.26 * k, 0, 0, Math.PI * 2));
  stroke(ctx, s, 0.5, () => {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r0 = R * 1.1, r1 = R * (1.1 + (i % 3 === 0 ? 0.45 : 0.22) * k);
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.36);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.36);
    }
  });
}

function rays(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  stroke(ctx, s, 0.9, () => ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2));
  stroke(ctx, s, 0.5, () => {
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r1 = R * (0.3 + (i % 4 === 0 ? 0.7 : i % 2 ? 0.35 : 0.5) * k);
      ctx.moveTo(Math.cos(a) * R * 0.28, Math.sin(a) * R * 0.28);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
  });
}

function eye(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const o = 0.08 + 0.92 * ease(p);
  stroke(ctx, s, 1, () => {
    ctx.moveTo(-R, 0);
    ctx.quadraticCurveTo(0, -R * 0.7 * o, R, 0);
    ctx.quadraticCurveTo(0, R * 0.7 * o, -R, 0);
  });
  if (o > 0.3) {
    for (const r of [0.34, 0.24]) stroke(ctx, s, 0.7, () => ctx.arc(0, 0, R * r * o, 0, Math.PI * 2));
    ctx.fillStyle = rgba(s.ink, s.alpha);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.1 * o, 0, Math.PI * 2);
    ctx.fill();
  }
  stroke(ctx, s, 0.5, () => {
    for (let i = 0; i < 9; i++) {
      const t = (i + 1) / 10, x = -R + 2 * R * t;
      const y = -R * 0.7 * o * 2 * t * (1 - t);
      ctx.moveTo(x, y);
      ctx.lineTo(x * 1.08, y - R * 0.22);
    }
  });
}

function star(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  stroke(ctx, s, 0.8, () => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const L = R * k * (i % 2 ? 0.7 : 1);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.12) * L * 0.25, Math.sin(a - 0.12) * L * 0.25);
      ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      ctx.lineTo(Math.cos(a + 0.12) * L * 0.25, Math.sin(a + 0.12) * L * 0.25);
      ctx.closePath();
    }
  });
  stroke(ctx, s, 0.45, () => {
    ctx.arc(0, 0, R * 0.32 * k, 0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2);
      ctx.lineTo(Math.cos(a) * R * 0.5 * k, Math.sin(a) * R * 0.5 * k);
    }
  });
}

function flower(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  for (const [n, r, rot] of [[10, 1, 0], [10, 0.66, Math.PI / 10], [6, 0.38, 0]] as const) {
    stroke(ctx, s, r === 1 ? 0.8 : 0.6, () => {
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const L = R * r * k, wd = (Math.PI / n) * 0.8;
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a - wd) * L * 0.75, Math.sin(a - wd) * L * 0.75, Math.cos(a) * L, Math.sin(a) * L);
        ctx.quadraticCurveTo(Math.cos(a + wd) * L * 0.75, Math.sin(a + wd) * L * 0.75, 0, 0);
      }
    });
  }
  dots(ctx, s, 0, 0, R * 0.2 * k + 1, 3.5);
}

function unfolding(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  const n = 12;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate((i / n) * Math.PI * 2 * k);
    feather(ctx, s, R * 0.9, R * 0.05);
    ctx.restore();
  }
  for (const r of [0.25, 0.4]) stroke(ctx, s, 0.6, () => ctx.arc(0, 0, R * r * k, 0, Math.PI * 2));
}


/** Geometric house: nested gables, arched door, window grid, halftone roof. */
export function house(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  const w = R * 0.8, h = R * 0.65 * k, roof = R * 0.55 * k;
  const base = R * 0.55;
  const outline = (sc: number) => () => {
    ctx.moveTo(-w * sc, base);
    ctx.lineTo(-w * sc, base - h * sc);
    ctx.lineTo(0, base - (h + roof) * sc);
    ctx.lineTo(w * sc, base - h * sc);
    ctx.lineTo(w * sc, base);
    ctx.closePath();
  };
  stroke(ctx, s, 1, outline(1));
  if (k > 0.3) stroke(ctx, s, 0.6, outline(0.72));
  if (k > 0.5) {
    stroke(ctx, s, 0.8, () => {
      const dw = w * 0.22;
      ctx.moveTo(-dw, base);
      ctx.lineTo(-dw, base - h * 0.45);
      ctx.arc(0, base - h * 0.45, dw, Math.PI, 0);
      ctx.lineTo(dw, base);
    });
    stroke(ctx, s, 0.5, () => {
      for (const sx of [-1, 1]) {
        const cx = sx * w * 0.58, cy = base - h * 0.62, ww = w * 0.18;
        ctx.rect(cx - ww, cy - ww, ww * 2, ww * 2);
        ctx.moveTo(cx, cy - ww); ctx.lineTo(cx, cy + ww);
        ctx.moveTo(cx - ww, cy); ctx.lineTo(cx + ww, cy);
      }
    });
  }
  if (k > 0.7) dots(ctx, s, 0, base - h - roof * 0.45, roof * 0.35, 4);
  stroke(ctx, s, 0.5, () => { ctx.moveTo(-w * 1.25, base); ctx.lineTo(w * 1.25, base); });
}

/** Tree: recursive branching linework with stippled leaves. */
function tree(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  const depthMax = Math.max(1, Math.round(5 * k));
  const branch = (x: number, y: number, len: number, a: number, d: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    stroke(ctx, s, Math.max(0.4, 1.4 - d * 0.25), () => { ctx.moveTo(x, y); ctx.lineTo(x2, y2); });
    if (d >= depthMax) {
      ctx.fillStyle = rgba(s.ink, 0.8 * s.alpha);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x2 + Math.cos(i * 1.7) * 3, y2 + Math.sin(i * 1.7) * 3, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    branch(x2, y2, len * 0.72, a - 0.42, d + 1);
    branch(x2, y2, len * 0.72, a + 0.38, d + 1);
  };
  branch(0, R * 0.8, R * 0.42, -Math.PI / 2, 1);
  stroke(ctx, s, 0.5, () => { ctx.moveTo(-R * 0.5, R * 0.8); ctx.lineTo(R * 0.5, R * 0.8); });
}

/** Bridge: an arch with lattice and suspension lines — connection. */
function bridge(ctx: CanvasRenderingContext2D, s: SymbolStyle, R: number, p: number) {
  const k = ease(p);
  const L = R * 1.3 * k, rise = R * 0.55;
  stroke(ctx, s, 1, () => { ctx.moveTo(-L, R * 0.25); ctx.quadraticCurveTo(0, R * 0.25 - rise * 2, L, R * 0.25); });
  stroke(ctx, s, 0.8, () => { ctx.moveTo(-L, R * 0.25); ctx.lineTo(L, R * 0.25); });
  stroke(ctx, s, 0.45, () => {
    for (let i = -6; i <= 6; i++) {
      const x = (i / 6) * L;
      const t = (x / L + 1) / 2;
      const y = R * 0.25 - rise * 2 * 2 * t * (1 - t);
      ctx.moveTo(x, R * 0.25);
      ctx.lineTo(x, y);
      if (i < 6) {
        const x2 = ((i + 1) / 6) * L;
        ctx.moveTo(x, R * 0.25);
        ctx.lineTo(x2, R * 0.25 - rise * 2 * 2 * ((x2 / L + 1) / 2) * (1 - (x2 / L + 1) / 2));
      }
    }
  });
}

export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  kind: SymbolKind,
  x: number,
  y: number,
  R: number,
  p: number,
  s: SymbolStyle,
  rot = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'wings': wings(ctx, s, R, p); break;
    case 'halo': halo(ctx, s, R, p); break;
    case 'rays': rays(ctx, s, R, p); break;
    case 'eye': eye(ctx, s, R, p); break;
    case 'star': star(ctx, s, R, p); break;
    case 'flower': flower(ctx, s, R, p); break;
    case 'feather': ctx.rotate(-Math.PI / 3); feather(ctx, s, R * 1.2, R * 0.12); break;
    case 'unfolding': unfolding(ctx, s, R, p); break;
    case 'house': house(ctx, s, R, p); break;
    case 'tree': tree(ctx, s, R, p); break;
    case 'bridge': bridge(ctx, s, R, p); break;
  }
  ctx.restore();
}

export const SYMBOL_KINDS: SymbolKind[] = ['house', 'wings', 'halo', 'flower', 'tree', 'bridge', 'star', 'eye', 'rays', 'feather', 'unfolding'];

/** Shared helpers for other parametric drawings (gifts, sanctuary). */
export { stroke as inkStroke, dots as inkDots, feather as drawFeather };
