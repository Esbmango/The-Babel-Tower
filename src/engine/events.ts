import type { InteractionEvent, TimelineSample } from '../types';

/** Discrete events kept for the session (oldest dropped beyond this). */
const MAX_EVENTS = 2000;
/** Per-second feature summaries (≈ 15 min). */
const MAX_SUMMARIES = 900;
/** Timeline samples for the data view: 5 Hz × 60 s. */
const TIMELINE_LEN = 300;

/**
 * Bounded in-memory session log. Nothing is uploaded; export is a user-initiated JSON download.
 * - events: discrete interaction / presence / audio / system events
 * - summaries: 1 Hz feature snapshots (not per frame)
 * - timeline: 5 Hz rolling 60 s window for the live chart
 */
export class EventLog {
  private t0 = performance.now();
  private events: InteractionEvent[] = [];
  private summaries: InteractionEvent[] = [];
  private timeline: TimelineSample[] = [];
  private counts = new Map<string, number>();

  /** Optional observer (used by the Story Film ticker). Never mutates the event. */
  onPush: ((e: InteractionEvent) => void) | null = null;

  now(): number {
    return (performance.now() - this.t0) / 1000;
  }

  push(e: Omit<InteractionEvent, 'timestamp'> & { timestamp?: number }): InteractionEvent {
    const ev: InteractionEvent = { ...e, timestamp: round(e.timestamp ?? this.now(), 2) };
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.counts.set(ev.type, (this.counts.get(ev.type) ?? 0) + 1);
    this.onPush?.(ev);
    return ev;
  }

  summarize(e: Omit<InteractionEvent, 'timestamp'>) {
    this.summaries.push({ ...e, timestamp: round(this.now(), 2) });
    if (this.summaries.length > MAX_SUMMARIES) this.summaries.shift();
  }

  sample(s: Omit<TimelineSample, 't'>) {
    this.timeline.push({ ...s, t: this.now() });
    if (this.timeline.length > TIMELINE_LEN) this.timeline.shift();
  }

  recent(n: number): InteractionEvent[] {
    return this.events.slice(-n).reverse();
  }

  /** Events within the last `sec` seconds (for timeline ticks). */
  since(sec: number): InteractionEvent[] {
    const from = this.now() - sec;
    const out: InteractionEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && this.events[i].timestamp >= from; i--) out.push(this.events[i]);
    return out;
  }

  timelineSamples(): TimelineSample[] {
    return this.timeline;
  }

  countsByType(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  exportData() {
    return {
      events: this.events.slice(),
      summaries: this.summaries.slice(),
      eventCounts: this.countsByType(),
    };
  }

  reset() {
    this.t0 = performance.now();
    this.events = [];
    this.summaries = [];
    this.timeline = [];
    this.counts.clear();
  }
}

export function round(v: number, d = 3) {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}
