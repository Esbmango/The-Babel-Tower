import { useState } from 'react';
import { LANGS, langName } from '../lang/languages';
import { INPUT_LABEL, SOURCE_LABEL } from '../export/film';
import type { LangCode, ParticipantId, TextMessage } from '../types';

export const PROMPT_IN: Record<LangCode, string> = {
  en: 'What makes you feel at home?',
  zh: '是什么让你有家的感觉？',
  ja: 'あなたが「家にいる」と感じるのはどんなとき？',
  es: '¿Qué te hace sentir en casa?',
};

interface Props {
  presenting?: boolean;
  messages: TextMessage[];
  langs: Record<ParticipantId, LangCode>;
  onCheck: (id: string, by: ParticipantId, v: 'clear' | 'unclear') => void;
  onRespond: (reader: ParticipantId, messageId: string) => void;
  onCorrectLang: (id: string, l: LangCode) => void;
  onEditTranslation: (id: string, text: string) => void;
  onSendAsGift: (m: TextMessage) => void;
  aiPending: boolean;
}

const other = (p: ParticipantId): ParticipantId => (p === 'A' ? 'B' : 'A');

/**
 * Bilingual Exchange Bridge — the two-sided subtitles.
 * The speaker's side shows what they said, in their language; the other side shows it in the reader's
 * language, labelled by where the translation came from. Understanding is only ever self-reported.
 */
export function SubtitleBridge({ messages, langs, onCheck, onRespond, onCorrectLang, onEditTranslation, onSendAsGift, aiPending, presenting = false }: Props) {
  const [editing, setEditing] = useState(false);
  const m = messages[messages.length - 1];
  const replied = m?.replyTo ? messages.find((x) => x.id === m.replyTo) : undefined;

  const sidePanel = (side: ParticipantId) => {
    const cls = `bridge-side ${side}`;
    if (!m) {
      return (
        <div className={cls}>
          <span className="b-label">{side} · {langName(langs[side])}</span>
          <p className="b-text prompt-text">{PROMPT_IN[langs[side]]}</p>
          {!presenting && <span className="b-sub">type, pick a phrase, or hold to speak — then the other side shows a translation</span>}
        </div>
      );
    }
    if (m.participantId === side) {
      return (
        <div className={`${cls} speaking`}>
          <span className="b-label">
            {side} · {presenting ? langName(m.lang) : <select className="fix-lang" value={m.lang} onChange={(e) => onCorrectLang(m.id, e.target.value as LangCode)} aria-label="Correct the language of this message">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
            </select>}
            {' · '}{INPUT_LABEL[m.inputMode]}{m.langSource === 'auto' ? (m.langDetectedBy === 'speech_model' ? ' · LANGUAGE HEARD' : ' · LANGUAGE GUESSED') : ''}{m.corrected ? ' · CORRECTED' : ''}
          </span>
          <p className="b-text">{m.text}</p>
          {replied && <span className="b-sub">↳ responding to {replied.participantId}: “{[...replied.text].slice(0, 48).join('')}”</span>}
          {!presenting && <span className="b-actions">
            <button className="btn tiny" onClick={() => onSendAsGift(m)}>send these words as a gift → {other(side)}</button>
            {m.check?.value === 'unclear' && <span className="b-flag">{m.check.by} marked this unclear — try saying it another way</span>}
            {m.check?.value === 'clear' && <span className="b-ok">{m.check.by}: “I follow” (self-reported)</span>}
          </span>}
        </div>
      );
    }
    // The reader's side: the translation into their language.
    const tr = m.translation;
    return (
      <div className={`${cls} reading`}>
        <span className="b-label">→ {side} · {tr ? `${langName(tr.to)} · ${SOURCE_LABEL[tr.source]}` : `${langName(m.lang)} · same language`}</span>
        {editing && tr ? (
          <form className="tr-edit" onSubmit={(e) => {
            e.preventDefault();
            onEditTranslation(m.id, (new FormData(e.currentTarget).get('tr') as string) ?? '');
            setEditing(false);
          }}>
            <input name="tr" defaultValue={tr.text} aria-label="Correct the translation" />
            <button className="btn tiny" type="submit">save</button>
            <button className="btn tiny ghost" type="button" onClick={() => setEditing(false)}>cancel</button>
          </form>
        ) : (
          <p className="b-text">{tr ? tr.text : m.text}{aiPending && tr?.source === 'demo_gloss' ? <span className="b-pending"> · AI translating…</span> : null}</p>
        )}
        {!presenting && <span className="b-actions">
          <button className={`btn tiny ${m.check?.value === 'clear' ? 'on' : ''}`} onClick={() => onCheck(m.id, side, 'clear')}>I follow</button>
          <button className={`btn tiny ${m.check?.value === 'unclear' ? 'on' : ''}`} onClick={() => onCheck(m.id, side, 'unclear')}>unclear</button>
          <button className="btn tiny primary" onClick={() => onRespond(side, m.id)}>respond ↩</button>
          {tr && <button className="link-btn" onClick={() => setEditing(true)}>fix translation</button>}
        </span>}
      </div>
    );
  };

  return (
    <section className="bridge ui" aria-label="Bilingual exchange" aria-live="polite">
      {sidePanel('A')}
      <div className="bridge-mid">
        {m ? (
          <>
            <span className="b-arrow">{m.participantId === 'A' ? 'A  ⟶  B' : 'A  ⟵  B'}</span>
            <span className="b-src mono small">{m.translation ? SOURCE_LABEL[m.translation.source] : 'same language'}</span>
          </>
        ) : (
          <span className="b-arrow">A  ⟷  B</span>
        )}
        <span className="note">translations can be wrong — check with each other</span>
      </div>
      {sidePanel('B')}
    </section>
  );
}
