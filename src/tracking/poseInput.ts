import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { OneEuro } from './oneEuro';
import { emptyTargets, PARTICIPANTS, type EngineTargets, type ParticipantId, type Vec2 } from '../types';

// MediaPipe Pose landmark indices
const L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16, L_HIP = 23, R_HIP = 24, NOSE = 0;

const VIS_MIN = 0.35;
/** Keep a participant "present" this long after they were last detected. */
const GRACE_MS = 800;
/** After a hand gap this long, restart its filter so the thread doesn't smear across. */
const FILTER_RESET_MS = 400;

/** Where each identity is expected on a cold start (mirrored view: A on the left). */
const ANCHOR: Record<ParticipantId, Vec2> = { A: { x: 0.3, y: 0.5 }, B: { x: 0.7, y: 0.5 } };

interface Candidate {
  center: Vec2;
  wrists: [{ x: number; y: number; vis: number }, { x: number; y: number; vis: number }];
  landmarks: NormalizedLandmark[];
}

interface Slot {
  center: Vec2 | null;
  lastSeen: number;
  handLastSeen: [number, number];
  filters: [OneEuro, OneEuro, OneEuro, OneEuro];
  landmarks: NormalizedLandmark[] | null;
}

const vis = (l: NormalizedLandmark | undefined) => (l ? (l.visibility ?? 1) : 0);
const mirror = (l: NormalizedLandmark) => ({ x: 1 - l.x, y: l.y });
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function toCandidate(lm: NormalizedLandmark[]): Candidate {
  const torso = [L_SHOULDER, R_SHOULDER, L_HIP, R_HIP].filter((i) => vis(lm[i]) > 0.3);
  const pts = torso.length ? torso.map((i) => mirror(lm[i])) : [mirror(lm[NOSE])];
  const center = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
  const w = (i: number) => ({ ...mirror(lm[i]), vis: vis(lm[i]) });
  return { center, wrists: [w(L_WRIST), w(R_WRIST)], landmarks: lm };
}

/**
 * Turns raw multi-person landmarks into stable A/B identities:
 *  - identity by nearest previous body center (2×2 assignment), A = left on cold start
 *  - One Euro smoothing per wrist coordinate
 *  - grace period when someone briefly leaves the frame
 */
export class PoseInput {
  private slots: Record<ParticipantId, Slot>;
  targets: EngineTargets = emptyTargets();

  constructor() {
    const mk = (): Slot => ({
      center: null,
      lastSeen: -Infinity,
      handLastSeen: [-Infinity, -Infinity],
      filters: [new OneEuro(), new OneEuro(), new OneEuro(), new OneEuro()],
      landmarks: null,
    });
    this.slots = { A: mk(), B: mk() };
  }

  private ref(id: ParticipantId, t: number): Vec2 {
    const s = this.slots[id];
    return s.center && t - s.lastSeen < 3000 ? s.center : ANCHOR[id];
  }

  update(poses: NormalizedLandmark[][], t: number): EngineTargets {
    const cands = poses.slice(0, 2).map(toCandidate);
    const assigned: Partial<Record<ParticipantId, Candidate>> = {};

    if (cands.length === 2) {
      const [c0, c1] = cands;
      const straight = dist(c0.center, this.ref('A', t)) + dist(c1.center, this.ref('B', t));
      const swapped = dist(c1.center, this.ref('A', t)) + dist(c0.center, this.ref('B', t));
      if (straight <= swapped) { assigned.A = c0; assigned.B = c1; } else { assigned.A = c1; assigned.B = c0; }
    } else if (cands.length === 1) {
      const c = cands[0];
      const dA = dist(c.center, this.ref('A', t));
      const dB = dist(c.center, this.ref('B', t));
      assigned[dA <= dB ? 'A' : 'B'] = c;
    }

    for (const id of PARTICIPANTS) {
      const slot = this.slots[id];
      const cand = assigned[id];
      const target = this.targets[id];
      if (cand) {
        slot.center = cand.center;
        slot.lastSeen = t;
        slot.landmarks = cand.landmarks;
        cand.wrists.forEach((w, h) => {
          const inFrame = w.x > -0.05 && w.x < 1.05 && w.y > -0.05 && w.y < 1.05;
          if (w.vis > VIS_MIN && inFrame) {
            if (t - slot.handLastSeen[h] > FILTER_RESET_MS) {
              slot.filters[h * 2].reset();
              slot.filters[h * 2 + 1].reset();
            }
            slot.handLastSeen[h] = t;
            target.hands[h] = {
              x: slot.filters[h * 2].filter(w.x, t),
              y: slot.filters[h * 2 + 1].filter(w.y, t),
              visible: true,
            };
          } else {
            target.hands[h] = { ...target.hands[h], visible: false };
          }
        });
      } else {
        // Not detected this frame: hold last position briefly, but stop drawing.
        target.hands = [
          { ...target.hands[0], visible: false },
          { ...target.hands[1], visible: false },
        ];
        if (t - slot.lastSeen > GRACE_MS) slot.landmarks = null;
      }
      target.present = t - slot.lastSeen <= GRACE_MS;
    }
    return this.targets;
  }

  /** Latest landmarks per identity for the preview overlay. */
  landmarksFor(id: ParticipantId) {
    return this.slots[id].landmarks;
  }
}
