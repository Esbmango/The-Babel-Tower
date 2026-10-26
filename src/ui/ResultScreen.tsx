import { useState } from 'react';
import type { CommunicationReport } from '../report/report';

export interface ResultData {
  artUrl: string;
  marksUrl: string;
  video: { url: string; mime: string; sizeMB: number; ext: string } | null;
  videoNote: string;
  report: CommunicationReport;
}

interface Props {
  data: ResultData;
  aiAvailable: boolean;
  aiConsent: boolean;
  aiBusy: boolean;
  aiError: string | null;
  onAiSummary: () => void;
  onDownload: (what: 'art' | 'marks' | 'video' | 'report' | 'report-counts') => void;
  onBack: () => void;
  onNew: () => void;
}

/**
 * Chrome writes MediaRecorder WebM files without a duration, so the player shows no seek bar.
 * Seeking far ahead once forces the browser to scan the file and learn the real duration.
 */
export function fixWebmDuration(v: HTMLVideoElement | null) {
  if (!v || v.dataset.fixed) return;
  v.dataset.fixed = '1';
  const onMeta = () => {
    if (v.duration !== Infinity) return;
    const back = () => { v.removeEventListener('timeupdate', back); v.currentTime = 0; };
    v.addEventListener('timeupdate', back);
    v.currentTime = 1e7;
  };
  v.addEventListener('loadedmetadata', onMeta, { once: true });
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function TimelineSvg({ r }: { r: CommunicationReport }) {
  const tl = r.timeline;
  const W = 600, H = 150, P = 6;
  const tMax = Math.max(1, r.durationSec, ...tl.map((x) => x.t));
  const x = (t: number) => P + (t / tMax) * (W - 2 * P);
  const line = (key: 'speedA' | 'speedB' | 'level' | 'distance', max: number) => {
    let d = '';
    let pen = false;
    for (const p of tl) {
      const v = p[key];
      if (v === null) { pen = false; continue; }
      const y = H - 22 - Math.min(1, v / max) * (H - 32);
      d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y.toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const tickColor: Record<string, string> = {
    shared_shape: '#9e88e4', weave_start: '#9e88e4', path_cross: '#101c5c', shared_topic: '#2440e6',
    gift_send: '#c4183c', gift_catch: '#1a8a5a', gift_return: '#c4183c', sanctuary_stage: '#9e88e4', sanctuary_complete: '#9e88e4',
    symbol: '#5b7cff', text_message: '#1c30c4', sound_start: '#a8c2ff', arms_raised: '#2440e6',
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tl-svg" role="img" aria-label="Session timeline">
      {Array.from({ length: 7 }, (_, i) => (
        <line key={i} x1={x((tMax * i) / 6)} x2={x((tMax * i) / 6)} y1={4} y2={H - 20} className="grid" />
      ))}
      <path d={line('level', 1)} stroke="#9e88e4" />
      <path d={line('speedA', 1.5)} stroke="#1c30c4" />
      <path d={line('speedB', 1.5)} stroke="#5b7cff" />
      <path d={line('distance', 1)} stroke="#101c5c" strokeDasharray="3 3" />
      {r.eventMarks.map((e, i) => (
        <rect key={i} x={x(e.t) - 0.75} y={H - 16} width={1.5} height={8} fill={tickColor[e.type] ?? '#888'} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <text key={i} x={x((tMax * i) / 6)} y={H - 1} className="tl-lab">{fmt(Math.round((tMax * i) / 6))}</text>
      ))}
    </svg>
  );
}

export function ResultScreen({ data, aiAvailable, aiConsent, aiBusy, aiError, onAiSummary, onDownload, onBack, onNew }: Props) {
  const [view, setView] = useState<'art' | 'marks'>('art');
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const r = data.report;
  const A = r.participants.A, B = r.participants.B;
  const counts = Object.entries(r.eventCounts)
    .filter(([k]) => !['body_input', 'audio_input', 'pause', 'resume', 'ai_analysis', 'ai_error'].includes(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const maxCount = Math.max(1, ...counts.map(([, n]) => n));

  return (
    <div className="result" role="dialog" aria-label="Session results">
      <header className="result-head">
        <div>
          <p className="eyebrow">Session complete · {fmt(r.durationSec)} · {r.prompt}</p>
          <h1 className="title">The Babel</h1>
        </div>
        <div className="result-actions">
          <button className="btn" onClick={onBack}>Back to canvas</button>
          <button className="btn primary" onClick={onNew} title="Clears this session's words, events, film and images from memory">New session · clear this one</button>
        </div>
      </header>
      <p className="privacy-strip">Nothing from this session is stored on a server or kept after you leave. It lives only in this browser tab until you download it; “New session” clears it now.</p>

      <div className="result-grid">
        <section className="portrait art-portrait">
          <h2><span className="out-n">①</span> Story Film</h2>
          {data.video ? (
            <>
              <video src={data.video.url} controls playsInline className="final-video" ref={fixWebmDuration} />
              <div className="dl-row">
                <button className="btn primary" onClick={() => onDownload('video')}>Download Story Film (.{data.video.ext}, {data.video.sizeMB.toFixed(1)} MB)</button>
              </div>
              <p className="note">The making of the artwork with both people’s words as two-sided subtitles (original + translation, each labelled by source) and key interaction events. No camera image, no microphone sound. {data.video.mime}</p>
            </>
          ) : (
            <p className="note">{data.videoNote}</p>
          )}

          <h2><span className="out-n">②</span> Artistic Portrait</h2>
          <img src={view === 'art' ? data.artUrl : data.marksUrl} alt="The final shared artwork" className="final-art" />
          <div className="dl-row">
            <button className="btn primary" onClick={() => onDownload('art')}>Download PNG · pure artwork</button>
            <button className="link-btn" onClick={() => setView(view === 'art' ? 'marks' : 'art')}>{view === 'art' ? 'preview with data marks' : 'back to pure artwork'}</button>
            {view === 'marks' && <button className="link-btn" onClick={() => onDownload('marks')}>download marked version</button>}
          </div>
          <p className="note">Artwork only — no interface, subtitles or labels.</p>
        </section>

        <section className="portrait comm-portrait">
          <h2><span className="out-n">③</span> Communication Portrait</h2>
          <p className="note">All numbers below are computed by the program from what happened. Simulated inputs are labelled. Translations can be wrong; “I follow / unclear” are what readers chose to report.</p>

          <h3>What was said</h3>
          {r.transcript.length ? (
            <ol className="transcript">
              {r.transcript.map((m) => {
                const to = m.replyTo ? r.transcript.find((x) => x.id === m.replyTo) : undefined;
                return (
                  <li key={m.id} className={`tx ${m.by}`}>
                    <span className="mono small muted">{fmt(Math.round(m.t))} · {m.by} · {m.lang} · {m.input}{m.viaGift ? ' · on a gift' : ''}{m.corrected ? ' · corrected' : ''}</span>
                    {to && <span className="tx-reply">↳ responding to {to.by}: “{[...to.text].slice(0, 40).join('')}”</span>}
                    <span className="tx-orig">{m.text}</span>
                    {m.translation ? (
                      <span className="tx-tr">→ {m.translation.text} <span className={`tag ${m.translation.source === 'ai' ? 'ai' : m.translation.source === 'demo_gloss' ? 'sim' : ''}`}>{({ ai: 'AI', phrasebook: 'PHRASEBOOK', demo_gloss: 'DEMO GLOSS', manual: 'EDITED' } as Record<string, string>)[m.translation.source] ?? m.translation.source}</span></span>
                    ) : <span className="tx-tr muted">same language — no translation</span>}
                    {m.readerCheck && <span className="mono small">reader: {m.readerCheck}</span>}
                  </li>
                );
              })}
            </ol>
          ) : <p className="note">No words were exchanged this session.</p>}
          <div className="stat-grid">
            <div className="stat"><span className="k">responses (A / B)</span><span className="v">{r.responses.by.A} / {r.responses.by.B}</span></div>
            <div className="stat"><span className="k">responses on gifts</span><span className="v">{r.responses.viaGift}</span></div>
            <div className="stat"><span className="k">mean time to respond</span><span className="v">{r.responses.meanLatencySec === null ? '—' : `${r.responses.meanLatencySec} s`}</span></div>
            <div className="stat"><span className="k">self-reported “I follow” / “unclear”</span><span className="v">{r.selfReports.clear} / {r.selfReports.unclear}</span></div>
            <div className="stat"><span className="k">translation sources</span><span className="v">{Object.entries(r.translationSources).map(([k, n]) => `${k} ${n}`).join(' · ') || '—'}</span></div>
          </div>

          <h3>Measured signals</h3>

          <div className="stat-grid">
            <div className="stat"><span className="k">duration</span><span className="v">{fmt(r.durationSec)}</span></div>
            <div className="stat"><span className="k">body</span><span className="v">{r.sources.body.map((s) => (s === 'pose' ? 'camera' : 'mouse SIM')).join(' + ') || '—'}</span></div>
            <div className="stat"><span className="k">sound</span><span className="v">{r.sources.audio.map((s) => (s === 'mic' ? 'shared mic' : 'audio SIM')).join(' + ') || 'off'}</span></div>
            <div className="stat"><span className="k">messages</span><span className="v">{A.messages + B.messages}</span></div>
            <div className="stat"><span className="k">A speed (mean / max)</span><span className="v">{A.meanSpeed} / {A.maxSpeed}</span></div>
            <div className="stat"><span className="k">B speed (mean / max)</span><span className="v">{B.meanSpeed} / {B.maxSpeed}</span></div>
            <div className="stat"><span className="k">hand distance (mean / min)</span><span className="v">{r.between.meanDistance ?? '—'} / {r.between.minDistance ?? '—'}</span></div>
            <div className="stat"><span className="k">within weave distance</span><span className="v">{r.between.closePct}%</span></div>
            <div className="stat"><span className="k">audio RMS (mean level / peak)</span><span className="v">{r.audio.meanLevel} / {r.audio.peakDb ?? '—'} dB</span></div>
            <div className="stat"><span className="k">bands low · mid · high</span><span className="v">{r.audio.bands.low} · {r.audio.bands.mid} · {r.audio.bands.high}</span></div>
            <div className="stat"><span className="k">pitch F0</span><span className="v">{r.audio.pitch.meanHz ? `${r.audio.pitch.minHz}–${r.audio.pitch.maxHz} Hz` : '—'}</span></div>
            <div className="stat"><span className="k">sound / pauses</span><span className="v">{r.audio.soundPct}% · {r.audio.pauses.count}</span></div>
            <div className="stat"><span className="k">A languages</span><span className="v">{A.languages.join(', ') || '—'}</span></div>
            <div className="stat"><span className="k">B languages</span><span className="v">{B.languages.join(', ') || '—'}</span></div>
            <div className="stat"><span className="k">shared shapes / motifs</span><span className="v">{r.art.sharedShapes} / {r.art.motifs}</span></div>
            <div className="stat"><span className="k">grounds fused</span><span className="v">{Math.round(r.art.fusion * 100)}%</span></div>
          </div>

          <h3>Exchange & co-creation</h3>
          <div className="stat-grid">
            <div className="stat"><span className="k">symbols sent (A / B)</span><span className="v">{r.exchange.sent.A} / {r.exchange.sent.B}</span></div>
            <div className="stat"><span className="k">caught (A / B)</span><span className="v">{r.exchange.caught.A} / {r.exchange.caught.B}</span></div>
            <div className="stat"><span className="k">caught by hand / button</span><span className="v">{r.exchange.caughtByHand} / {r.exchange.caughtByButton}</span></div>
            <div className="stat"><span className="k">transformed (A / B)</span><span className="v">{r.exchange.transformed.A} / {r.exchange.transformed.B}</span></div>
            <div className="stat"><span className="k">returned (A / B)</span><span className="v">{r.exchange.returned.A} / {r.exchange.returned.B}</span></div>
            <div className="stat"><span className="k">placed · timed out · cancelled</span><span className="v">{r.exchange.placed} · {r.exchange.timeouts} · {r.exchange.cancelled}</span></div>
            <div className="stat"><span className="k">longest journey</span><span className="v">{r.exchange.maxHops} hops</span></div>
            <div className="stat"><span className="k">sanctuary</span><span className="v">{r.sanctuary.started ? `${Math.round(r.sanctuary.growth * 100)}% · ${r.sanctuary.stageName}` : 'not built'}</span></div>
          </div>
          <table className="map contrib">
            <thead><tr><th>contribution</th><th>A</th><th>B</th></tr></thead>
            <tbody>
              {([
                ['messages (voice clips)', (p: 'A' | 'B') => `${r.contributions[p].messages} (${r.contributions[p].voiceClips})`],
                ['symbols chosen', (p: 'A' | 'B') => r.contributions[p].symbolsChosen],
                ['gifts sent · caught · transforms', (p: 'A' | 'B') => `${r.contributions[p].giftsSent} · ${r.contributions[p].giftsCaught} · ${r.contributions[p].transforms}`],
                ['sanctuary motion share', (p: 'A' | 'B') => (r.contributions[p].sanctuaryShare === null ? '—' : `${Math.round(r.contributions[p].sanctuaryShare! * 100)}%`)],
                ['wing feathers', (p: 'A' | 'B') => r.contributions[p].wingFeathers],
              ] as const).map(([k, f]) => <tr key={k}><td>{k}</td><td className="mono">{f('A')}</td><td className="mono">{f('B')}</td></tr>)}
            </tbody>
          </table>
          <p className="note">Counts of actions, not a score of understanding or effort.</p>

          <h3>Timeline</h3>
          <TimelineSvg r={r} />
          <div className="legend mono small">
            <span><i style={{ background: '#9e88e4' }} />sound level</span>
            <span><i style={{ background: '#1c30c4' }} />A speed</span>
            <span><i style={{ background: '#5b7cff' }} />B speed</span>
            <span><i className="dash" />hand distance</span>
            <span className="muted">ticks = events</span>
          </div>

          <h3>Interaction events</h3>
          <div className="bars">
            {counts.map(([k, n]) => (
              <div key={k} className="bar-row">
                <span className="mono small">{k}</span>
                <span className="bar"><i style={{ width: `${(n / maxCount) * 100}%` }} /></span>
                <span className="mono small">{n}</span>
              </div>
            ))}
          </div>

          {r.topics.length > 0 && (
            <>
              <h3>Shared topics</h3>
              <ul className="topics">
                {r.topics.map((t, i) => (
                  <li key={i}><span className={`tag ${t.source === 'ai' ? 'ai' : ''}`}>{t.source === 'ai' ? 'AI' : 'LEXICON'}</span> {t.label} <span className="muted mono small">at {t.at}s · similarity {t.similarity}</span></li>
                ))}
              </ul>
            </>
          )}

          <h3>Data → Art: two worked examples from this session</h3>
          <div className="evidence">
            <div className="ev-card">
              <h4>1 · Hands → shared shapes</h4>
              <p className="mono small">input: {r.evidence.body.input}</p>
              <ol className="ev-steps">{r.evidence.body.algorithm.map((a) => <li key={a}>{a}</li>)}</ol>
              <p className="ev-obs">
                {r.evidence.body.session.weaveStarts.length
                  ? <>This session: hands first came within weaving range at <b>{r.evidence.body.session.weaveStarts[0].t} s</b> (d = {r.evidence.body.session.weaveStarts[0].handDistance} frame heights); {r.evidence.body.session.sharedShapes.length ? <>shared discs at {r.evidence.body.session.sharedShapes.map((x) => `${x.t} s (x ${x.x}, y ${x.y}, ${x.rings} rings)`).join(' · ')}</> : 'no disc yet'}. Close {r.evidence.body.session.closePct}% of the time.</>
                  : <>This session: the two people’s hands never came within {`d < 0.30`}, so no shared disc was made.</>}
              </p>
            </div>
            <div className="ev-card">
              <h4>2 · Words → concepts → geometry</h4>
              <ol className="ev-steps">{r.evidence.language.algorithm.map((a) => <li key={a}>{a}</li>)}</ol>
              <table className="map ev-table">
                <thead><tr><th>who</th><th>words</th><th>concepts → element</th></tr></thead>
                <tbody>
                  {r.evidence.language.messages.map((m) => (
                    <tr key={m.id}>
                      <td>{m.by}</td>
                      <td>{[...m.text].slice(0, 36).join('')}{[...m.text].length > 36 ? '…' : ''}</td>
                      <td className="mono">{m.concepts.length ? m.concepts.map((c) => `${c.label}${c.category ? ` → ${c.category} → ${c.element}` : ''}`).join(' · ') : 'no lexicon concept (text only)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="ev-obs">
                {r.evidence.language.topics.length
                  ? <>Shared topics: {r.evidence.language.topics.map((t) => `“${t.label}” at ${t.at} s from ${t.messageIds.join(' + ')} (${t.source === 'ai' ? 'AI' : 'lexicon'}, overlap ${t.similarity})`).join(' · ')}.</>
                  : <>No concept appeared in both people’s words, so no shared topic motif was made.</>}
                {r.evidence.language.sanctuaryCategories.length ? <> Sanctuary geometry fed by: {r.evidence.language.sanctuaryCategories.join(', ')}.</> : null}
              </p>
            </div>
          </div>

          <h3>How the data shaped the artwork</h3>
          <table className="map">
            <thead><tr><th>data</th><th>visual rule</th><th>this session</th></tr></thead>
            <tbody>{r.mappings.map((m) => <tr key={m.data}><td>{m.data}</td><td>{m.rule}</td><td className="mono">{m.observed}</td></tr>)}</tbody>
          </table>

          <h3>
            Summary
            <span className="seg small inline">
              <button className={`seg-btn ${lang === 'zh' ? 'on' : ''}`} onClick={() => setLang('zh')}>中文</button>
              <button className={`seg-btn ${lang === 'en' ? 'on' : ''}`} onClick={() => setLang('en')}>English</button>
            </span>
          </h3>
          <div className="summary data">
            <span className="tag">DATA TEMPLATE · computed</span>
            <p>{r.summary[lang]}</p>
          </div>
          {r.aiSummary ? (
            <div className="summary ai">
              <span className="tag ai">AI-GENERATED · {r.aiSummary.provider} · {r.aiSummary.model}{r.aiSummary.includedText ? ' · used your text' : ' · numbers only'}</span>
              <p>{r.aiSummary[lang]}</p>
              <p className="note">An interpretation written by a language model from the numbers above. It may be imperfect and does not judge emotions or understanding.</p>
            </div>
          ) : (
            <div className="summary ai pending">
              {aiAvailable && aiConsent ? (
                <button className="btn" disabled={aiBusy} onClick={onAiSummary}>{aiBusy ? 'Writing AI summary…' : 'Generate AI narrative (zh + en)'}</button>
              ) : (
                <p className="note">{aiAvailable ? 'AI narrative needs both participants’ consent to cloud AI (start screen).' : 'AI narrative unavailable (no server API key) — the data summary above is complete on its own.'}</p>
              )}
              {aiError && <p className="error">{aiError}</p>}
            </div>
          )}

          <div className="dl-row">
            <button className="btn primary" onClick={() => onDownload('report')}>Export report (JSON, with conversation text)</button>
            <button className="btn" onClick={() => onDownload('report-counts')}>Export counts only (no words)</button>
          </div>
          <ul className="limits">{r.limits.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}
