import { COBALT, COBALT_DEEP, ELECTRIC, INK, LAVENDER, mix, PALETTE, PAPER_RGB, rgba, SKY, WHITE, type RGB } from './palette';
import { paintGrain, paintGround } from './paper';
import { EventLog } from './events';
import { drawSignalMarks, eventGlyph } from './overlay';
import { drawSymbol, type SymbolStyle } from './symbols';
import { GiftSystem } from './gifts';
import { Sanctuary } from './sanctuary';
import { InteractionAnalyzer, WEAVE_FAR, type HandState, type InteractionFrame } from '../analysis/interaction';
import { langName } from '../lang/languages';
import {
  emptyTargets, PARTICIPANTS, silentAudio,
  type AudioFeatures, type BodySource, type EngineStats, type EngineTargets, type ParticipantId,
  type SharedTopic, type SpeakerMode, type SymbolKind, type TextMessage, type Vec2,
} from '../types';

/*
 * The Babel — Conversation Weaving Engine (Phase 1–5).
 *
 * Fixed 16:9 art frame (1600 × 900 logical units). Layers:
 *   ground (white ↔ cobalt, fusing with interaction) · grain · voice ink (fades in silence) ·
 *   body ink (permanent: lines, typography, symbols) · live layer · signal marks (optional, never recorded).
 *
 * Every visual change maps to an input:
 *  BODY        A = cobalt pen line on white (hatching, ○) · B = white ribbon on blue (halftone, ■).
 *              Wrist position → where it grows; wrist speed → wave amplitude; stillness → blank space.
 *              Both wrists raised above ~30% height → wings unfold at that person.
 *  VOICE       Shared mic → one shared wave layer (blue on white / white on blue).
 *              A manual turn (A / B speaking) → that person's wave style at that person.
 *              RMS → stroke width & brightness · low band → ring scale · high band → stipple grain ·
 *              pitch (F0) → wave tint & waviness · rhythm (onsets/s) → ring cadence · silence → fading.
 *  LANGUAGE    Typed / dictated text → typography on the writer's side, translation beneath.
 *              Shared topic (local lexicon or AI) → shared motif: flower + topic symbol + bilingual label.
 *  INTERACTION Hands < 0.30 apart → weave bridge; weave start → shared shape + halo;
 *              crossing → star + registration mark; sustained sync → symmetrical unfolding;
 *              shared shapes / topics / symbols → the two grounds fuse further at the centre.
 */

export const W = 1600;
export const H = 900;

const TRAIL_LEN = 34;
/** Ink saturation grid: where a spot is already dense, new pen / ribbon ink gets lighter (and recovers slowly). */
const INK_CELL = 40;
const INK_COLS = Math.ceil(1600 / INK_CELL), INK_ROWS = Math.ceil(900 / INK_CELL);
const INK_HALF = 160;   // deposits in one cell before new ink is at half strength
const INK_FLOOR = 0.22; // never fully invisible: motion always leaves a trace
const MAX_PARTICLES = 1400;
const SERIF = '"Iowan Old Style", "Palatino Linotype", "Songti SC", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK SC", Georgia, serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

type Owner = ParticipantId | 'shared';

interface Strand extends HandState {
  prev: Vec2;
  presence: number;
  wasVisible: boolean;
  initialized: boolean;
  trail: Vec2[];
  fibers: Vec2[] | null;
  edges: [Vec2, Vec2] | null;
  normal: Vec2;
  travelled: number;
  lastMark: number;
}

interface Ripple { x: number; y: number; r0: number; grow: number; amp: number; pitch: number; wave: Float32Array; born: number; owner: Owner }
interface Flash { x: number; y: number; r: number; born: number; kind: 'node' | 'cross' }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: RGB; layer: 'body' | 'voice'; size: number }
interface LiveSymbol { kind: SymbolKind; x: number; y: number; R: number; owner: Owner; born: number; dur: number; rot: number }
interface Glyph { ch: string; x: number; y: number; font: string; owner: Owner; /** width of a frame drawn around the whole line (first glyph only) */ boxW?: number }
interface TextJob { glyphs: Glyph[]; i: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export interface ArtStats {
  userSymbolsBy: Record<string, number>;
  sharedShapes: number;
  crossings: number;
  symbols: Record<string, number>;
  fusion: number;
  textsDrawn: number;
  motifs: number;
}

export class WeavingEngine {
  private ctx: CanvasRenderingContext2D;
  private scale: number;
  private ground = document.createElement('canvas');
  private grain = document.createElement('canvas');
  private body = document.createElement('canvas');
  private voice = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  private vctx: CanvasRenderingContext2D;

  private strands: Strand[] = [];
  targetProvider: (now: number) => EngineTargets = () => emptyTargets();
  audioProvider: (dt: number) => AudioFeatures = () => silentAudio('off');
  bodySource: BodySource = 'mouse_sim';
  speakerMode: SpeakerMode = 'shared';
  showMarks = true;
  paused = false;
  /** When set, every frame of the art (without marks / UI) is copied here for MediaRecorder. */
  recordTarget: HTMLCanvasElement | null = null;
  /** Story Film overlay, drawn into the recording only (subtitles, events, title/end cards) — never into PNGs. */
  filmOverlay: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null = null;

  readonly analyzer: InteractionAnalyzer;
  readonly gifts: GiftSystem;
  readonly sanctuary: Sanctuary;
  private symbolsByOwner: Record<string, number> = { A: 0, B: 0, shared: 0 };
  private audio: AudioFeatures = silentAudio('off');
  private frameData: InteractionFrame | null = null;
  private ripples: Ripple[] = [];
  private flashes: Flash[] = [];
  private particles: Particle[] = [];
  private liveSymbols: LiveSymbol[] = [];
  private textJobs: TextJob[] = [];
  private textRows: Record<ParticipantId, number> = { A: 0, B: 0 };
  private anchors = new Map<string, { x: number; y: number; owner: ParticipantId; lines: number }>();
  private nodeCount = 0;
  private symbolCounts: Record<string, number> = {};
  private sharedSymbolCount = 0;
  private motifCount = 0;
  private textsDrawn = 0;
  private fusion = 0;
  private paintedFusion = -1;
  private lastRipple = 0;
  private lastBurst = 0;
  private lastWings: Record<ParticipantId, number> = { A: -99, B: -99 };
  private syncHold = 0;
  private lastUnfold = -99;
  private grainAcc = 0;
  private dustAcc = 0;
  private glyphs = '';
  private lastGlyphT = -1;
  private frameTimes: number[] = [];
  private lastFrame = performance.now();
  private time = 0;
  private inkDensity = new Float32Array(INK_COLS * INK_ROWS);
  private raf = 0;
  private rnd = prng(3);

  constructor(
    canvas: HTMLCanvasElement,
    private events: EventLog,
  ) {
    // Backing resolution chosen once; the canvas is scaled uniformly by CSS.
    const dpr = window.devicePixelRatio || 1;
    this.scale = Math.min(1.5, Math.max(1, (dpr * Math.min(window.innerWidth, 1600)) / W));
    for (const c of [canvas, this.ground, this.grain, this.body, this.voice]) {
      c.width = Math.round(W * this.scale);
      c.height = Math.round(H * this.scale);
    }
    this.ctx = canvas.getContext('2d')!;
    this.bctx = this.body.getContext('2d')!;
    this.vctx = this.voice.getContext('2d')!;
    for (const c of [this.ctx, this.bctx, this.vctx]) {
      c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    paintGrain(this.grain, W, H, this.scale);
    this.repaintGround();
    this.analyzer = new InteractionAnalyzer(events);
    const hands = (id: ParticipantId) => this.strands.filter((s) => s.id === id);
    this.gifts = new GiftSystem({
      W, H,
      time: () => this.time,
      now: () => this.events.now(),
      bodySource: () => this.bodySource,
      hands,
      anchor: (id) => this.anchorFor(id),
      push: (e) => this.events.push(e),
      stamp: (draw) => { this.bctx.globalCompositeOperation = 'source-over'; draw(this.bctx); },
      spawn: (x, y, vx, vy, c, life) => this.spawn(x, y, vx, vy, c, life, 'body', 1.1),
    });
    this.sanctuary = new Sanctuary({
      W, H,
      time: () => this.time,
      hands,
      push: (e) => this.events.push(e),
      bilingual: (ctx, draw, alpha) => this.bilingual(ctx, draw, alpha),
    });

    for (const id of PARTICIPANTS) {
      for (const hand of [0, 1] as const) {
        this.strands.push({
          id, hand,
          pos: { x: 0, y: 0 }, prev: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
          speed: 0, presence: 0, visible: false, wasVisible: false, initialized: false,
          trail: [], fibers: null, edges: null, normal: { x: 0, y: 1 }, travelled: hand * 97, lastMark: 0,
        });
      }
    }
  }

  start() {
    cancelAnimationFrame(this.raf); // idempotent: never two loops
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  // ================================================================ styles

  /** Ink for whoever owns a mark. Shared marks are drawn "bilingually": blue on the white side, white on the blue side. */
  private style(owner: ParticipantId, alpha = 1): SymbolStyle {
    return owner === 'A' ? { ink: COBALT_DEEP, halo: PAPER_RGB, alpha } : { ink: WHITE, halo: COBALT, alpha };
  }

  /** Draw something once per ground: clipped to the white half in A's ink and to the blue half in B's. */
  private bilingual(ctx: CanvasRenderingContext2D, draw: (s: SymbolStyle, side: ParticipantId) => void, alpha = 1) {
    for (const side of ['A', 'B'] as const) {
      ctx.save();
      ctx.beginPath();
      if (side === 'A') ctx.rect(-10, -10, W / 2 + 10, H + 20);
      else ctx.rect(W / 2, -10, W / 2 + 10, H + 20);
      ctx.clip();
      draw(this.style(side, alpha), side);
      ctx.restore();
    }
  }

  private sideInk(x: number): RGB {
    return x < W / 2 ? COBALT_DEEP : WHITE;
  }

  private repaintGround() {
    paintGround(this.ground, W, H, this.scale, this.fusion);
    this.paintedFusion = this.fusion;
  }

  // ================================================================ frame

  private frame(now: number) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += dt;
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();

    const targets = this.targetProvider(now);
    this.audio = this.audioProvider(dt);
    for (const s of this.strands) this.updateStrand(s, targets, dt);

    const present = { A: targets.A.present, B: targets.B.present };
    const fd = this.analyzer.update(this.strands, present, this.audio, dt, H, this.bodySource, this.speakerMode);
    this.frameData = fd;

    if (!this.paused) {
      for (const s of this.strands) (s.id === 'A' ? this.depositPen(s) : this.depositRibbon(s));
      this.depositVoice(dt, fd);
      this.depositInteraction(dt, fd);
      this.checkGestures(dt, fd);
      this.fadeVoice(dt);
      this.typeGlyphs();
      const keep = Math.exp(-dt / 45); // saturation relaxes with a ~45 s time constant
      for (let i = 0; i < this.inkDensity.length; i++) this.inkDensity[i] *= keep;
    }
    this.gifts.update(dt, this.paused);
    if (!this.paused) this.sanctuary.update(dt, fd.sync);
    this.updateParticles(dt);
    this.updateGlyphs();

    // Fusion grows with what is made together: ~20 shared shapes, ~8 motifs or ~50 shared symbols each fill it halfway.
    const targetFusion = clamp01(this.nodeCount * 0.025 + this.motifCount * 0.06 + this.sharedSymbolCount * 0.01);
    this.fusion += (targetFusion - this.fusion) * ease(dt, 0.8);
    if (Math.abs(this.fusion - this.paintedFusion) >= 0.04) this.repaintGround();

    this.render(fd);
  }

  private updateStrand(s: Strand, targets: EngineTargets, dt: number) {
    const p = targets[s.id];
    const tg = p.hands[s.hand];
    s.visible = p.present && tg.visible;
    const tp = { x: tg.x * W, y: tg.y * H };

    if (s.visible && !s.wasVisible) {
      if (!s.initialized || Math.hypot(tp.x - s.pos.x, tp.y - s.pos.y) > 0.15 * H) {
        s.pos = { ...tp };
        s.trail = [];
      }
      s.fibers = null;
      s.edges = null;
      s.initialized = true;
    }

    s.prev = { ...s.pos };
    if (s.visible) {
      const k = ease(dt, 16); // pose arrives ~15 Hz; ease toward it at display rate
      s.pos = { x: s.pos.x + (tp.x - s.pos.x) * k, y: s.pos.y + (tp.y - s.pos.y) * k };
    }
    s.vel = { x: (s.pos.x - s.prev.x) / dt, y: (s.pos.y - s.prev.y) / dt };
    s.speed += (Math.hypot(s.vel.x, s.vel.y) / H - s.speed) * ease(dt, 8);

    const vmag = Math.hypot(s.vel.x, s.vel.y);
    if (vmag > 2) {
      let nx = -s.vel.y / vmag, ny = s.vel.x / vmag;
      if (nx * s.normal.x + ny * s.normal.y < 0) { nx = -nx; ny = -ny; }
      const k = ease(dt, 10);
      const x = s.normal.x + (nx - s.normal.x) * k, y = s.normal.y + (ny - s.normal.y) * k;
      const m = Math.hypot(x, y) || 1;
      s.normal = { x: x / m, y: y / m };
    }

    s.presence += ((s.visible ? 1 : 0) - s.presence) * ease(dt, s.visible ? 6 : 2.5);
    if (s.visible) {
      s.trail.push({ ...s.pos });
      if (s.trail.length > TRAIL_LEN) s.trail.shift();
    } else if (s.trail.length) s.trail.shift();
    s.wasVisible = s.visible;
  }

  /** RMS → stroke width multiplier and brightness. */
  private voiceInk() {
    const L = this.audio.source === 'off' ? 0 : this.audio.level;
    return { width: 1 + 2.2 * L, bright: L, alpha: 0.75 + 0.5 * L };
  }

  // ================================================================ body: A — cobalt pen on white

  /** How much fresh ink this spot still takes (1 = clean paper … INK_FLOOR = saturated). Counts one deposit. */
  private inkRoom(p: Vec2): number {
    const cx = Math.min(INK_COLS - 1, Math.max(0, Math.floor(p.x / INK_CELL)));
    const cy = Math.min(INK_ROWS - 1, Math.max(0, Math.floor(p.y / INK_CELL)));
    const i = cy * INK_COLS + cx;
    const n = this.inkDensity[i];
    this.inkDensity[i] = n + 1;
    return Math.max(INK_FLOOR, 1 / (1 + n / INK_HALF));
  }

  private depositPen(s: Strand) {
    if (!s.visible || s.presence < 0.15) { s.fibers = null; return; }
    const len = Math.hypot(s.pos.x - s.prev.x, s.pos.y - s.prev.y);
    if (len < 0.25) return; // stillness → blank space
    s.travelled += len;
    const v = this.voiceInk();
    const sp = clamp01(s.speed / 1.4);
    const amp = 1.5 + sp * 11;
    const col = mix(COBALT_DEEP, ELECTRIC, v.bright * 0.7);
    const weave = this.frameData?.weave ?? 0;
    const room = this.inkRoom(s.pos);
    const ctx = this.bctx;
    ctx.globalCompositeOperation = 'source-over';

    const pts: Vec2[] = [];
    for (let i = 0; i < 3; i++) {
      const off = Math.sin(s.travelled * (0.05 - sp * 0.03) + i * 2.1 + s.hand) * amp + (i - 1) * 1.4;
      pts.push({ x: s.pos.x + s.normal.x * off, y: s.pos.y + s.normal.y * off });
    }
    if (s.fibers) {
      for (let i = 0; i < 3; i++) {
        const w = (i === 1 ? 0.95 : 0.5) * v.width;
        ctx.strokeStyle = rgba(PAPER_RGB, 0.5 * s.presence * room); // knockout halo: legible on the blue ground
        ctx.lineWidth = w + 1.6;
        ctx.beginPath(); ctx.moveTo(s.fibers[i].x, s.fibers[i].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
        ctx.strokeStyle = rgba(mix(col, LAVENDER, weave * 0.35), (i === 1 ? 0.75 : 0.4) * v.alpha * s.presence * room);
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(s.fibers[i].x, s.fibers[i].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      }
    }
    s.fibers = pts;

    // Geometric hatching; tick length grows with sound level.
    if (s.travelled - s.lastMark > 9) {
      s.lastMark = s.travelled;
      const tick = 3 + v.bright * 12 + sp * 4;
      ctx.strokeStyle = rgba(col, 0.4 * v.alpha * room);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(s.pos.x - s.normal.x * tick, s.pos.y - s.normal.y * tick);
      ctx.lineTo(s.pos.x + s.normal.x * tick, s.pos.y + s.normal.y * tick);
      ctx.stroke();
    }
  }

  // ================================================================ body: B — white ribbon on blue

  private depositRibbon(s: Strand) {
    if (!s.visible || s.presence < 0.15) { s.edges = null; return; }
    const len = Math.hypot(s.pos.x - s.prev.x, s.pos.y - s.prev.y);
    if (len < 0.25) return;
    s.travelled += len;
    const v = this.voiceInk();
    const sp = clamp01(s.speed / 1.4);
    const amp = 1 + sp * 9;
    const centerOff = Math.sin(s.travelled * (0.035 - sp * 0.02) + s.hand * 1.7) * amp;
    const twist = 0.25 + 0.75 * Math.abs(Math.cos(s.travelled * 0.022 + s.hand));
    const hw = (2.4 + sp * 4.5) * v.width * twist;
    const c = { x: s.pos.x + s.normal.x * centerOff, y: s.pos.y + s.normal.y * centerOff };
    const edges: [Vec2, Vec2] = [
      { x: c.x - s.normal.x * hw, y: c.y - s.normal.y * hw },
      { x: c.x + s.normal.x * hw, y: c.y + s.normal.y * hw },
    ];
    const weave = this.frameData?.weave ?? 0;
    const room = this.inkRoom(c);
    const ctx = this.bctx;
    ctx.globalCompositeOperation = 'source-over';
    if (s.edges) {
      ctx.fillStyle = rgba(mix(WHITE, LAVENDER, weave * 0.3), (0.42 + 0.2 * v.bright) * s.presence * room);
      ctx.beginPath();
      ctx.moveTo(s.edges[0].x, s.edges[0].y);
      ctx.lineTo(s.edges[1].x, s.edges[1].y);
      ctx.lineTo(edges[1].x, edges[1].y);
      ctx.lineTo(edges[0].x, edges[0].y);
      ctx.closePath();
      ctx.fill();
      // Cobalt outline: legible on the white ground; sky highlight on one edge.
      ctx.strokeStyle = rgba(COBALT, 0.6 * s.presence * room);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(s.edges[0].x, s.edges[0].y); ctx.lineTo(edges[0].x, edges[0].y);
      ctx.moveTo(s.edges[1].x, s.edges[1].y); ctx.lineTo(edges[1].x, edges[1].y);
      ctx.stroke();
      ctx.strokeStyle = rgba(mix(SKY, WHITE, v.bright), 0.9 * s.presence * room);
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(s.edges[1].x, s.edges[1].y); ctx.lineTo(edges[1].x, edges[1].y); ctx.stroke();
    }
    s.edges = edges;

    if (s.travelled - s.lastMark > 13) {
      s.lastMark = s.travelled;
      ctx.fillStyle = rgba(SKY, 0.9 * room);
      ctx.beginPath();
      ctx.arc(c.x + s.normal.x * (hw + 5), c.y + s.normal.y * (hw + 5), 0.9 + v.bright * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ================================================================ voice

  private participantCenter(id: ParticipantId): Vec2 | null {
    const l = this.strands.filter((s) => s.id === id && s.visible);
    if (!l.length) return null;
    return { x: l.reduce((m, s) => m + s.pos.x, 0) / l.length, y: l.reduce((m, s) => m + s.pos.y, 0) / l.length };
  }

  private conversationCenter(): Vec2 {
    const a = this.participantCenter('A'), b = this.participantCenter('B');
    if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return a ?? b ?? { x: W / 2, y: H / 2 };
  }

  private anchorFor(owner: Owner): Vec2 {
    if (owner === 'shared') return this.conversationCenter();
    return this.participantCenter(owner) ?? { x: owner === 'A' ? W * 0.27 : W * 0.73, y: H * 0.45 };
  }

  private depositVoice(dt: number, fd: InteractionFrame) {
    const a = this.audio;
    if (a.source === 'off') return;
    const ctx = this.vctx;
    ctx.globalCompositeOperation = 'source-over';

    // Activity → waveform ring; low → scale; rhythm (onset rate) → cadence; pitch → tint & waviness.
    const interval = Math.max(0.1, Math.min(0.3, 0.3 - a.onsetRate * 0.035));
    if (a.active && this.time - this.lastRipple > interval) {
      this.lastRipple = this.time;
      const owner: Owner = this.speakerMode;
      const c = this.anchorFor(owner);
      const rip: Ripple = {
        x: c.x, y: c.y, r0: 34 + a.low * 230, grow: 70 + a.low * 160, amp: a.level, pitch: a.pitchNorm,
        wave: a.wave.slice(), born: this.time, owner,
      };
      this.ripples.push(rip);
      if (this.ripples.length > 24) this.ripples.shift();
      this.drawWaveRing(ctx, rip, rip.r0, 0.22 + 0.25 * a.level, 0.75);
    }

    // High band → stipple grain around the people (blue on white, white on blue).
    this.grainAcc += dt * a.high * 160;
    const vis = this.strands.filter((s) => s.visible);
    while (this.grainAcc >= 1) {
      this.grainAcc -= 1;
      const src = vis.length ? vis[Math.floor(this.rnd() * vis.length)].pos : this.conversationCenter();
      const ang = this.rnd() * Math.PI * 2, r = 8 + Math.pow(this.rnd(), 0.7) * 64;
      const x = src.x + Math.cos(ang) * r, y = src.y + Math.sin(ang) * r;
      const c = x < W / 2 ? (this.rnd() < 0.7 ? COBALT : LAVENDER) : (this.rnd() < 0.7 ? WHITE : SKY);
      const sz = 0.6 + this.rnd() * 1.1;
      ctx.fillStyle = rgba(c, 0.55);
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      this.spawn(x, y, 0, 0, c, 0.5, 'voice', sz + 0.6);
    }

    // Voice + motion together → halftone bursts at the moving hands.
    if (fd.voiceMotionStrength > 0.12 && this.time - this.lastBurst > 0.25) {
      this.lastBurst = this.time;
      for (const s of this.strands) {
        if (!s.visible || s.speed < 0.15) continue;
        this.halftoneDisk(ctx, s.pos.x, s.pos.y, 14 + 34 * fd.voiceMotionStrength, s.pos.x < W / 2 ? ELECTRIC : SKY, 0.55);
      }
    }
  }

  /** Silence → the voice layer slowly dissolves (body ink stays). */
  private fadeVoice(dt: number) {
    if (this.audio.source === 'off' || this.audio.silenceSec < 0.8) return;
    const ctx = this.vctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt * 0.22)})`;
    ctx.fillRect(0, 0, this.voice.width, this.voice.height);
    ctx.restore();
  }

  private ringPath(ctx: CanvasRenderingContext2D, r: Ripple, radius: number) {
    const n = r.wave.length;
    const k = (8 + 26 * r.amp) * (0.7 + 0.8 * r.pitch);
    const harmonics = 1 + Math.round(r.pitch * 3); // higher pitch → finer ripple
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      const rr = radius + r.wave[(i * harmonics) % n] * k;
      const x = r.x + Math.cos(th) * rr, y = r.y + Math.sin(th) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  private drawWaveRing(ctx: CanvasRenderingContext2D, r: Ripple, radius: number, alpha: number, width: number) {
    const tint = (base: RGB, hi: RGB) => mix(base, hi, r.pitch * 0.8);
    const draw = (owner: ParticipantId) => {
      const ink = owner === 'A' ? tint(COBALT_DEEP, LAVENDER) : tint(WHITE, SKY);
      ctx.strokeStyle = rgba(ink, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      this.ringPath(ctx, r, radius);
      ctx.stroke();
    };
    if (r.owner === 'shared') this.bilingual(ctx, (_s, side) => draw(side));
    else draw(r.owner);
  }

  private halftoneDisk(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, c: RGB, alpha: number, half: 0 | 1 = 0) {
    ctx.fillStyle = rgba(c, alpha);
    const step = 5;
    for (let y = -R; y <= R; y += step) {
      for (let x = -R; x <= R; x += step) {
        if (half === 1 && x < 0) continue;
        const d = Math.hypot(x, y) / R;
        if (d > 1) continue;
        const r = (1 - d) * 1.9;
        if (r < 0.3) continue;
        ctx.beginPath();
        ctx.arc(cx + x, cy + y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ================================================================ interaction

  private depositInteraction(dt: number, fd: InteractionFrame) {
    const ctx = this.bctx;
    if (fd.best && fd.weave > 0.04) {
      const [a, b] = fd.best;
      this.drawBridge(ctx, a.pos, b.pos, fd.weave, 0.06 * fd.weave, 0.7);
    }
    if ((fd.weaveStarted || fd.nodeDue) && fd.best) this.addSharedShape(fd, fd.weaveStarted ? 30 : 18);
    for (const x of fd.crossings) {
      this.crossMark(x);
      this.addSymbol('star', 'shared', 'interaction', x, 16);
    }

    this.dustAcc += dt * fd.sync * 70;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const id: ParticipantId = this.rnd() < 0.5 ? 'A' : 'B';
      const src = this.strands.filter((s) => s.id === id && s.visible).sort((x, y) => y.speed - x.speed)[0];
      if (src) this.spawn(src.pos.x, src.pos.y, src.vel.x * 0.12, src.vel.y * 0.12, LAVENDER, 2.4, 'body', 1.1);
    }
  }

  /** Gesture / interaction triggers for the celestial layer. */
  private checkGestures(dt: number, fd: InteractionFrame) {
    const t = this.events.now();
    for (const id of PARTICIPANTS) {
      const hs = this.strands.filter((s) => s.id === id);
      const raised = hs.every((s) => s.visible && s.pos.y < H * 0.3);
      if (raised && t - this.lastWings[id] > 6) {
        this.lastWings[id] = t;
        const c = this.participantCenter(id)!;
        this.events.push({ type: 'arms_raised', participantId: id, source: this.bodySource, features: { y: +(c.y / H).toFixed(2) } });
        this.addSymbol('wings', id, 'gesture', { x: c.x, y: c.y + H * 0.14 }, 95);
      }
    }
    this.syncHold = fd.sync > 0.6 ? this.syncHold + dt : 0;
    if (this.syncHold > 2.5 && t - this.lastUnfold > 12) {
      this.lastUnfold = t;
      this.addSymbol('unfolding', 'shared', 'interaction', this.conversationCenter(), 110);
    }
  }

  /** Shared shape: a cut-out disc carrying both grounds — A's hatching on white, B's halftone on blue. */
  private addSharedShape(fd: InteractionFrame, R: number) {
    const [a, b] = fd.best!;
    const cx = (a.pos.x + b.pos.x) / 2, cy = (a.pos.y + b.pos.y) / 2;
    const ang = Math.atan2(b.pos.y - a.pos.y, b.pos.x - a.pos.x);
    const ctx = this.bctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(PAPER_RGB, 0.92);
    ctx.beginPath(); ctx.arc(0, 0, R, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(COBALT, 0.92);
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = rgba(COBALT_DEEP, 0.7);
    ctx.lineWidth = 0.6;
    for (let x = -R; x <= 0; x += 3.2) {
      ctx.beginPath(); ctx.moveTo(x, -R); ctx.lineTo(x + R * 0.5, R); ctx.stroke();
    }
    ctx.restore();
    this.halftoneDisk(ctx, 0, 0, R, WHITE, 0.9, 1);
    const rings = 2 + Math.round(fd.sync * 3);
    ctx.strokeStyle = rgba(LAVENDER, 0.85);
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= rings; i++) {
      ctx.beginPath(); ctx.arc(0, 0, R + i * 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    this.nodeCount++;
    this.flashes.push({ x: cx, y: cy, r: R, born: this.time, kind: 'node' });
    this.events.push({
      type: 'shared_shape', participantId: 'shared', source: 'derived',
      features: { x: +(cx / W).toFixed(3), y: +(cy / H).toFixed(3), rings, size: R },
    });
    if (fd.weaveStarted) this.addSymbol('halo', 'shared', 'interaction', { x: cx, y: cy - R * 0.2 }, R * 1.7);
    for (let i = 0; i < 40; i++) {
      const th = i * 2.399, sp = 25 + (i % 6) * 12;
      this.spawn(cx, cy, Math.cos(th) * sp, Math.sin(th) * sp, i % 2 ? LAVENDER : COBALT, 1.5, 'body', 1.2);
    }
  }

  private crossMark(p: Vec2) {
    const ctx = this.bctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(this.sideInk(p.x), 0.8);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    this.flashes.push({ x: p.x, y: p.y, r: 8, born: this.time, kind: 'cross' });
  }

  private drawBridge(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, w: number, alpha: number, width: number) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const px = -dy / d, py = dx / d;
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, rgba(COBALT_DEEP, alpha));
    grad.addColorStop(0.5, rgba(LAVENDER, alpha * 1.3));
    grad.addColorStop(1, rgba(WHITE, alpha * 1.2));
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    const amp = d * 0.3 * w + 3;
    for (let j = 0; j < 3; j++) {
      const ph = this.time * 1.7 + j * 2.094;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(
        a.x + dx * 0.33 + px * Math.sin(ph) * amp, a.y + dy * 0.33 + py * Math.sin(ph) * amp,
        a.x + dx * 0.66 - px * Math.sin(ph + 2.5) * amp, a.y + dy * 0.66 - py * Math.sin(ph + 2.5) * amp,
        b.x, b.y,
      );
      ctx.stroke();
    }
  }

  // ================================================================ symbols & motifs

  /**
   * Place a celestial symbol. Triggers: 'user' (chosen in the palette), 'gesture' / 'interaction'
   * (measured body events) or 'topic' (a shared topic found in what people wrote).
   * Never chosen from anyone's culture, religion or language identity.
   */
  addSymbol(kind: SymbolKind, owner: Owner, trigger: 'user' | 'gesture' | 'interaction' | 'topic', at?: Vec2, R?: number) {
    const p = at ?? this.anchorFor(owner);
    const size = R ?? (kind === 'wings' || kind === 'unfolding' ? 95 : kind === 'rays' || kind === 'halo' ? 70 : 48);
    this.liveSymbols.push({ kind, x: p.x, y: p.y, R: size, owner, born: this.time, dur: kind === 'star' ? 0.6 : 1.4, rot: 0 });
    this.symbolCounts[kind] = (this.symbolCounts[kind] ?? 0) + 1;
    if (trigger === 'user') this.symbolsByOwner[owner] = (this.symbolsByOwner[owner] ?? 0) + 1;
    if (owner === 'shared') this.sharedSymbolCount++;
    this.events.push({
      type: 'symbol', participantId: owner,
      source: trigger === 'user' ? 'user' : 'derived',
      features: { kind, trigger, x: +(p.x / W).toFixed(3), y: +(p.y / H).toFixed(3) },
    });
  }

  private drawLiveSymbol(ctx: CanvasRenderingContext2D, s: LiveSymbol, p: number, alpha: number) {
    if (s.owner === 'shared') this.bilingual(ctx, (st) => drawSymbol(ctx, s.kind, s.x, s.y, s.R, p, st, s.rot), alpha);
    else drawSymbol(ctx, s.kind, s.x, s.y, s.R, p, this.style(s.owner, alpha), s.rot);
  }

  /** Shared motif for a shared topic: flower + the topic's symbol + a bilingual label. */
  addMotif(topic: SharedTopic, motif: SymbolKind, labelZh: string) {
    const c = this.conversationCenter();
    const jitter = (this.motifCount % 3) - 1;
    const at = { x: c.x + jitter * 60, y: Math.max(140, Math.min(H - 160, c.y - 40 + jitter * 30)) };
    if (motif !== 'flower') this.addSymbol(motif, 'shared', 'topic', at, motif === 'wings' || motif === 'unfolding' ? 120 : 95);
    this.addSymbol('flower', 'shared', 'topic', at, 58);
    this.motifCount++;
    const label = labelZh && labelZh !== topic.label ? `${topic.label.toUpperCase()} · ${labelZh}` : topic.label.toUpperCase();
    this.queueLine(label, at.x, at.y + 100, `600 13px ${MONO}`, 'shared', true, true);
  }

  // ================================================================ typography

  private queueLine(text: string, x: number, y: number, font: string, owner: Owner, center = false, boxed = false) {
    const ctx = this.bctx;
    ctx.font = font;
    const chars = [...text];
    let width = 0;
    const widths = chars.map((ch) => { const w = ctx.measureText(ch).width; width += w; return w; });
    let cx = center ? x - width / 2 : x;
    const glyphs: Glyph[] = chars.map((ch, i) => {
      const g: Glyph = { ch, x: cx, y, font, owner, boxW: boxed && i === 0 ? width : undefined };
      cx += widths[i];
      return g;
    });
    this.textJobs.push({ glyphs, i: 0 });
  }

  /** Language → typography on the writer's side, wrapped, with the translation beneath. */
  addText(m: TextMessage) {
    const owner = m.participantId;
    const row = this.textRows[owner]++;
    const x0 = owner === 'A' ? W * 0.05 : W * 0.57;
    const maxW = W * 0.37;
    const y0 = 96 + (row % 7) * 104;
    const cjk = m.lang === 'zh' || m.lang === 'ja';
    const font = `400 ${cjk ? 25 : 24}px ${SERIF}`;
    const ctx = this.bctx;
    ctx.font = font;
    const lines: string[] = [];
    let cur = '';
    const tokens = cjk ? [...m.text] : m.text.split(/(\s+)/);
    for (const tk of tokens) {
      if (ctx.measureText(cur + tk).width > maxW && cur) { lines.push(cur.trimEnd()); cur = tk.trimStart(); }
      else cur += tk;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach((ln, i) => this.queueLine(ln, x0, y0 + i * 30, font, owner));
    const used = Math.min(2, lines.length);
    this.anchors.set(m.id, { x: x0, y: y0 + used * 30, owner, lines: 0 });
    this.textsDrawn++;
    if (m.translation) this.addTranslation(m);
  }

  addTranslation(m: TextMessage) {
    const a = this.anchors.get(m.id);
    if (!a || !m.translation) return;
    const tag = m.translation.source === 'ai' ? 'AI' : m.translation.source === 'manual' ? 'EDITED' : m.translation.source === 'phrasebook' ? 'PHRASEBOOK' : 'DEMO GLOSS';
    const line = `→ ${langName(m.translation.to)} [${tag}] ${m.translation.text}`;
    this.queueLine(line.length > 90 ? line.slice(0, 88) + '…' : line, a.x, a.y - 4 + a.lines * 17, `500 12px ${MONO}`, a.owner);
    a.lines++;
  }

  /** A language corrected by hand is noted in the artwork too (detection errors stay visible, not hidden). */
  addCorrection(m: TextMessage) {
    const a = this.anchors.get(m.id);
    if (!a) return;
    this.queueLine(`↺ ${langName(m.lang)} (corrected)`, a.x, a.y - 4 + a.lines * 17, `500 11px ${MONO}`, a.owner);
    a.lines++;
    if (m.translation) this.addTranslation(m);
  }

  private typeGlyphs() {
    const ctx = this.bctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textBaseline = 'alphabetic';
    for (const job of this.textJobs) {
      for (let k = 0; k < 2 && job.i < job.glyphs.length; k++, job.i++) {
        const g = job.glyphs[job.i];
        ctx.font = g.font;
        const wob = Math.sin(job.i * 0.37) * 1.2;
        const draw = (st: SymbolStyle) => {
          if (st.halo) {
            ctx.strokeStyle = rgba(st.halo, 0.85);
            ctx.lineWidth = 3;
            ctx.strokeText(g.ch, g.x, g.y + wob);
          }
          ctx.fillStyle = rgba(st.ink, 0.95);
          ctx.fillText(g.ch, g.x, g.y + wob);
          if (g.boxW) {
            ctx.strokeStyle = rgba(st.ink, 0.8);
            ctx.lineWidth = 0.8;
            ctx.strokeRect(g.x - 8, g.y - 15, g.boxW + 16, 22);
          }
        };
        if (g.owner === 'shared') this.bilingual(ctx, (st) => draw(st));
        else draw(this.style(g.owner));
      }
    }
    this.textJobs = this.textJobs.filter((j) => j.i < j.glyphs.length);
  }

  // ================================================================ particles

  private spawn(x: number, y: number, vx: number, vy: number, c: RGB, life: number, layer: 'body' | 'voice', size: number) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, c, layer, size });
  }

  private updateParticles(dt: number) {
    const t = this.time;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      if (!this.paused && p.layer === 'voice') {
        p.life -= dt;
      } else if (!this.paused) {
        const ang = (Math.sin(p.x * 0.0042 + t * 0.25) + Math.cos(p.y * 0.0051 - t * 0.2)) * Math.PI;
        p.vx += (Math.cos(ang) * 18 - p.vx) * ease(dt, 1.6);
        p.vy += (Math.sin(ang) * 18 - p.vy) * ease(dt, 1.6);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        const ctx = this.bctx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgba(p.c, 0.09 * (p.life / p.max));
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (p.life > 0) alive.push(p);
    }
    this.particles = alive;
  }

  private updateGlyphs() {
    for (const e of this.events.since(1)) {
      if (e.timestamp <= this.lastGlyphT) continue;
      this.lastGlyphT = e.timestamp;
      this.glyphs = (this.glyphs + eventGlyph(e.type)).slice(-28);
    }
  }

  // ================================================================ live layer

  private composeArt(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.ground, 0, 0);
    ctx.drawImage(this.grain, 0, 0);
    ctx.drawImage(this.voice, 0, 0);
    ctx.drawImage(this.body, 0, 0);
    ctx.restore();
  }

  private render(fd: InteractionFrame) {
    const ctx = this.ctx;
    this.composeArt(ctx);
    ctx.globalCompositeOperation = 'source-over';
    if (this.sanctuary.active) this.sanctuary.draw(ctx);

    for (const r of this.ripples) {
      const age = this.time - r.born;
      if (age > 1.6) continue;
      this.drawWaveRing(ctx, r, r.r0 + age * r.grow, 0.6 * (1 - age / 1.6) * (0.4 + r.amp), 1);
    }

    if (fd.best && fd.weave > 0.35) {
      const [a, b] = fd.best;
      const k = (fd.weave - 0.35) / 0.65;
      ctx.lineWidth = 0.7;
      for (let i = 1; i <= 7; i++) {
        ctx.strokeStyle = rgba(this.sideInk(a.pos.x), 0.3 * k);
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(a.pos.x, a.pos.y, i * 11, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba(this.sideInk(b.pos.x), 0.3 * k);
        ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, i * 11, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (fd.best && fd.weave > 0.02) {
      const [a, b] = fd.best;
      this.drawBridge(ctx, a.pos, b.pos, fd.weave, 0.75 * fd.weave, 1.3);
    }

    // Trails and markers: A = cobalt pen + hollow circle, B = white band + filled square.
    for (const s of this.strands) {
      if (s.presence < 0.02 || s.trail.length < 2) continue;
      const passes: [number, number, RGB][] = s.id === 'A'
        ? [[3.4, 0.55, PAPER_RGB], [1.4, 0.95, COBALT_DEEP]]
        : [[7, 0.35, COBALT], [4.5, 0.75, WHITE], [1, 0.9, SKY]];
      for (const [lw, al, c] of passes) {
        ctx.strokeStyle = rgba(c, al * s.presence);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(s.trail[0].x, s.trail[0].y);
        for (let i = 1; i < s.trail.length - 1; i++) {
          ctx.quadraticCurveTo(s.trail[i].x, s.trail[i].y, (s.trail[i].x + s.trail[i + 1].x) / 2, (s.trail[i].y + s.trail[i + 1].y) / 2);
        }
        ctx.lineTo(s.pos.x, s.pos.y);
        ctx.stroke();
      }
      const r = 6 + clamp01(s.speed / 1.4) * 6;
      ctx.lineWidth = 1.3;
      if (s.id === 'A') {
        ctx.fillStyle = rgba(PAPER_RGB, 0.95 * s.presence);
        ctx.strokeStyle = rgba(COBALT_DEEP, 0.95 * s.presence);
        ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.pos.x - r - 6, s.pos.y); ctx.lineTo(s.pos.x + r + 6, s.pos.y);
        ctx.moveTo(s.pos.x, s.pos.y - r - 6); ctx.lineTo(s.pos.x, s.pos.y + r + 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(WHITE, 0.98 * s.presence);
        ctx.strokeStyle = rgba(COBALT, 0.95 * s.presence);
        ctx.fillRect(s.pos.x - r * 0.75, s.pos.y - r * 0.75, r * 1.5, r * 1.5);
        ctx.strokeRect(s.pos.x - r * 0.75, s.pos.y - r * 0.75, r * 1.5, r * 1.5);
        ctx.strokeStyle = rgba(SKY, 0.8 * s.presence);
        ctx.beginPath(); ctx.arc(s.pos.x, s.pos.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    for (const f of this.flashes) {
      const age = this.time - f.born;
      if (age > 1.4) continue;
      ctx.strokeStyle = rgba(f.kind === 'node' ? LAVENDER : this.sideInk(f.x), 0.85 * (1 - age / 1.4));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (1.3 + age * 2.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.flashes.length > 30) this.flashes.splice(0, this.flashes.length - 30);

    for (const p of this.particles) {
      ctx.fillStyle = rgba(p.c, 0.75 * (p.life / p.max));
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size + 0.4, p.size + 0.4);
    }

    // Celestial symbols unfold live, then are stamped permanently into the body ink.
    const done: LiveSymbol[] = [];
    for (const s of this.liveSymbols) {
      const p = (this.time - s.born) / s.dur;
      if (p >= 1) done.push(s);
      else this.drawLiveSymbol(ctx, s, p, 0.9);
    }
    for (const s of done) this.drawLiveSymbol(this.bctx, s, 1, 0.85);
    if (done.length) this.liveSymbols = this.liveSymbols.filter((s) => !done.includes(s));

    // Gifts in flight, waiting to be caught, or held.
    this.gifts.draw(ctx, true);

    // Recording tap: the artwork only — before signal marks, and never any UI.
    if (this.recordTarget) {
      const rc = this.recordTarget.getContext('2d')!;
      rc.drawImage(this.canvas(), 0, 0, this.recordTarget.width, this.recordTarget.height);
      if (this.filmOverlay) {
        rc.save();
        rc.setTransform(this.recordTarget.width / W, 0, 0, this.recordTarget.height / H, 0, 0);
        this.filmOverlay(rc, W, H);
        rc.restore();
      }
    }

    if (this.showMarks) this.drawMarks(ctx, fd);
  }

  private canvas() {
    return this.ctx.canvas;
  }

  private drawMarks(ctx: CanvasRenderingContext2D, fd: InteractionFrame) {
    drawSignalMarks(ctx, {
      W, H, time: this.time, audio: this.audio, bodySource: this.bodySource, glyphs: this.glyphs, speaker: this.speakerMode,
      hands: this.strands.filter((s) => s.visible && s.presence > 0.3).map((s) => ({ id: s.id, hand: s.hand, x: s.pos.x, y: s.pos.y })),
      best: fd.best ? [fd.best[0].pos, fd.best[1].pos] : null,
      handDistance: fd.handDistance,
      weave: fd.weave,
    });
  }

  // ================================================================ public API

  setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    this.events.push({ type: p ? 'pause' : 'resume', participantId: 'system', source: 'system', features: {} });
    if (!p) for (const s of this.strands) { s.fibers = null; s.edges = null; }
  }

  reset() {
    for (const c of [this.bctx, this.vctx]) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.body.width, this.body.height);
      c.restore();
    }
    this.inkDensity.fill(0);
    this.nodeCount = 0;
    this.symbolCounts = {};
    this.sharedSymbolCount = 0;
    this.motifCount = 0;
    this.textsDrawn = 0;
    this.fusion = 0;
    this.repaintGround();
    this.particles = [];
    this.ripples = [];
    this.flashes = [];
    this.liveSymbols = [];
    this.textJobs = [];
    this.anchors.clear();
    this.textRows = { A: 0, B: 0 };
    this.analyzer.reset();
    this.gifts.reset();
    this.sanctuary.reset();
    this.symbolsByOwner = { A: 0, B: 0, shared: 0 };
    for (const s of this.strands) { s.fibers = null; s.edges = null; s.trail = []; }
    this.events.push({ type: 'canvas_reset', participantId: 'system', source: 'system', features: {} });
  }

  /** Phase 6: sanctuary state for the UI and report. */
  sanctuaryStats() {
    return this.sanctuary.stats();
  }

  /** Seal the current sanctuary into the permanent artwork. */
  sealSanctuary() {
    this.sanctuary.seal((draw) => { this.bctx.globalCompositeOperation = 'source-over'; draw(this.bctx); });
  }

  artStats(): ArtStats {
    return {
      userSymbolsBy: { ...this.symbolsByOwner },
      sharedShapes: this.nodeCount,
      crossings: this.analyzer.crossingCount,
      symbols: { ...this.symbolCounts },
      fusion: this.fusion,
      textsDrawn: this.textsDrawn,
      motifs: this.motifCount,
    };
  }

  getStats(): EngineStats {
    const fd = this.frameData;
    const a = this.audio;
    const parts = {} as EngineStats['participants'];
    for (const id of PARTICIPANTS) {
      const hs = this.strands.filter((s) => s.id === id);
      const hands = hs.map((s) => ({ x: s.pos.x / W, y: s.pos.y / H, speed: s.visible ? s.speed : 0, visible: s.visible })) as EngineStats['participants']['A']['hands'];
      parts[id] = { present: hs.some((s) => s.visible) || hs.some((s) => s.presence > 0.5), hands, maxSpeed: Math.max(hands[0].speed, hands[1].speed) };
    }

    const effects: EngineStats['effects'] = [];
    for (const id of PARTICIPANTS) {
      const p = parts[id];
      if (!p.present) continue;
      const sp = clamp01(p.maxSpeed / 1.4);
      effects.push(p.maxSpeed < 0.03
        ? { input: `${id} still`, effect: 'no new line → blank space' }
        : { input: `${id} wrist speed ${p.maxSpeed.toFixed(2)}`, effect: `${PALETTE[id].style} wave ±${(id === 'A' ? 1.5 + sp * 11 : 1 + sp * 9).toFixed(0)} px` });
    }
    if (a.source !== 'off') {
      effects.push({ input: `RMS ${a.db.toFixed(0)} dB · level ${a.level.toFixed(2)}`, effect: `line width ×${(1 + 2.2 * a.level).toFixed(1)}, brighter ink` });
      if (a.active) {
        effects.push({ input: `low band ${a.low.toFixed(2)}`, effect: `sound ring radius ${(34 + a.low * 230).toFixed(0)} px` });
        effects.push({ input: `high band ${a.high.toFixed(2)}`, effect: `${(a.high * 160).toFixed(0)} grains / s` });
        if (a.pitchHz > 0) effects.push({ input: `pitch ${a.pitchHz.toFixed(0)} Hz`, effect: `wave tint & finer ripple ×${1 + Math.round(a.pitchNorm * 3)}` });
        effects.push({ input: `rhythm ${a.onsetRate.toFixed(1)} onsets/s`, effect: `ring every ${Math.max(0.1, Math.min(0.3, 0.3 - a.onsetRate * 0.035)).toFixed(2)} s` });
        effects.push({ input: `voice: ${this.speakerMode === 'shared' ? 'shared mic' : `${this.speakerMode} (manual turn)`}`, effect: this.speakerMode === 'shared' ? 'one shared wave, both grounds' : `${this.speakerMode}'s wave style at ${this.speakerMode}` });
      } else if (a.silenceSec > 0.8) {
        effects.push({ input: `silence ${a.silenceSec.toFixed(1)} s`, effect: 'voice layer dissolving' });
      }
    }
    if (fd?.handDistance != null && fd.weave > 0.03)
      effects.push({ input: `hand distance ${fd.handDistance.toFixed(2)} < ${WEAVE_FAR}`, effect: `weave bridge ${fd.weave.toFixed(2)}` });
    if (fd && fd.sync > 0.08) effects.push({ input: `simultaneous motion ${fd.sync.toFixed(2)}`, effect: this.syncHold > 0 ? `unfolding in ${Math.max(0, 2.5 - this.syncHold).toFixed(1)} s` : 'lavender shared dust' });
    if (fd?.voiceMotion) effects.push({ input: 'sound + motion together', effect: 'halftone bursts at moving hands' });
    if (this.fusion > 0.02) effects.push({ input: `${this.nodeCount} shapes · ${this.motifCount} motifs`, effect: `grounds fused ${(this.fusion * 100).toFixed(0)}%` });

    return {
      renderFps: this.frameTimes.length,
      bodySource: this.bodySource,
      audio: a,
      participants: parts,
      handDistance: fd?.handDistance ?? null,
      approachRate: fd?.approachRate ?? 0,
      weave: fd?.weave ?? 0,
      sync: fd?.sync ?? 0,
      voiceMotion: fd?.voiceMotion ?? false,
      sharedNodes: this.nodeCount,
      crossings: this.analyzer.crossingCount,
      symbols: Object.values(this.symbolCounts).reduce((s, n) => s + n, 0),
      fusion: this.fusion,
      speakerMode: this.speakerMode,
      effects,
      paused: this.paused,
      elapsed: this.events.now(),
    };
  }

  /** Export the portrait: pure artwork by default; `withMarks` adds signal marks and a caption. */
  exportPNG(withMarks: boolean, prompt: string): Promise<Blob | null> {
    const out = document.createElement('canvas');
    out.width = this.body.width;
    out.height = this.body.height;
    const c = out.getContext('2d')!;
    this.composeArt(c);
    // Live-built parts of the artwork: the sanctuary and any gifts still travelling or held.
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.sanctuary.active) this.sanctuary.draw(c, false);
    this.gifts.draw(c, false);
    if (withMarks) {
      if (this.frameData) this.drawMarks(c, this.frameData);
      const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      c.font = `italic 400 32px ${SERIF}`;
      c.strokeStyle = rgba(PAPER_RGB, 0.9);
      c.lineWidth = 4;
      c.strokeText('The Babel', 40, H - 58);
      c.fillStyle = rgba(COBALT_DEEP, 1);
      c.fillText('The Babel', 40, H - 58);
      c.font = `500 12px ${MONO}`;
      const cap = `${prompt.toUpperCase()}  //  ${date.toUpperCase()}  //  ${this.nodeCount} SHARED SHAPES  //  ${this.motifCount} MOTIFS`;
      c.strokeText(cap, 40, H - 34);
      c.fillStyle = rgba(INK, 0.85);
      c.fillText(cap, 40, H - 34);
    }
    // toBlob occasionally never calls back (seen in headless Chromium under load): fall back to a data URL.
    return new Promise((res) => {
      let done = false;
      const finish = (b: Blob | null) => { if (!done) { done = true; res(b); } };
      out.toBlob(finish, 'image/png');
      window.setTimeout(() => {
        if (done) return;
        try {
          const bin = atob(out.toDataURL('image/png').split(',')[1]);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          finish(new Blob([u8], { type: 'image/png' }));
        } catch { finish(null); }
      }, 5000);
    });
  }
}
