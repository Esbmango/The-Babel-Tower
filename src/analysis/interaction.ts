import { EventLog, round } from '../engine/events';
import { PARTICIPANTS, type AudioFeatures, type BodySource, type ParticipantId, type SpeakerMode, type Vec2 } from '../types';

/** Hand state as seen by the analyzer, in the engine's logical pixel space. */
export interface HandState {
  id: ParticipantId;
  hand: 0 | 1;
  pos: Vec2;
  vel: Vec2;
  /** frame heights per second */
  speed: number;
  visible: boolean;
}

export interface InteractionFrame {
  best: [HandState, HandState] | null;
  /** Closest A↔B hand distance in frame heights (2D image space). */
  handDistance: number | null;
  /** d(distance)/dt, frame heights per second; negative = approaching. */
  approachRate: number;
  /** 0..1 proximity-driven weave strength. */
  weave: number;
  /** 0..1 both moving at once, boosted when directions match (or mirror). */
  sync: number;
  /** Sound and body motion happening in the same window. */
  voiceMotion: boolean;
  voiceMotionStrength: number;
  /** Fired this frame. */
  weaveStarted: boolean;
  nodeDue: boolean;
  crossings: Vec2[];
}

export const WEAVE_FAR = 0.3;
export const WEAVE_NEAR = 0.09;
const HISTORY_SEC = 1.5;
const MOVING = 0.15;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => {
  const s = clamp01(v);
  return s * s * (3 - 2 * s);
};
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

function segIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): Vec2 | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q1.x - p1.x) * s.y - (q1.y - p1.y) * s.x) / den;
  const u = ((q1.x - p1.x) * r.y - (q1.y - p1.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: p1.x + t * r.x, y: p1.y + t * r.y } : null;
}

/**
 * Multimodal interaction analysis. Turns per-frame hand + shared-audio features into a few
 * continuous signals for the art engine, and a small number of discrete, timestamped events.
 * Nothing here estimates emotion, personality or "communication quality".
 */
export class InteractionAnalyzer {
  private weave = 0;
  private sync = 0;
  private approachRate = 0;
  private lastDist: number | null = null;
  private weaveActive = false;
  private weaveStartedAt = 0;
  private lastNodeAt = -Infinity;
  private syncActive = false;
  private vmOnFor = 0;
  private vmOffFor = 0;
  private vmActive = false;
  private vmStartedAt = 0;
  private vmStrength = 0;
  private soundActive = false;
  private silenceLogged = false;
  private lastApproachAt = -Infinity;
  private lastCrossAt = -Infinity;
  private presentPrev: Record<ParticipantId, boolean> = { A: false, B: false };
  private history = new Map<string, { t: number; p: Vec2 }[]>();
  private lastSummary = 0;
  private lastSample = 0;
  crossingCount = 0;

  constructor(private events: EventLog) {}

  update(
    hands: HandState[],
    present: Record<ParticipantId, boolean>,
    audio: AudioFeatures,
    dt: number,
    H: number,
    bodySource: BodySource,
    speaker: SpeakerMode = 'shared',
  ): InteractionFrame {
    const t = this.events.now();
    const out: InteractionFrame = {
      best: null, handDistance: null, approachRate: 0, weave: 0, sync: 0,
      voiceMotion: false, voiceMotionStrength: 0, weaveStarted: false, nodeDue: false, crossings: [],
    };

    // ---- presence
    for (const id of PARTICIPANTS) {
      if (present[id] !== this.presentPrev[id]) {
        this.events.push({ type: present[id] ? 'participant_enter' : 'participant_leave', participantId: id, source: bodySource, features: {} });
        this.presentPrev[id] = present[id];
      }
    }

    const A = hands.filter((h) => h.id === 'A' && h.visible);
    const B = hands.filter((h) => h.id === 'B' && h.visible);

    // ---- distance, approach
    let minD = Infinity;
    for (const a of A) for (const b of B) {
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) / H;
      if (d < minD) { minD = d; out.best = [a, b]; }
    }
    if (out.best) {
      out.handDistance = minD;
      if (this.lastDist !== null) this.approachRate += ((minD - this.lastDist) / dt - this.approachRate) * ease(dt, 4);
      this.lastDist = minD;
      if (this.approachRate < -0.35 && minD < 0.5 && t - this.lastApproachAt > 2) {
        this.lastApproachAt = t;
        this.events.push({ type: 'approach', participantId: 'shared', source: 'derived', features: { distance: round(minD), rate: round(this.approachRate) } });
      }
    } else {
      this.lastDist = null;
      this.approachRate *= 0.9;
    }
    out.approachRate = this.approachRate;

    // ---- weave (proximity)
    const weaveTarget = out.best ? smooth01((WEAVE_FAR - minD) / (WEAVE_FAR - WEAVE_NEAR)) : 0;
    this.weave += (weaveTarget - this.weave) * ease(dt, 4);
    out.weave = this.weave;
    if (!this.weaveActive && this.weave > 0.55 && out.best) {
      this.weaveActive = true;
      this.weaveStartedAt = t;
      this.lastNodeAt = t;
      out.weaveStarted = true;
      this.events.push({ type: 'weave_start', participantId: 'shared', source: 'derived', features: { handDistance: round(minD) } });
    } else if (this.weaveActive && this.weave < 0.3) {
      this.weaveActive = false;
      this.events.push({ type: 'weave_end', participantId: 'shared', source: 'derived', features: { durationSec: round(t - this.weaveStartedAt, 2) } });
    } else if (this.weaveActive && out.best && t - this.lastNodeAt > 2.2) {
      this.lastNodeAt = t;
      out.nodeDue = true;
    }

    // ---- simultaneous motion
    const fastest = (l: HandState[]) => l.reduce<HandState | null>((m, h) => (!m || h.speed > m.speed ? h : m), null);
    const fa = fastest(A), fb = fastest(B);
    let syncTarget = 0;
    if (fa && fb) {
      const both = smooth01((Math.min(fa.speed, fb.speed) - 0.12) / 0.35);
      const ma = Math.hypot(fa.vel.x, fa.vel.y), mb = Math.hypot(fb.vel.x, fb.vel.y);
      let sim = 0;
      if (ma > 1 && mb > 1) {
        const dot = (fa.vel.x * fb.vel.x + fa.vel.y * fb.vel.y) / (ma * mb);
        const mirrored = (-fa.vel.x * fb.vel.x + fa.vel.y * fb.vel.y) / (ma * mb);
        sim = Math.max(0, dot, mirrored);
      }
      syncTarget = both * (0.4 + 0.6 * sim);
    }
    this.sync += (syncTarget - this.sync) * ease(dt, 3);
    out.sync = this.sync;
    if (!this.syncActive && this.sync > 0.5) {
      this.syncActive = true;
      this.events.push({ type: 'simultaneous_motion_start', participantId: 'shared', source: 'derived', features: { sync: round(this.sync) } });
    } else if (this.syncActive && this.sync < 0.25) {
      this.syncActive = false;
      this.events.push({ type: 'simultaneous_motion_end', participantId: 'shared', source: 'derived', features: {} });
    }

    // ---- trajectory crossings (current segment of one person vs. the other's last 1.5 s)
    for (const h of hands) {
      const key = h.id + h.hand;
      const list = this.history.get(key) ?? [];
      if (!h.visible) list.length = 0;
      else list.push({ t, p: { ...h.pos } });
      while (list.length && t - list[0].t > HISTORY_SEC) list.shift();
      this.history.set(key, list);
    }
    if (t - this.lastCrossAt > 0.6) {
      outer: for (const h of hands) {
        if (!h.visible || h.speed < 0.1) continue;
        const mine = this.history.get(h.id + h.hand)!;
        if (mine.length < 2) continue;
        const p1 = mine[mine.length - 2].p, p2 = mine[mine.length - 1].p;
        const other: ParticipantId = h.id === 'A' ? 'B' : 'A';
        for (const k of [0, 1]) {
          const path = this.history.get(other + k) ?? [];
          for (let i = 1; i < path.length; i++) {
            const x = segIntersect(p1, p2, path[i - 1].p, path[i].p);
            if (x) {
              this.lastCrossAt = t;
              this.crossingCount++;
              out.crossings.push(x);
              this.events.push({
                type: 'path_cross', participantId: 'shared', source: 'derived',
                features: { crossedBy: h.id, x: round(x.x / (H * 16 / 9)), y: round(x.y / H), lagSec: round(t - path[i].t, 2) },
              });
              break outer;
            }
          }
        }
      }
    }

    // ---- audio events: shared by default; attributed to A or B ONLY by an explicit manual turn
    if (audio.source !== 'off') {
      if (audio.active && !this.soundActive) {
        this.soundActive = true;
        this.silenceLogged = false;
        this.events.push({
          type: 'sound_start', participantId: speaker, source: audio.source,
          features: { level: round(audio.level), attribution: speaker === 'shared' ? 'shared_mic' : 'manual_turn' },
        });
      } else if (!audio.active && this.soundActive) {
        this.soundActive = false;
        this.events.push({ type: 'sound_end', participantId: speaker, source: audio.source, features: { attribution: speaker === 'shared' ? 'shared_mic' : 'manual_turn' } });
      }
      if (!audio.active && audio.silenceSec > 3 && !this.silenceLogged) {
        this.silenceLogged = true;
        this.events.push({ type: 'silence', participantId: 'shared', source: audio.source, features: { sec: 3 } });
      }
    }

    // ---- voice + motion co-occurrence window
    const moving = hands.filter((h) => h.visible && h.speed > MOVING);
    const vmNow = audio.source !== 'off' && audio.active && moving.length > 0;
    this.vmOnFor = vmNow ? this.vmOnFor + dt : 0;
    this.vmOffFor = vmNow ? 0 : this.vmOffFor + dt;
    if (!this.vmActive && this.vmOnFor > 0.4) {
      this.vmActive = true;
      this.vmStartedAt = t;
      this.events.push({
        type: 'voice_motion_start', participantId: 'shared', source: 'derived',
        features: { movingA: moving.some((h) => h.id === 'A'), movingB: moving.some((h) => h.id === 'B'), level: round(audio.level) },
      });
    } else if (this.vmActive && this.vmOffFor > 0.5) {
      this.vmActive = false;
      this.events.push({ type: 'voice_motion_end', participantId: 'shared', source: 'derived', features: { durationSec: round(t - this.vmStartedAt, 2) } });
    }
    const maxMove = moving.reduce((m, h) => Math.max(m, h.speed), 0);
    const vmTarget = vmNow ? audio.level * clamp01(maxMove / 0.6) : 0;
    this.vmStrength += (vmTarget - this.vmStrength) * ease(dt, 5);
    out.voiceMotion = this.vmActive;
    out.voiceMotionStrength = this.vmStrength;

    // ---- bounded data: 5 Hz timeline, 1 Hz summaries
    const speedOf = (id: ParticipantId) => hands.filter((h) => h.id === id && h.visible).reduce((m, h) => Math.max(m, h.speed), 0);
    if (t - this.lastSample >= 0.2) {
      this.lastSample = t;
      this.events.sample({ level: audio.level, speedA: speedOf('A'), speedB: speedOf('B'), distance: out.handDistance });
    }
    if (t - this.lastSummary >= 1) {
      this.lastSummary = t;
      for (const id of PARTICIPANTS) {
        const hs = hands.filter((h) => h.id === id);
        if (!hs.some((h) => h.visible)) continue;
        const W = H * 16 / 9;
        this.events.summarize({
          type: 'motion_summary', participantId: id, source: bodySource,
          features: {
            wristLX: round(hs[0].pos.x / W), wristLY: round(hs[0].pos.y / H), leftVisible: hs[0].visible,
            wristRX: round(hs[1].pos.x / W), wristRY: round(hs[1].pos.y / H), rightVisible: hs[1].visible,
            speed: round(speedOf(id)),
          },
        });
      }
      if (audio.source !== 'off')
        this.events.summarize({
          type: 'audio_summary', participantId: 'shared', source: audio.source,
          features: {
            rmsDb: round(audio.db, 1), level: round(audio.level), low: round(audio.low), mid: round(audio.mid), high: round(audio.high),
            active: audio.active, pitchHz: round(audio.pitchHz, 1), onsetRate: round(audio.onsetRate, 2), speaker,
          },
        });
      if (out.handDistance !== null)
        this.events.summarize({
          type: 'between_summary', participantId: 'shared', source: 'derived',
          features: { handDistance: round(out.handDistance), weave: round(this.weave), sync: round(this.sync) },
        });
    }
    return out;
  }

  reset() {
    this.weaveActive = false;
    this.syncActive = false;
    this.vmActive = false;
    this.crossingCount = 0;
    this.history.clear();
  }
}
