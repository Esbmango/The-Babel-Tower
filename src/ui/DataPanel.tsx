import { useEffect, useRef } from 'react';
import type { EngineStats, HandStats, InteractionEvent, SharedTopic, TimelineSample } from '../types';
import { PALETTE } from '../engine/palette';
import { Timeline } from './Timeline';

interface Props {
  stats: EngineStats | null;
  bodyLabel: string;
  audioLabel: string;
  events: InteractionEvent[];
  timeline: { samples: TimelineSample[]; events: InteractionEvent[] };
  language: { messagesA: number; messagesB: number; similarity: number; similaritySource: string; topics: SharedTopic[]; ai: string; pending: number };
  onExportData: () => void;
}

const f2 = (v: number) => v.toFixed(2);

function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v mono">{v}</span>
      {note && <span className="note">{note}</span>}
    </div>
  );
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="meter">
      <div className="meter-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color }} />
    </div>
  );
}

function Hand({ label, h }: { label: string; h: HandStats }) {
  return <Row k={label} v={h.visible ? `(${f2(h.x)}, ${f2(h.y)})  ${f2(h.speed)}/s` : 'not visible'} />;
}

function Spectrum({ data, on }: { data: Float32Array; on: boolean }) {
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
    const bw = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = on ? data[i] : 0;
      g.fillStyle = i < 8 ? '#101c5c' : i < 20 ? '#2440e6' : '#9e88e4';
      g.fillRect(i * bw + 1, h - v * h, bw - 2, v * h);
    }
  });
  return <canvas ref={ref} className="spectrum" aria-label="Frequency spectrum" />;
}

const SOURCE_TAG: Record<string, string> = {
  pose: 'POSE', mouse_sim: 'SIM', mic: 'MIC', audio_sim: 'SIM', derived: 'DERIVED', system: 'SYS',
  text: 'TEXT', speech: 'SPEECH', user: 'USER', ai: 'AI',
};

export function DataPanel({ stats, bodyLabel, audioLabel, events, timeline, language, onExportData }: Props) {
  if (!stats) return <aside className="panel" aria-label="Data view" />;
  const a = stats.audio;
  const audioOn = a.source !== 'off';
  return (
    <aside className="panel" aria-label="Data view">
      <section>
        <h3>Sources</h3>
        <Row k="body" v={bodyLabel} />
        <Row k="sound" v={audioLabel} />
        <Row k="render" v={`${stats.renderFps} fps · t=${stats.elapsed.toFixed(1)}s`} />
      </section>

      <section>
        <h3>Shared audio {a.source === 'audio_sim' && <span className="tag sim">SIMULATED</span>}{a.source === 'mic' && <span className="tag">REAL · MIXED</span>}</h3>
        {audioOn ? (
          <>
            <Row k="RMS" v={`${a.db.toFixed(1)} dBFS · level ${f2(a.level)}`} note="→ line width & ink brightness" />
            <Meter value={a.level} color="#2440e6" />
            <div className="bands">
              {(['low', 'mid', 'high'] as const).map((b) => (
                <div key={b} className="band">
                  <span className="k">{b}</span>
                  <Meter value={a[b]} color={b === 'low' ? '#101c5c' : b === 'mid' ? '#2440e6' : '#9e88e4'} />
                  <span className="mono small">{f2(a[b])}</span>
                </div>
              ))}
            </div>
            <p className="note">low → ring scale · high → grain texture</p>
            <Spectrum data={a.spectrum} on={audioOn} />
            <Row k="activity" v={a.active ? 'sound' : `silence ${a.silenceSec.toFixed(1)}s`} note={a.active ? '→ waveform rings' : '→ voice layer dissolves'} />
            <Row k="pitch F0" v={a.pitchHz > 0 ? `${a.pitchHz.toFixed(0)} Hz` : 'unvoiced'} note="→ wave tint & finer ripple (not emotion)" />
            <Row k="rhythm" v={`${a.onsetRate.toFixed(1)} onsets/s`} note="→ ring cadence" />
            <Row k="voice attribution" v={stats.speakerMode === 'shared' ? 'shared mic' : `${stats.speakerMode} · MANUAL TURN`} />
          </>
        ) : (
          <p className="note">Sound is off. Drawing works without it.</p>
        )}
      </section>

      <section>
        <h3>Body {stats.bodySource === 'mouse_sim' && <span className="tag sim">SIMULATED</span>}</h3>
        {(['A', 'B'] as const).map((id) => {
          const p = stats.participants[id];
          return (
            <div key={id} className="who">
              <div className="who-head">
                <span className="mark" style={{ color: PALETTE[id].css }}>{PALETTE[id].marker}</span> {id} · {PALETTE[id].style}
                <span className={`pill ${p.present ? 'on' : ''}`}>{p.present ? 'tracked' : 'not in frame'}</span>
              </div>
              <Hand label="left wrist" h={p.hands[0]} />
              <Hand label="right wrist" h={p.hands[1]} />
            </div>
          );
        })}
        <p className="note">position → where the line grows · speed → wave amplitude</p>
      </section>

      <section>
        <h3>Between</h3>
        <Row k="hand distance" v={stats.handDistance === null ? '—' : f2(stats.handDistance)} note="< 0.30 → weave bridge" />
        <Row k="approach" v={`${stats.approachRate > 0 ? '+' : ''}${f2(stats.approachRate)}/s`} />
        <Row k="weave" v={f2(stats.weave)} />
        <Meter value={stats.weave} color="linear-gradient(90deg,#101c5c,#9e88e4,#2440e6)" />
        <Row k="moving together" v={f2(stats.sync)} note="→ lavender dust" />
        <Meter value={stats.sync} color="#9e88e4" />
        <Row k="voice + motion" v={stats.voiceMotion ? 'yes' : 'no'} note="→ halftone bursts" />
        <Row k="shared shapes / crossings" v={`${stats.sharedNodes} / ${stats.crossings}`} />
        <Row k="symbols / grounds fused" v={`${stats.symbols} / ${Math.round(stats.fusion * 100)}%`} note="shared shapes, motifs, symbols → white & blue merge" />
      </section>

      <section>
        <h3>Language {language.ai.startsWith('AI') ? <span className="tag ai">{language.ai}</span> : <span className="tag sim">{language.ai}</span>}</h3>
        <Row k="messages A / B" v={`${language.messagesA} / ${language.messagesB}`} note="→ typography on each side" />
        <Row k="topic similarity" v={`${f2(language.similarity)} · ${language.similaritySource === 'ai' ? 'AI' : 'lexicon'}`} note="shared subject only — not agreement" />
        {language.pending > 0 && <p className="note">AI analysing…</p>}
        {language.topics.slice(-4).map((t) => (
          <Row key={t.id} k={`topic @${t.timestamp.toFixed(0)}s`} v={`${t.label} · ${t.source === 'ai' ? 'AI' : 'lexicon'}`} />
        ))}
        {language.topics.length > 0 && <p className="note">shared topic → shared motif (flower + symbol + bilingual label)</p>}
      </section>

      <section>
        <h3>What is shaping the image now</h3>
        {stats.effects.length ? (
          <ul className="effects">
            {stats.effects.map((e) => (
              <li key={e.input + e.effect}><span className="mono">{e.input}</span><span className="arrow">→</span><span>{e.effect}</span></li>
            ))}
          </ul>
        ) : (
          <p className="note">Waiting for movement or sound.</p>
        )}
      </section>

      <section>
        <h3>Session timeline</h3>
        <Timeline samples={timeline.samples} events={timeline.events} now={stats.elapsed} tick={stats.elapsed} />
      </section>

      <section>
        <h3>Detected events</h3>
        <ul className="events">
          {events.map((e, i) => (
            <li key={`${e.timestamp}-${i}`} className="mono small">
              <span className="muted">{e.timestamp.toFixed(1)}s</span> <span className={`src ${e.source}`}>{SOURCE_TAG[e.source]}</span> {e.participantId} · {e.type}
            </li>
          ))}
        </ul>
        <button className="btn tiny" onClick={onExportData}>Export session data (JSON)</button>
      </section>

      <p className="note footnote">
        Positions are 2D image coordinates (0–1); speed and distance are in frame-heights. They are not physical distances.
        The shared microphone cannot tell speakers apart. Nothing here measures emotion or how well two people understand each other.
      </p>
    </aside>
  );
}
