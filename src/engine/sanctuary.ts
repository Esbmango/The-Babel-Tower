import { COBALT, COBALT_DEEP, LAVENDER, PAPER_RGB, rgba, WHITE } from './palette';
import { drawFeather, drawSymbol, house, inkDots, inkStroke, type SymbolStyle } from './symbols';
import { styleOf } from './gifts';
import type { InteractionEvent, ParticipantId, SanctuaryStats, Vec2 } from '../types';

/**
 * Shared Sanctuary — a parametric figure two people build live.
 *
 *   centre  geometric house (left half in A's ink on white, right half in B's ink on blue)
 *   left    A's wing  — A's hand height opens it, A's hand direction aims it, A's motion adds feathers & texture
 *   right   B's wing  — the same, driven by B
 *   above   shared halo, rays, stars; plants / bridge when those topics came up in conversation
 *
 * Growth never goes backwards: feathers, texture and the centre's stages are kept.
 * Coordination (both moving, moving together, both wings open) speeds the centre up,
 * but each person alone still makes progress — synchrony is invited, not required.
 * Everything is drawn from parameters every frame: no images, no pre-recorded animation.
 */

export interface SanctuaryHost {
  W: number;
  H: number;
  time(): number;
  hands(id: ParticipantId): { pos: Vec2; vel: Vec2; speed: number; visible: boolean }[];
  push(e: Omit<InteractionEvent, 'timestamp'>): void;
  bilingual(ctx: CanvasRenderingContext2D, draw: (s: SymbolStyle, side: ParticipantId) => void, alpha?: number): void;
}

interface Wing {
  spread: number;
  angle: number;
  targetSpread: number;
  targetAngle: number;
  energy: number;
  feathers: number;
  texture: number;
}

const STAGES: [number, string][] = [
  [0.05, 'ground'], [0.18, 'walls'], [0.32, 'roof'], [0.46, 'door & windows'],
  [0.6, 'halo'], [0.72, 'rays'], [0.86, 'second halo & stars'], [1.0, 'complete'],
];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (dt: number, r: number) => 1 - Math.exp(-dt * r);

export class Sanctuary {
  active = false;
  growth = 0;
  stage = -1;
  sealed = 0;
  coordinatedSec = 0;
  categories = new Set<string>();
  wing: Record<ParticipantId, Wing> = { A: this.blank(), B: this.blank() };
  private completeAt = -1;

  constructor(private host: SanctuaryHost) {}

  private blank(): Wing {
    return { spread: 0.15, angle: 0.2, targetSpread: 0.15, targetAngle: 0.2, energy: 0, feathers: 4, texture: 0 };
  }

  get center(): Vec2 {
    return { x: this.host.W / 2, y: this.host.H * 0.58 };
  }
  get R() {
    return this.host.H * 0.2;
  }

  start(trigger: 'user' | 'guided') {
    if (this.active) return;
    this.active = true;
    this.growth = 0;
    this.stage = -1;
    this.coordinatedSec = 0;
    this.completeAt = -1;
    this.wing = { A: this.blank(), B: this.blank() };
    this.host.push({ type: 'sanctuary_start', participantId: 'shared', source: 'user', features: { trigger } });
  }

  /** Stamp the current sanctuary into the permanent ink and stop driving it. */
  seal(stamp: (draw: (ctx: CanvasRenderingContext2D) => void) => void) {
    if (!this.active) return;
    stamp((ctx) => this.draw(ctx, false));
    this.active = false;
    this.sealed++;
    this.host.push({ type: 'sanctuary_seal', participantId: 'shared', source: 'user', features: { growth: Math.round(this.growth * 100) / 100, ...this.contribFeatures() } });
  }

  private root(p: ParticipantId): Vec2 {
    const c = this.center, R = this.R;
    return { x: c.x + (p === 'A' ? -1 : 1) * R * 0.78, y: c.y - R * 0.15 };
  }

  update(dt: number, sync: number) {
    if (!this.active) return;
    const H = this.host.H;
    const moving: Record<ParticipantId, boolean> = { A: false, B: false };
    for (const p of ['A', 'B'] as const) {
      const w = this.wing[p];
      const hs = this.host.hands(p).filter((h) => h.visible);
      if (hs.length) {
        const lead = hs.reduce((a, b) => (a.pos.y < b.pos.y ? a : b)); // the higher hand leads
        w.targetSpread = clamp01((0.8 - lead.pos.y / H) / 0.5);
        const r = this.root(p);
        const dx = (p === 'A' ? r.x - lead.pos.x : lead.pos.x - r.x), dy = lead.pos.y - r.y;
        w.targetAngle = Math.max(-1.1, Math.min(0.7, Math.atan2(dy, Math.max(20, dx))));
        const sp = hs.reduce((m, h) => Math.max(m, h.speed), 0);
        if (sp > 0.05) w.energy += sp * dt;
        moving[p] = sp > 0.08;
      }
      w.spread += (w.targetSpread - w.spread) * ease(dt, 3);
      w.angle += (w.targetAngle - w.angle) * ease(dt, 3);
      w.feathers = Math.max(w.feathers, Math.min(18 + (this.categories.has('FREEDOM') ? 4 : 0), 4 + Math.floor(w.energy * 1.6)));
      w.texture = Math.max(w.texture, clamp01(w.energy / 4));
    }
    const coord = (moving.A && moving.B ? 0.5 : 0) + sync * 0.5 + (this.wing.A.spread > 0.45 && this.wing.B.spread > 0.45 ? 0.3 : 0);
    if (coord > 0.4) this.coordinatedSec += dt;
    // Perfectly coordinated motion completes it in ~20 s; one person alone needs a few minutes.
    const rate = 0.008 * (moving.A ? 1 : 0) + 0.008 * (moving.B ? 1 : 0) + 0.036 * Math.min(1, coord);
    this.growth = Math.min(1, this.growth + rate * dt);

    while (this.stage + 1 < STAGES.length && this.growth >= STAGES[this.stage + 1][0]) {
      this.stage++;
      this.host.push({
        type: this.stage === STAGES.length - 1 ? 'sanctuary_complete' : 'sanctuary_stage',
        participantId: 'shared', source: 'derived',
        features: { stage: this.stage, name: STAGES[this.stage][1], growth: Math.round(this.growth * 100) / 100, ...this.contribFeatures() },
      });
      if (this.stage === STAGES.length - 1) this.completeAt = this.host.time();
    }
  }

  private contribFeatures() {
    const eA = this.wing.A.energy, eB = this.wing.B.energy, tot = eA + eB || 1;
    return {
      shareA: Math.round((eA / tot) * 100) / 100, shareB: Math.round((eB / tot) * 100) / 100,
      feathersA: this.wing.A.feathers, feathersB: this.wing.B.feathers, coordinatedSec: Math.round(this.coordinatedSec),
    };
  }

  private drawWing(ctx: CanvasRenderingContext2D, p: ParticipantId) {
    const w = this.wing[p];
    const r = this.root(p);
    const R = this.R;
    const s = styleOf(p, 0.95);
    ctx.save();
    ctx.translate(r.x, r.y);
    if (p === 'A') ctx.scale(-1, 1); // A's wing opens to the left
    ctx.rotate(w.angle * 0.6);
    const n = w.feathers;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0;
      // folded: feathers hang down along the body; spread: they fan upward and outward
      const folded = Math.PI * 0.42 - u * 0.25;
      const open = -Math.PI * 0.32 + u * Math.PI * 0.72;
      const a = folded + (open - folded) * (0.15 + 0.85 * w.spread);
      const len = R * (0.75 + 0.85 * Math.sin(0.25 + u * Math.PI * 0.75)) * (0.55 + 0.45 * w.spread);
      ctx.save();
      ctx.rotate(a);
      drawFeather(ctx, s, len, R * 0.06);
      ctx.restore();
    }
    // Texture grows with each person's accumulated motion: halftone along the wing's base.
    if (w.texture > 0.05) {
      const count = Math.round(w.texture * 6);
      for (let i = 0; i < count; i++) {
        const a = -0.2 + (i / Math.max(1, count)) * 1.1 * (0.3 + w.spread);
        inkDots(ctx, s, Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45 - R * 0.1, R * 0.16, 4);
      }
    }
    inkStroke(ctx, s, 1, () => { ctx.arc(0, 0, 5, 0, Math.PI * 2); });
    ctx.restore();
  }

  /** `live` adds the explanatory captions (who drives which wing, stage); sealed / exported art omits them. */
  draw(ctx: CanvasRenderingContext2D, live = true) {
    const c = this.center, R = this.R, g = this.growth, t = this.host.time();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Medallion: a collage disc carrying both grounds, so the sanctuary stands clear of the busy ink beneath it.
    const M = R * (1.9 + 0.5 * clamp01(g * 2));
    const ma = 0.35 + 0.55 * clamp01(g * 3);
    ctx.save();
    ctx.beginPath(); ctx.arc(c.x, c.y - R * 0.3, M, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = rgba(PAPER_RGB, ma);
    ctx.fillRect(c.x - M, c.y - R * 0.3 - M, M, M * 2);
    ctx.fillStyle = rgba(COBALT, ma);
    ctx.fillRect(c.x, c.y - R * 0.3 - M, M, M * 2);
    ctx.restore();
    this.host.bilingual(ctx, (st) => {
      for (const k of [1, 0.94]) inkStroke(ctx, { ...st, alpha: 0.8 }, k === 1 ? 1.1 : 0.5, () => ctx.arc(c.x, c.y - R * 0.3, M * k, 0, Math.PI * 2));
    });

    // Rays (behind the figure), bilingual.
    if (g >= 0.72) {
      const k = clamp01((g - 0.72) / 0.2);
      this.host.bilingual(ctx, (s) => drawSymbol(ctx, 'rays', c.x, c.y - R * 0.35, R * (1.4 + 0.9 * k), k, { ...s, alpha: 0.55 }));
    }
    // Ground + foundation arcs.
    this.host.bilingual(ctx, (s) => {
      inkStroke(ctx, { ...s, alpha: 0.7 }, 0.8, () => {
        ctx.moveTo(c.x - R * 2.6, c.y + R * 0.55);
        ctx.lineTo(c.x + R * 2.6, c.y + R * 0.55);
      });
      for (let i = 1; i <= 3; i++) {
        inkStroke(ctx, { ...s, alpha: 0.25 }, 0.5, () => ctx.arc(c.x, c.y + R * 0.55, R * (0.7 + i * 0.55), Math.PI, 0));
      }
    });
    // Wings: each person's own.
    this.drawWing(ctx, 'A');
    this.drawWing(ctx, 'B');
    // Bridge under the house when "connection" was a topic.
    if (this.categories.has('CONNECTION') && g > 0.3) {
      this.host.bilingual(ctx, (s) => drawSymbol(ctx, 'bridge', c.x, c.y + R * 0.6, R * 1.3, clamp01((g - 0.3) / 0.3), s));
    }
    // House, built in stages; a paper/cobalt cut-out behind it keeps it legible on both grounds.
    if (g >= 0.05) {
      const hp = clamp01((g - 0.05) / 0.45);
      ctx.fillStyle = rgba(PAPER_RGB, 0.75 * hp);
      ctx.fillRect(c.x - R * 0.85, c.y - R * 0.75, R * 0.85, R * 1.3);
      ctx.fillStyle = rgba(COBALT, 0.75 * hp);
      ctx.fillRect(c.x, c.y - R * 0.75, R * 0.85, R * 1.3);
      this.host.bilingual(ctx, (s) => {
        ctx.save();
        ctx.translate(c.x, c.y);
        house(ctx, s, R, hp);
        ctx.restore();
      });
      if (this.categories.has('HOME') && g > 0.46) {
        ctx.fillStyle = rgba(LAVENDER, 0.35 + 0.15 * Math.sin(t * 2));
        ctx.beginPath(); ctx.arc(c.x, c.y + R * 0.2, R * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Halo(s) above the roof.
    if (g >= 0.6) {
      const rings = (g >= 0.86 ? 2 : 1) + (this.categories.has('HOPE') ? 1 : 0);
      for (let i = 0; i < rings; i++) {
        const k = clamp01((g - 0.6 - i * 0.12) / 0.12);
        if (k <= 0) continue;
        this.host.bilingual(ctx, (s) => drawSymbol(ctx, 'halo', c.x, c.y - R * (1.25 + i * 0.12), R * (0.55 + i * 0.18), k, { ...s, alpha: 0.85 }));
      }
      ctx.strokeStyle = rgba(LAVENDER, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - R * 1.25, R * 0.62, R * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stars and plants.
    if (g >= 0.86) {
      const pts: [number, number][] = [[-2.1, -1.4], [-1.5, -2.0], [1.6, -1.9], [2.2, -1.2], [0, -2.3]];
      this.host.bilingual(ctx, (s) => pts.forEach(([x, y], i) => drawSymbol(ctx, 'star', c.x + x * R, c.y + y * R, R * 0.16, clamp01((g - 0.86) / 0.1), s, i)));
    }
    if ((this.categories.has('NATURE') && g > 0.5) || g >= 1) {
      const k = clamp01((g - 0.5) / 0.4);
      drawSymbol(ctx, 'tree', c.x - R * 1.9, c.y + R * 0.05, R * 0.55, k, styleOf('A'));
      drawSymbol(ctx, 'tree', c.x + R * 1.9, c.y + R * 0.05, R * 0.55, k, styleOf('B'));
      drawSymbol(ctx, 'flower', c.x - R * 1.25, c.y + R * 0.45, R * 0.18, k, styleOf('A'));
      drawSymbol(ctx, 'flower', c.x + R * 1.25, c.y + R * 0.45, R * 0.18, k, styleOf('B'));
    }
    // Live captions: which person drives which part. Letter + shape marker, not colour alone.
    if (live) {
      const y = c.y + R * 0.55 + 26;
      ctx.font = '600 15px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(COBALT_DEEP, 0.95);
      ctx.fillText(`A ○  hand height opens this wing · ${this.wing.A.feathers} feathers`, c.x - 18, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(WHITE, 0.95);
      ctx.fillText(`${this.wing.B.feathers} feathers · B ■  hand height opens this wing`, c.x + 18, y);
      ctx.textAlign = 'center';
      ctx.font = '600 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
      const label = `SHARED ◇ ${g >= 1 ? 'complete' : (STAGES[Math.max(0, this.stage)]?.[1] ?? 'ground')} · ${Math.round(g * 100)}% · grows faster when you both move`;
      const w = ctx.measureText(label).width + 20;
      ctx.fillStyle = rgba(LAVENDER, 0.92);
      ctx.fillRect(c.x - w / 2, y + 12, w, 22);
      ctx.fillStyle = rgba(WHITE, 1);
      ctx.fillText(label, c.x, y + 28);
    }
    // Completion pulse (live only — fades after 2 s).
    if (this.completeAt > 0 && t - this.completeAt < 2) {
      const a = 1 - (t - this.completeAt) / 2;
      ctx.strokeStyle = rgba(LAVENDER, a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y - R * 0.3, R * (1.5 + (1 - a) * 1.5), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgba(WHITE, a * 0.8);
      ctx.beginPath(); ctx.arc(c.x, c.y - R * 0.3, R * (1.3 + (1 - a) * 1.5), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  stats(): SanctuaryStats {
    const w = (p: ParticipantId) => ({
      spread: Math.round(this.wing[p].spread * 100) / 100,
      feathers: this.wing[p].feathers,
      energy: Math.round(this.wing[p].energy * 100) / 100,
      texture: Math.round(this.wing[p].texture * 100) / 100,
    });
    return {
      active: this.active,
      growth: this.growth,
      stage: this.stage,
      stageName: this.stage >= 0 ? STAGES[this.stage][1] : 'not started',
      wing: { A: w('A'), B: w('B') },
      coordinatedSec: Math.round(this.coordinatedSec),
      sealed: this.sealed,
    };
  }

  reset() {
    this.active = false;
    this.growth = 0;
    this.stage = -1;
    this.sealed = 0;
    this.coordinatedSec = 0;
    this.categories.clear();
    this.wing = { A: this.blank(), B: this.blank() };
  }
}
