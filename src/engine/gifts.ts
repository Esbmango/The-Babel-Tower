import { COBALT, COBALT_DEEP, LAVENDER, PAPER_RGB, rgba, WHITE, type RGB } from './palette';
import { drawSymbol, type SymbolStyle } from './symbols';
import type { BodySource, GiftCaption, GiftSnapshot, GiftState, InteractionEvent, ParticipantId, SymbolKind, TrayItem, Vec2 } from '../types';

/**
 * Send & Catch — the two-way exchange at the heart of Phase 6.
 *
 *   Express → Send → Catch → Transform → (Return …) → Place
 *
 * A gift starts as an element someone made (from their words, a chosen symbol, a shared topic).
 * Sending flies it along a curve to a landing spot beside the other person. They catch it by
 * holding a hand near it for 0.5 s — or with the Catch button (camera failure never blocks the
 * flow). The holder can move it with their hand, rotate, resize, add their own texture, place it
 * into the artwork, or send it back. Every hand-off adds the holder's visual identity to the gift,
 * so a gift that has travelled is literally made of both people's line languages.
 * Timeouts, cancels and lost tracking all resolve to a defined state; nothing can hang.
 */

export interface GiftHost {
  W: number;
  H: number;
  time(): number;
  now(): number;
  bodySource(): BodySource;
  hands(id: ParticipantId): { pos: Vec2; vel: Vec2; visible: boolean }[];
  anchor(id: ParticipantId): Vec2;
  push(e: Omit<InteractionEvent, 'timestamp'>): void;
  stamp(draw: (ctx: CanvasRenderingContext2D) => void): void;
  spawn(x: number, y: number, vx: number, vy: number, c: RGB, life: number): void;
}

interface Gift {
  id: string;
  kind: SymbolKind;
  label: string;
  origin: ParticipantId;
  from: ParticipantId;
  to: ParticipantId;
  holder: ParticipantId | null;
  state: GiftState;
  pos: Vec2;
  R: number;
  rot: number;
  scale: number;
  marks: ParticipantId[];
  textures: ParticipantId[];
  hops: number;
  flight: { start: Vec2; ctrl: Vec2; end: Vec2; t0: number; dur: number } | null;
  waitStart: number;
  dwell: number;
  heldSince: number;
  lastAction: number;
  fade: number;
  captions: GiftCaption[];
  originMessageId?: string;
}

const other = (p: ParticipantId): ParticipantId => (p === 'A' ? 'B' : 'A');
const WAIT_TIMEOUT = 15;
const HELD_IDLE_PLACE = 90;
const CATCH_RADIUS = 0.1; // frame heights
const DWELL_SEC = 0.5;

export const styleOf = (p: ParticipantId, alpha = 1): SymbolStyle =>
  p === 'A' ? { ink: COBALT_DEEP, halo: PAPER_RGB, alpha } : { ink: WHITE, halo: COBALT, alpha };

export class GiftSystem {
  private gifts: Gift[] = [];
  private seq = 0;

  constructor(private host: GiftHost) {}

  private ev(type: string, actor: ParticipantId, g: Gift, extra: Record<string, number | string | boolean> = {}) {
    this.host.push({
      type, participantId: actor, source: 'user',
      features: { giftId: g.id, kind: g.kind, origin: g.origin, from: g.from, to: g.to, hops: g.hops, ...extra },
    });
  }

  private landing(to: ParticipantId): Vec2 {
    const a = this.host.anchor(to);
    const { W, H } = this.host;
    const clampP = (p: Vec2) => ({ x: Math.max(70, Math.min(W - 70, p.x)), y: Math.max(80, Math.min(H - 80, p.y)) });
    // Beside the receiver, toward the centre and above their hands: reachable, but never already in hand —
    // catching must be a deliberate reach.
    let p = clampP({ x: a.x + (W / 2 - a.x) * 0.25, y: a.y - H * 0.2 });
    const hands = this.host.hands(to).filter((h) => h.visible);
    const minGap = H * 0.17;
    for (let i = 0; i < 12 && hands.some((h) => Math.hypot(h.pos.x - p.x, h.pos.y - p.y) < minGap); i++) {
      p = clampP({ x: p.x + (p.y <= 81 ? (W / 2 - p.x > 0 ? 40 : -40) : 0), y: p.y - 40 });
    }
    return p;
  }

  private fly(g: Gift, start: Vec2) {
    const end = this.landing(g.to);
    const dx = end.x - start.x, dy = end.y - start.y;
    const d = Math.hypot(dx, dy) || 1;
    // Arc upward — the gift visibly travels across the space between the two people.
    const ctrl = { x: (start.x + end.x) / 2 - (dy / d) * d * 0.2, y: Math.min(start.y, end.y) - Math.max(60, d * 0.28) };
    g.flight = { start: { ...start }, ctrl, end, t0: this.host.time(), dur: Math.max(1.2, Math.min(2.6, d / 600)) };
    g.state = 'flying';
    g.dwell = 0;
  }

  /** Is this participant allowed to send now? (max two gifts in the air per sender) */
  canSend(from: ParticipantId) {
    return this.gifts.filter((g) => g.from === from && (g.state === 'flying' || g.state === 'waiting')).length < 2;
  }

  send(from: ParticipantId, item: TrayItem): string | null {
    if (!this.canSend(from)) return null;
    const start = this.host.anchor(from);
    const g: Gift = {
      id: `g${++this.seq}`, kind: item.kind, label: item.label, origin: from, from, to: other(from), holder: null,
      state: 'flying', pos: { ...start }, R: item.kind === 'wings' || item.kind === 'bridge' ? 64 : 54, rot: 0, scale: 1,
      marks: [from], textures: [], hops: 0, flight: null, waitStart: 0, dwell: 0, heldSince: 0, lastAction: this.host.time(), fade: 1,
      captions: item.text && item.lang ? [{ by: from, text: item.text, lang: item.lang, messageId: item.messageId }] : [],
      originMessageId: item.messageId,
    };
    this.fly(g, start);
    this.gifts.push(g);
    this.ev('gift_send', from, g, { source: item.source, label: item.label });
    return g.id;
  }

  private find(id: string) {
    return this.gifts.find((g) => g.id === id);
  }

  /** Send a held gift onward to the other person (a return when it goes back to its origin). */
  sendOn(id: string): boolean {
    const g = this.find(id);
    if (!g || g.state !== 'held' || !g.holder) return false;
    const holder = g.holder;
    g.from = holder;
    g.to = other(holder);
    g.holder = null;
    g.hops++;
    this.fly(g, g.pos);
    this.ev('gift_return', holder, g, { backToOrigin: g.to === g.origin });
    return true;
  }

  cancel(id: string): boolean {
    const g = this.find(id);
    if (!g || (g.state !== 'flying' && g.state !== 'waiting')) return false;
    g.state = 'cancelled';
    this.ev('gift_cancel', g.from, g, {});
    return true;
  }

  catch(id: string, method: 'hand' | 'button'): boolean {
    const g = this.find(id);
    if (!g || (g.state !== 'waiting' && g.state !== 'flying')) return false;
    const by = g.to;
    // One gift per hand: anything this person already holds is placed into the artwork first.
    for (const h of this.gifts) if (h.state === 'held' && h.holder === by) this.place(h.id, 'auto');
    const waited = g.state === 'waiting' ? this.host.time() - g.waitStart : 0;
    g.state = 'held';
    g.holder = by;
    g.flight = null;
    g.heldSince = g.lastAction = this.host.time();
    if (!g.marks.includes(by)) g.marks.push(by); // catching adds the catcher's identity
    this.ev('gift_catch', by, g, { method, waitSec: Math.round(waited * 10) / 10 });
    for (let i = 0; i < 24; i++) {
      const a = i * 0.26;
      this.host.spawn(g.pos.x, g.pos.y, Math.cos(a) * 60, Math.sin(a) * 60, i % 2 ? LAVENDER : by === 'A' ? COBALT_DEEP : WHITE, 1.2);
    }
    return true;
  }

  transform(id: string, op: 'rotate_left' | 'rotate_right' | 'grow' | 'shrink' | 'texture'): boolean {
    const g = this.find(id);
    if (!g || g.state !== 'held' || !g.holder) return false;
    if (op === 'rotate_left') g.rot -= Math.PI / 12;
    if (op === 'rotate_right') g.rot += Math.PI / 12;
    if (op === 'grow') g.scale = Math.min(2.4, g.scale * 1.15);
    if (op === 'shrink') g.scale = Math.max(0.5, g.scale / 1.15);
    if (op === 'texture') {
      if (g.textures.filter((t) => t === g.holder).length >= 2) return false;
      g.textures.push(g.holder);
    }
    g.lastAction = this.host.time();
    this.ev('gift_transform', g.holder, g, { op, scale: Math.round(g.scale * 100) / 100, rotDeg: Math.round((g.rot * 180) / Math.PI) });
    return true;
  }

  /** The holder answers on the gift itself: their words join the gift's captions. */
  respond(id: string, caption: GiftCaption): boolean {
    const g = this.find(id);
    if (!g || g.state !== 'held' || g.holder !== caption.by) return false;
    g.captions.push(caption);
    if (g.captions.length > 4) g.captions.shift();
    g.lastAction = this.host.time();
    this.ev('gift_respond', caption.by, g, { replyMessageId: caption.messageId ?? '', lang: caption.lang });
    return true;
  }

  /** The original message behind a gift (if it came from words). */
  messageOf(id: string) {
    return this.find(id)?.originMessageId;
  }

  place(id: string, how: 'button' | 'auto' = 'button'): boolean {
    const g = this.find(id);
    if (!g || g.state !== 'held') return false;
    const by = g.holder!;
    this.host.stamp((ctx) => this.drawGift(ctx, g, 1, false));
    g.state = 'placed';
    this.ev('gift_place', by, g, { how, marks: g.marks.join(''), textures: g.textures.join('') });
    return true;
  }

  update(dt: number, paused: boolean) {
    const t = this.host.time();
    const H = this.host.H;
    for (const g of this.gifts) {
      if (g.state === 'flying' && g.flight) {
        const f = g.flight;
        const u = Math.min(1, (t - f.t0) / f.dur);
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const prev = g.pos;
        g.pos = {
          x: (1 - e) * (1 - e) * f.start.x + 2 * (1 - e) * e * f.ctrl.x + e * e * f.end.x,
          y: (1 - e) * (1 - e) * f.start.y + 2 * (1 - e) * e * f.ctrl.y + e * e * f.end.y,
        };
        g.rot += dt * 1.2;
        if (Math.random() < 0.7) this.host.spawn(g.pos.x, g.pos.y, (prev.x - g.pos.x) * 4, (prev.y - g.pos.y) * 4, g.from === 'A' ? COBALT_DEEP : WHITE, 0.9);
        if (u >= 1) {
          g.state = 'waiting';
          g.waitStart = t;
          g.flight = null;
        }
      } else if (g.state === 'waiting') {
        // Catch by hand: the receiver keeps a hand near the gift for DWELL_SEC.
        const near = this.host.hands(g.to).some((h) => h.visible && Math.hypot(h.pos.x - g.pos.x, h.pos.y - g.pos.y) < CATCH_RADIUS * H);
        g.dwell = near ? g.dwell + dt : Math.max(0, g.dwell - dt * 1.5);
        if (g.dwell >= DWELL_SEC) this.catch(g.id, 'hand');
        else if (!paused && t - g.waitStart > WAIT_TIMEOUT) {
          // Not caught in time: it settles into the artwork where it landed. The flow continues.
          this.host.stamp((ctx) => this.drawGift(ctx, g, 0.75, false));
          g.state = 'dropped';
          this.ev('gift_timeout', g.to, g, { waitedSec: WAIT_TIMEOUT });
        }
      } else if (g.state === 'held' && g.holder) {
        // The holder's nearest visible hand carries the gift; if tracking is lost it simply stays put.
        const hs = this.host.hands(g.holder).filter((h) => h.visible);
        if (hs.length && !paused) {
          const h = hs.reduce((a, b) => (Math.hypot(a.pos.x - g.pos.x, a.pos.y - g.pos.y) < Math.hypot(b.pos.x - g.pos.x, b.pos.y - g.pos.y) ? a : b));
          const target = { x: h.pos.x, y: h.pos.y - H * 0.08 };
          const k = 1 - Math.exp(-dt * 6);
          g.pos = { x: g.pos.x + (target.x - g.pos.x) * k, y: g.pos.y + (target.y - g.pos.y) * k };
          g.rot += (h.vel.x / H) * dt * 0.6; // a sweeping hand turns it a little
        }
        if (!paused && t - g.lastAction > HELD_IDLE_PLACE) this.place(g.id, 'auto');
      } else if (g.state === 'cancelled') {
        g.fade -= dt * 1.6;
      }
    }
    this.gifts = this.gifts.filter((g) => g.state !== 'placed' && g.state !== 'dropped' && !(g.state === 'cancelled' && g.fade <= 0));
  }

  /** The fused rendering: origin's symbol, an echo for each other holder, their textures and rings. */
  private drawGift(ctx: CanvasRenderingContext2D, g: Gift, alpha: number, live: boolean) {
    const R = g.R * g.scale;
    // A collage token behind the gift: half paper, half cobalt — it carries both grounds and stays legible on either.
    ctx.save();
    ctx.translate(g.pos.x, g.pos.y);
    ctx.rotate(g.rot);
    const D = R * 1.2;
    ctx.fillStyle = rgba(PAPER_RGB, 0.92 * alpha);
    ctx.beginPath(); ctx.arc(0, 0, D, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(COBALT, 0.92 * alpha);
    ctx.beginPath(); ctx.arc(0, 0, D, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.restore();
    drawSymbol(ctx, g.kind, g.pos.x, g.pos.y, R, 1, styleOf(g.origin, alpha), g.rot);
    for (const p of g.marks) {
      if (p === g.origin) continue;
      drawSymbol(ctx, g.kind, g.pos.x, g.pos.y, R * 0.8, 1, styleOf(p, alpha * 0.9), g.rot + 0.14);
    }
    ctx.save();
    ctx.translate(g.pos.x, g.pos.y);
    ctx.rotate(g.rot);
    g.textures.forEach((p, i) => {
      const r = R * (0.62 - i * 0.12);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      if (p === 'A') {
        // A's texture: cobalt hatching on a paper ground.
        ctx.fillStyle = rgba(PAPER_RGB, 0.55 * alpha);
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.strokeStyle = rgba(COBALT_DEEP, 0.75 * alpha);
        ctx.lineWidth = 0.7;
        for (let x = -r * 2; x < r * 2; x += 4) { ctx.beginPath(); ctx.moveTo(x, -r); ctx.lineTo(x + r, r); ctx.stroke(); }
      } else {
        // B's texture: white halftone on a cobalt ground.
        ctx.fillStyle = rgba(COBALT, 0.6 * alpha);
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = rgba(WHITE, 0.9 * alpha);
        for (let y = -r; y <= r; y += 5) for (let x = -r; x <= r; x += 5) {
          const d = Math.hypot(x, y) / r;
          if (d > 1) continue;
          ctx.beginPath(); ctx.arc(x, y, (1 - d) * 1.9 + 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    });
    g.marks.forEach((p, i) => {
      const s = styleOf(p, alpha);
      const r = R * 1.08 + i * 5;
      ctx.strokeStyle = rgba(s.halo ?? WHITE, 0.7 * alpha);
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgba(s.ink, 0.95 * alpha);
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();

    // Captions: the words that travel with the gift, each in its author's ink (latest two).
    const caps = g.captions.slice(-2);
    caps.forEach((c, i) => {
      const s = styleOf(c.by, alpha);
      const t = [...c.text].length > 30 ? [...c.text].slice(0, 29).join('') + '…' : c.text;
      ctx.save();
      ctx.font = `400 ${i === caps.length - 1 ? 15 : 13}px "Iowan Old Style", "Songti SC", "Hiragino Mincho ProN", Georgia, serif`;
      ctx.textAlign = 'center';
      const y = g.pos.y - R * 1.3 - 8 - (caps.length - 1 - i) * 18;
      ctx.strokeStyle = rgba(s.halo ?? COBALT, 0.95 * alpha);
      ctx.lineWidth = 3.5;
      ctx.strokeText((i ? '↳ ' : '') + t, g.pos.x, y);
      ctx.fillStyle = rgba(s.ink, alpha);
      ctx.fillText((i ? '↳ ' : '') + t, g.pos.x, y);
      ctx.restore();
    });

    if (!live) return;
    if (g.state === 'waiting') {
      const left = Math.max(0, WAIT_TIMEOUT - (this.host.time() - g.waitStart));
      const ink = styleOf(g.to);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = rgba(LAVENDER, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(g.pos.x, g.pos.y, R * 1.45 + Math.sin(this.host.time() * 4) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (g.dwell > 0) {
        ctx.strokeStyle = rgba(ink.ink, 1);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(g.pos.x, g.pos.y, R * 1.45, -Math.PI / 2, -Math.PI / 2 + (g.dwell / DWELL_SEC) * Math.PI * 2); ctx.stroke();
      }
      ctx.font = '600 11px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textAlign = 'center';
      const label = `CATCH, ${g.to} · ${left.toFixed(0)}s`;
      ctx.strokeStyle = rgba(ink.halo ?? COBALT, 0.9);
      ctx.lineWidth = 3;
      ctx.strokeText(label, g.pos.x, g.pos.y + R * 1.45 + 16);
      ctx.fillStyle = rgba(ink.ink, 1);
      ctx.fillText(label, g.pos.x, g.pos.y + R * 1.45 + 16);
      ctx.restore();
    }
    if (g.state === 'held') {
      ctx.save();
      ctx.strokeStyle = rgba(LAVENDER, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(g.pos.x, g.pos.y, R * 1.3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  draw(ctx: CanvasRenderingContext2D, live: boolean) {
    for (const g of this.gifts) {
      if (g.state === 'cancelled') this.drawGift(ctx, g, Math.max(0, g.fade) * 0.6, false);
      else this.drawGift(ctx, g, 1, live);
    }
  }

  snapshot(): GiftSnapshot[] {
    const t = this.host.time();
    return this.gifts
      .filter((g) => g.state !== 'cancelled')
      .map((g) => ({
        id: g.id, kind: g.kind, label: g.label, origin: g.origin, from: g.from, to: g.to, holder: g.holder, state: g.state,
        hops: g.hops, marks: [...g.marks], textures: [...g.textures], dwell: g.dwell,
        waitLeft: g.state === 'waiting' ? Math.max(0, WAIT_TIMEOUT - (t - g.waitStart)) : 0, scale: g.scale, rot: g.rot,
        captions: g.captions.map((c) => ({ ...c })), originMessageId: g.originMessageId,
      }));
  }

  reset() {
    this.gifts = [];
  }
}
