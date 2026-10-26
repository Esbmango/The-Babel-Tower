import type { EngineTargets, HandTarget, ParticipantId, Vec2 } from '../types';

export type PartnerMode = 'mirror' | 'auto';

/**
 * Mouse / touch simulation of two participants, for testing without a camera
 * and as the accessible fallback control.
 *  - Mouse: you are A. B mirrors you across the centre line ("mirror") or drifts on its own ("auto").
 *    Move toward the centre and the two threads meet and weave.
 *  - Touch: first finger (leftmost) = A, second finger = B.
 *  - Idle (pointer left the window): both drift on their own (attract mode).
 */
export class PointerSim {
  partnerMode: PartnerMode = 'mirror';
  private pointers = new Map<number, Vec2 & { lastMove: number }>();
  private offHand: Record<ParticipantId, Vec2> = { A: { x: 0.25, y: 0.55 }, B: { x: 0.75, y: 0.55 } };
  private lastT = performance.now();
  private el: HTMLElement | null = null;

  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const r = this.el!.getBoundingClientRect();
    this.pointers.set(e.pointerId, {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      lastMove: performance.now(),
    });
  };
  private onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') this.pointers.delete(e.pointerId);
  };
  private onLeave = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  attach(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onLeave);
    el.addEventListener('pointerleave', this.onLeave);
  }

  detach() {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerdown', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onLeave);
    el.removeEventListener('pointerleave', this.onLeave);
    this.pointers.clear();
    this.el = null;
  }

  private static auto(id: ParticipantId, t: number): Vec2 {
    return id === 'A'
      ? { x: 0.33 + 0.21 * Math.sin(t * 0.5), y: 0.5 + 0.26 * Math.sin(t * 0.83 + 1) }
      : { x: 0.67 + 0.21 * Math.sin(t * 0.43 + 2), y: 0.5 + 0.26 * Math.sin(t * 0.71) };
  }

  compute(now: number): EngineTargets {
    const t = now / 1000;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const pts = [...this.pointers.values()].sort((a, b) => a.x - b.x);

    const a: Vec2 = pts[0] ?? PointerSim.auto('A', t);
    const b: Vec2 =
      pts[1] ?? (pts[0] && this.partnerMode === 'mirror' ? { x: 1 - a.x, y: a.y } : PointerSim.auto('B', t));

    // The second wrist lazily follows the first, offset to the outside, giving each person two strands.
    const follow = (id: ParticipantId, main: Vec2, side: number): HandTarget => {
      const goal = { x: main.x + side * 0.07, y: main.y + 0.06 };
      const k = 1 - Math.exp(-dt * 2.2);
      const o = this.offHand[id];
      o.x += (goal.x - o.x) * k;
      o.y += (goal.y - o.y) * k;
      return { x: o.x, y: o.y, visible: true };
    };

    return {
      A: { present: true, hands: [follow('A', a, -1), { ...a, visible: true }] },
      B: { present: true, hands: [{ ...b, visible: true }, follow('B', b, 1)] },
    };
  }
}
