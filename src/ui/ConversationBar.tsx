import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LANGS, detectLang, langName } from '../lang/languages';
import { Dictation, speakingRate } from '../lang/speech';
import { PHRASES } from '../lang/phrasebook';
import { SYMBOL_KINDS } from '../engine/symbols';
import type { GiftSnapshot, LangCode, ParticipantId, SharedTopic, SpeakerMode, SymbolKind, TextMessage, TrayItem } from '../types';

export type GiftAction = 'catch' | 'cancel' | 'rotate_left' | 'rotate_right' | 'grow' | 'shrink' | 'texture' | 'place' | 'send_on';
export type VoiceMode = 'cloud' | 'browser' | 'none';

export interface VoiceDraft {
  stamp: number;
  text: string;
  lang: LangCode | null;
  detectedBy: 'speech_model' | 'none';
  seconds: number;
}

export interface VoiceUi {
  mode: VoiceMode;
  /** who is currently recording / waiting for transcription */
  active: ParticipantId | null;
  phase: 'idle' | 'starting' | 'recording' | 'transcribing';
  elapsed: number;
  draft: Record<ParticipantId, VoiceDraft | null>;
}

const other = (p: ParticipantId): ParticipantId => (p === 'A' ? 'B' : 'A');

interface ComposerProps {
  active: boolean;
  who: ParticipantId;
  lang: LangCode;
  setLang: (l: LangCode) => void;
  speechEnabled: boolean;
  voice: VoiceUi;
  onVoice: (action: 'start' | 'stop') => void;
  onSubmit: (text: string, lang: LangCode, langSource: 'manual' | 'auto', mode: TextMessage['inputMode'], rate?: number, detectedBy?: TextMessage['langDetectedBy']) => void;
  onSymbol: (k: SymbolKind) => void;
  replyTarget: TextMessage | null;
  onClearReply: () => void;
  tray: TrayItem[];
  gifts: GiftSnapshot[];
  onSend: (item: TrayItem) => void;
  onGift: (id: string, a: GiftAction) => void;
  onGiftReply: (id: string, text: string) => void;
}

function GiftRow({ who, tray, gifts, onSend, onGift, onGiftReply }: Pick<ComposerProps, 'who' | 'tray' | 'gifts' | 'onSend' | 'onGift' | 'onGiftReply'>) {
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const selected = tray.find((t) => t.id === sel) ?? tray[tray.length - 1];
  const incoming = gifts.filter((g) => g.to === who && (g.state === 'waiting' || g.state === 'flying'));
  const outgoing = gifts.filter((g) => g.from === who && (g.state === 'waiting' || g.state === 'flying'));
  const held = gifts.find((g) => g.state === 'held' && g.holder === who);
  const canSend = outgoing.length < 2;

  return (
    <div className="gift-row">
      {incoming.map((g) => (
        <div key={g.id} className="gift-line incoming">
          <span className="mono small">{g.from} → {who}: <b>{g.captions[0]?.text ? `“${[...g.captions[0].text].slice(0, 22).join('')}”` : g.label || g.kind}</b> {g.state === 'waiting' ? `· reach for it or catch · ${g.waitLeft.toFixed(0)}s` : '· arriving…'}</span>
          <button className="btn primary pulse" onClick={() => onGift(g.id, 'catch')}>Catch</button>
        </div>
      ))}
      {held && (
        <div className="gift-line held">
          <span className="mono small">holding <b>{held.label || held.kind}</b> · by {held.marks.join('+')}{held.hops ? ` · ${held.hops} hop${held.hops > 1 ? 's' : ''}` : ''}</span>
          <form className="gift-reply" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) { onGiftReply(held.id, reply); setReply(''); } }}>
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="add your words to it…" aria-label="Reply on this gift" />
            <button className="btn tiny" type="submit" disabled={!reply.trim()}>add</button>
          </form>
          <span className="gift-tools">
            <button className="btn tiny" title="rotate left" onClick={() => onGift(held.id, 'rotate_left')}>⟲</button>
            <button className="btn tiny" title="rotate right" onClick={() => onGift(held.id, 'rotate_right')}>⟳</button>
            <button className="btn tiny" title="smaller" onClick={() => onGift(held.id, 'shrink')}>−</button>
            <button className="btn tiny" title="larger" onClick={() => onGift(held.id, 'grow')}>+</button>
            <button className="btn tiny" onClick={() => onGift(held.id, 'texture')}>+ my texture</button>
            <button className="btn tiny" onClick={() => onGift(held.id, 'place')}>place</button>
            <button className="btn tiny primary" onClick={() => onGift(held.id, 'send_on')}>send back → {other(who)}</button>
          </span>
        </div>
      )}
      <div className="gift-line">
        <span className="mono small muted">my elements:</span>
        <span className="tray">
          {tray.length ? tray.map((t) => (
            <button key={t.id} className={`tray-chip ${selected?.id === t.id ? 'on' : ''}`} onClick={() => setSel(t.id)} title={t.text ? `“${t.text}”` : `${t.kind} · from ${t.source}`}>
              {t.kind}{t.label && t.label !== t.kind ? ` · ${t.label}` : ''}{t.text ? ' ❝' : ''}
            </button>
          )) : <span className="note">say or write something to make one</span>}
        </span>
        <button className="btn tiny primary" disabled={!selected || !canSend} onClick={() => selected && onSend(selected)}>Send → {other(who)}</button>
      </div>
      {outgoing.map((g) => (
        <div key={g.id} className="gift-line outgoing">
          <span className="mono small muted">{g.label || g.kind} → {g.to} · {g.state === 'flying' ? 'flying' : `waiting ${g.waitLeft.toFixed(0)}s`}</span>
          <button className="btn tiny ghost" onClick={() => onGift(g.id, 'cancel')}>cancel</button>
        </div>
      ))}
    </div>
  );
}

function Composer(props: ComposerProps) {
  const { who, lang, setLang, speechEnabled, voice, onVoice, onSubmit, onSymbol, replyTarget, onClearReply } = props;
  const [text, setText] = useState('');
  const [override, setOverride] = useState<LangCode | null>(null);
  const [dictating, setDictating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [voiceMeta, setVoiceMeta] = useState<{ lang: LangCode | null; detectedBy: 'speech_model' | 'none'; seconds: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const dict = useRef<Dictation | null>(null);
  const fromSpeech = useRef<{ rate?: number } | null>(null);
  const lastDraft = useRef(0);
  const holding = useRef(false);

  useEffect(() => () => { dict.current?.stop(); }, []);
  useEffect(() => {
    if (!props.active) {
      dict.current?.stop();
      setDictating(false);
      setCountdown(null);
    }
  }, [props.active]);

  const detected = text.trim() ? detectLang(text) : null;
  const modelLang = voiceMeta?.lang ?? null;
  const msgLang: LangCode = override ?? modelLang ?? (detected && detected.confidence >= 0.5 ? detected.lang : lang);
  const langSource: 'manual' | 'auto' = override ? 'manual' : modelLang || (detected && detected.confidence >= 0.5) ? 'auto' : 'manual';
  const detectedBy: TextMessage['langDetectedBy'] = voiceMeta?.detectedBy === 'speech_model' && !override ? 'speech_model' : 'text_heuristic';

  const send = () => {
    if (!props.active || !text.trim()) return;
    const mode: TextMessage['inputMode'] = voiceMeta ? 'voice' : fromSpeech.current ? 'speech' : 'typed';
    const rate = voiceMeta ? speakingRate(text, msgLang, voiceMeta.seconds) : fromSpeech.current?.rate;
    onSubmit(text, msgLang, langSource, mode, rate, langSource === 'auto' ? detectedBy : undefined);
    setText('');
    setOverride(null);
    setVoiceMeta(null);
    setCountdown(null);
    fromSpeech.current = null;
  };

  // A fresh transcript fills the box and is sent after 4 s unless the person edits it or presses "hold".
  const draft = voice.draft[who];
  useEffect(() => {
    if (!draft || draft.stamp === lastDraft.current) return;
    lastDraft.current = draft.stamp;
    setText(draft.text);
    setOverride(null);
    setVoiceMeta({ lang: draft.lang, detectedBy: draft.detectedBy, seconds: draft.seconds });
    setCountdown(draft.text.trim() ? 4 : null);
  }, [draft]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { send(); return; }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 0.25)), 250);
    return () => clearTimeout(t);
  }, [countdown]);

  const toggleDictation = () => {
    if (dictating) { dict.current?.stop(); setDictating(false); return; }
    const d = new Dictation();
    dict.current = d;
    setDictating(true);
    setNote(null);
    d.start(override ?? lang, (t, final, secs) => {
      setText(t);
      fromSpeech.current = { rate: final ? speakingRate(t, override ?? lang, secs) : undefined };
    }, (err) => {
      setDictating(false);
      if (err && err !== 'no-speech' && err !== 'aborted') setNote(`dictation: ${err}`);
    });
  };

  // Push-to-talk: press and hold while speaking, release to transcribe.
  const myVoice = voice.active === who;
  const voiceBusy = voice.active !== null && !myVoice;
  const down = () => { if (!voiceBusy && !holding.current) { holding.current = true; onVoice('start'); } };
  const up = () => { if (holding.current) { holding.current = false; onVoice('stop'); } };

  return (
    <div className={`composer ${who}`}>
      <div className="composer-head">
        <span className={`who-tag ${who}`}>{who}</span>
        <select value={lang} onChange={(e) => setLang(e.target.value as LangCode)} aria-label={`${who} language`}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
        </select>
        {text.trim() && (
          <button
            className={`lang-chip ${langSource}`}
            title="Click to correct the language of this message"
            onClick={() => {
              const i = LANGS.findIndex((l) => l.code === msgLang);
              setOverride(LANGS[(i + 1) % LANGS.length].code);
              setCountdown(null);
            }}
          >
            {langSource === 'auto' ? (detectedBy === 'speech_model' ? 'heard' : 'guessed') : 'language'}: {langName(msgLang)} ⟳
          </button>
        )}
        <details className="phrases">
          <summary>phrases</summary>
          <div className="phrase-list">
            {PHRASES.map((p) => (
              <button key={p.id} className={`phrase ${p.kind}`} onClick={(e) => { setText(p.text[lang]); setOverride(null); setVoiceMeta(null); setCountdown(null); fromSpeech.current = null; (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>
                {p.text[lang]}
              </button>
            ))}
          </div>
        </details>
      </div>
      {replyTarget && (
        <div className="reply-chip">
          ↳ responding to {replyTarget.participantId}: “{[...(replyTarget.translation?.text ?? replyTarget.text)].slice(0, 40).join('')}”
          <button className="link-btn" onClick={onClearReply}>✕</button>
        </div>
      )}
      <div className="composer-row">
        {voice.mode === 'cloud' && (
          <button
            className={`btn talk ${myVoice && voice.phase === 'recording' ? 'rec' : ''}`}
            disabled={voiceBusy || (myVoice && voice.phase === 'transcribing')}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); down(); }}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            onBlur={up}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); down(); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); up(); } }}
            title="Hold while you speak; release to transcribe. The language is detected automatically."
          >
            {myVoice ? (voice.phase === 'recording' ? `● ${voice.elapsed.toFixed(0)}s — release` : voice.phase === 'starting' ? 'requesting mic…' : 'transcribing…') : 'hold to speak'}
          </button>
        )}
        <textarea
          value={text}
          rows={1}
          placeholder={who === 'A' ? 'A writes… / 写下… / 書く… / escribe…' : 'B writes… / 写下… / 書く… / escribe…'}
          onFocus={() => setCountdown(null)}
          onChange={(e) => { setText(e.target.value); fromSpeech.current = null; setVoiceMeta(null); setCountdown(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
          aria-label={`Participant ${who} message`}
        />
        {voice.mode !== 'cloud' && speechEnabled && (
          <button className={`btn icon ${dictating ? 'rec' : ''}`} onClick={toggleDictation} title="Browser dictation (language = the selected one)">
            {dictating ? 'stop' : 'mic'}
          </button>
        )}
        <button className="btn primary" onClick={send} disabled={!text.trim()}>Send</button>
      </div>
      {countdown !== null && (
        <p className="note voice-note">
          {voiceMeta?.detectedBy === 'speech_model' ? 'heard' : 'transcribed; language guessed from the text:'} {voiceMeta?.lang ? langName(voiceMeta.lang) : 'unclear'} · sending in {Math.ceil(countdown)}s — click the text to edit, or the language chip to correct{' '}
          <button className="btn tiny ghost" onClick={() => setCountdown(null)}>hold</button>
        </p>
      )}
      {note && <p className="note">{note}</p>}
      <GiftRow who={who} tray={props.tray} gifts={props.gifts} onSend={props.onSend} onGift={props.onGift} onGiftReply={props.onGiftReply} />
      <details className="symbols-box">
        <summary>symbols</summary>
        <div className="symbols" role="group" aria-label={`${who} symbols`}>
          {SYMBOL_KINDS.map((k) => (
            <button key={k} className="sym-btn" onClick={() => onSymbol(k)} title={`Place ${k} at ${who} (also adds it to your elements)`}>{k === 'unfolding' ? 'unfold' : k}</button>
          ))}
        </div>
      </details>
    </div>
  );
}

export const FLOW_STEPS = ['Express', 'Understand', 'Respond', 'Co-Create', 'Reflect'] as const;
export interface FlowState {
  /** Steps done at least once this session (cumulative). */
  done: boolean[];
  /** The plain-language next action. */
  next: string;
}

/** Express → Understand → Respond → Co-Create → Reflect, with what to do next. */
export function FlowSteps({ flow, compact = false }: { flow: FlowState; compact?: boolean }) {
  const current = flow.done.findIndex((d) => !d);
  return (
    <div className={`flow ${compact ? 'compact' : ''}`} aria-label="Session steps">
      <ol>
        {FLOW_STEPS.map((name, i) => (
          <li key={name} className={flow.done[i] ? 'done' : i === current ? 'now' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="n">{flow.done[i] ? '✓' : i + 1}</span>{name}
          </li>
        ))}
      </ol>
      {!compact && <p className="flow-next">{flow.next}</p>}
    </div>
  );
}

interface Props {
  active: boolean;
  flow: FlowState;
  mode: { label: string; detail: string; kind: 'ai' | 'local' };
  langs: Record<ParticipantId, LangCode>;
  setLang: (p: ParticipantId, l: LangCode) => void;
  topics: SharedTopic[];
  similarity: { value: number; source: string };
  speechEnabled: boolean;
  aiNote: string;
  audioOn: boolean;
  speaker: SpeakerMode;
  setSpeaker: (s: SpeakerMode) => void;
  chips: { label: string; kind: 'real' | 'sim' | 'ai' | '' }[];
  hint: string;
  voice: VoiceUi;
  onVoice: (p: ParticipantId, action: 'start' | 'stop') => void;
  onSubmit: (p: ParticipantId, text: string, lang: LangCode, src: 'manual' | 'auto', mode: TextMessage['inputMode'], rate?: number, detectedBy?: TextMessage['langDetectedBy']) => void;
  onSymbol: (owner: ParticipantId | 'shared', k: SymbolKind) => void;
  replyTargets: Record<ParticipantId, TextMessage | null>;
  onClearReply: (p: ParticipantId) => void;
  trays: Record<ParticipantId, TrayItem[]>;
  gifts: GiftSnapshot[];
  onSend: (p: ParticipantId, item: TrayItem) => void;
  onGift: (id: string, a: GiftAction) => void;
  onGiftReply: (id: string, text: string) => void;
  preview: ReactNode;
}

export function ConversationBar(p: Props) {
  const topic = p.topics[p.topics.length - 1];
  const composer = (who: ParticipantId) => (
    <Composer
      active={p.active}
      who={who} lang={p.langs[who]} setLang={(l) => p.setLang(who, l)} speechEnabled={p.speechEnabled}
      voice={p.voice} onVoice={(a) => p.onVoice(who, a)}
      onSubmit={(...a) => p.onSubmit(who, ...a)} onSymbol={(k) => p.onSymbol(who, k)}
      replyTarget={p.replyTargets[who]} onClearReply={() => p.onClearReply(who)}
      tray={p.trays[who]} gifts={p.gifts} onSend={(item) => p.onSend(who, item)} onGift={p.onGift} onGiftReply={p.onGiftReply}
    />
  );
  return (
    <footer className="convbar ui">
      {composer('A')}
      <div className="center-col">
        <FlowSteps flow={p.flow} />
        <div className={`mode-badge ${p.mode.kind}`} title={p.mode.detail}>
          <b>{p.mode.label}</b><span>{p.mode.detail}</span>
        </div>
        {p.preview}
        {p.audioOn && (
          <div className="seg small" role="group" aria-label="Who is speaking (manual turn)">
            <span className="seg-label">voice</span>
            {(['shared', 'A', 'B'] as const).map((s) => (
              <button key={s} className={`seg-btn ${p.speaker === s ? 'on' : ''}`} onClick={() => p.setSpeaker(s)} title={s === 'shared' ? 'Shared microphone (key 0)' : `Manual turn: ${s} is speaking (key ${s === 'A' ? 1 : 2})`}>
                {s === 'shared' ? 'shared' : `${s} speaking`}
              </button>
            ))}
          </div>
        )}
        <div className="chips">
          {p.chips.map((c) => <span key={c.label} className={`chip ${c.kind}`}>{c.label}</span>)}
        </div>
        <div className="topic-line">
          {topic ? (
            <>
              <span className={`tag ${topic.source === 'ai' ? 'ai' : ''}`}>{topic.source === 'ai' ? 'AI TOPIC' : 'LEXICON TOPIC'}</span> shared: <b>{topic.label}</b>
              <span className="muted"> · topic overlap {p.similarity.value.toFixed(2)}</span>
            </>
          ) : null}
        </div>
        <details className="symbols-box">
          <summary>shared symbol</summary>
          <div className="shared-sym">
            {(['flower', 'halo', 'star', 'unfolding'] as const).map((k) => (
              <button key={k} className="sym-btn" onClick={() => p.onSymbol('shared', k)}>{k === 'unfolding' ? 'unfold' : k}</button>
            ))}
          </div>
        </details>
        <p className="hint">{p.hint}</p>
      </div>
      {composer('B')}
    </footer>
  );
}
