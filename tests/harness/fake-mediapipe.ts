// Test double for @mediapipe/tasks-vision: two synthetic people whose hands periodically meet.
// Order of returned poses is shuffled every frame to exercise identity tracking.
// B leaves the frame for 1.5 s every 20 s to exercise the grace period.
type LM = { x: number; y: number; z: number; visibility: number };
export type NormalizedLandmark = LM;
export class FilesetResolver { static async forVisionTasks(_p: string) { return {}; } }
function person(cx: number, toward: number, t: number, ph: number): LM[] {
  const lm: LM[] = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, z: 0, visibility: 0.2 }));
  // screen-space -> camera space (camera image is un-mirrored)
  const set = (i: number, sx: number, sy: number) => { lm[i] = { x: 1 - sx, y: sy, z: 0, visibility: 0.95 }; };
  set(0, cx, 0.3); set(11, cx - 0.06, 0.45); set(12, cx + 0.06, 0.45); set(23, cx - 0.05, 0.75); set(24, cx + 0.05, 0.75);
  const reach = 0.5 + 0.5 * Math.sin(t * 0.9 + ph);
  set(15, cx - 0.12 + 0.03 * Math.sin(t * 2 + ph), 0.5 + 0.12 * Math.sin(t * 1.3 + ph)); // outer hand
  set(16, cx + toward * (0.08 + 0.17 * reach), 0.42 + 0.1 * Math.sin(t * 1.7 + ph));    // inner hand reaches to centre
  set(13, cx - 0.09, 0.55); set(14, cx + toward * 0.08, 0.5);
  return lm;
}
export class PoseLandmarker {
  static async createFromOptions(_f: unknown, _o: unknown) { await new Promise((r) => setTimeout(r, 300)); return new PoseLandmarker(); }
  detectForVideo(_v: HTMLVideoElement, ts: number) {
    const t = ts / 1000;
    const a = person(0.3, 1, t, 0);
    // B's outer hand is its right wrist (16) on screen right; swap roles so inner = left wrist (15).
    const bRaw = person(0.7, -1, t, 0.4);
    const b = bRaw.slice(); b[15] = bRaw[16]; b[16] = bRaw[15];
    const poses = [a];
    if (t % 20 < 12 || t % 20 > 13.5) poses.push(b);
    if (Math.random() < 0.5) poses.reverse();
    return { landmarks: poses };
  }
  close() {}
}
