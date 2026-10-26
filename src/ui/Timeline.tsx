import { useEffect, useRef } from 'react';
import type { InteractionEvent, TimelineSample } from '../types';

interface Props {
  samples: TimelineSample[];
  events: InteractionEvent[];
  now: number;
  tick: number;
}

const WINDOW = 60;
const SERIES: { key: 'level' | 'speedA' | 'speedB' | 'distance'; color: string; dash?: number[]; max: number }[] = [
  { key: 'level', color: '#9e88e4', max: 1 },
  { key: 'speedA', color: '#101c5c', max: 1.5 },
  { key: 'speedB', color: '#2440e6', max: 1.5 },
  { key: 'distance', color: '#3a6eff', dash: [3, 3], max: 1 },
];
const TICK_COLOR: Record<string, string> = {
  weave_start: '#9e88e4', shared_shape: '#9e88e4', path_cross: '#101c5c', approach: '#3a6eff',
  sound_start: '#2440e6', voice_motion_start: '#2440e6', simultaneous_motion_start: '#9e88e4',
};

/** Rolling 60 s session timeline: sound level, both speeds, hand distance, and event ticks. */
export function Timeline({ samples, events, now, tick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const x = (t: number) => w - ((now - t) / WINDOW) * w;
    const plotH = h - 14;

    g.strokeStyle = 'rgba(16,28,92,0.12)';
    g.lineWidth = 1;
    for (let s = 0; s <= WINDOW; s += 10) {
      const xx = x(now - s);
      g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, plotH); g.stroke();
    }
    for (const e of events) {
      const col = TICK_COLOR[e.type];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x(e.timestamp) - 1, plotH + 3, 2, 8);
    }
    for (const s of SERIES) {
      g.strokeStyle = s.color;
      g.setLineDash(s.dash ?? []);
      g.lineWidth = 1.2;
      g.beginPath();
      let started = false;
      for (const p of samples) {
        if (now - p.t > WINDOW) continue;
        const v = p[s.key];
        if (v === null) { started = false; continue; }
        const yy = plotH - Math.min(1, v / s.max) * (plotH - 2) - 1;
        if (!started) { g.moveTo(x(p.t), yy); started = true; } else g.lineTo(x(p.t), yy);
      }
      g.stroke();
    }
    g.setLineDash([]);
  }, [samples, events, now, tick]);

  return (
    <div className="timeline">
      <canvas ref={ref} aria-label="Session timeline, last 60 seconds" />
      <div className="legend mono small">
        <span><i style={{ background: '#9e88e4' }} />sound</span>
        <span><i style={{ background: '#101c5c' }} />A speed</span>
        <span><i style={{ background: '#2440e6' }} />B speed</span>
        <span><i className="dash" />distance</span>
        <span className="muted">−60 s → now · ticks = events</span>
      </div>
    </div>
  );
}
