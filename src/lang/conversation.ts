import { aiAnalyze } from '../ai/client';
import { EventLog } from '../engine/events';
import { conceptLabel, conceptMotif, conceptSimilarity, demoGloss, findConcepts } from './lexicon';
import { matchPhrase } from './phrasebook';
import type { LangCode, ParticipantId, SharedTopic, SymbolKind, TextMessage } from '../types';

const other = (p: ParticipantId): ParticipantId => (p === 'A' ? 'B' : 'A');
const TOPIC_WINDOW_SEC = 180;

/**
 * Two-person multilingual conversation state.
 * 1. Always: local lexicon keywords, demo gloss, shared-topic detection (works offline).
 * 2. Only with both participants' consent and a configured server key: AI translation, keywords,
 *    shared topics and similarity — stored with source "ai" so they are never confused with data.
 */
export class Conversation {
  messages: TextMessage[] = [];
  topics: SharedTopic[] = [];
  similarity = 0;
  similaritySource: 'local_lexicon' | 'ai' = 'local_lexicon';
  aiEnabled = false;
  aiError: string | null = null;
  aiPending = 0;
  private seq = 0;
  private generation = 0;
  private pending = new Set<AbortController>();
  private revisions = new WeakMap<TextMessage, number>();

  onChange: () => void = () => {};
  onMessage: (m: TextMessage) => void = () => {};
  onTranslation: (m: TextMessage) => void = () => {};
  onTopic: (t: SharedTopic, motif: SymbolKind, labelZh: string) => void = () => {};
  onCorrected: (m: TextMessage) => void = () => {};

  constructor(
    private events: EventLog,
    private langs: () => Record<ParticipantId, LangCode>,
  ) {}

  /** Best local translation: the human-written phrasebook when the text is a known phrase, else a keyword gloss. */
  private localTranslation(text: string, lang: LangCode, keywords: string[], to: LangCode): TextMessage['translation'] {
    if (to === lang) return undefined;
    const ph = matchPhrase(text);
    if (ph) return { text: ph.phrase.text[to], to, source: 'phrasebook' };
    return { text: demoGloss(keywords, to), to, source: 'demo_gloss' };
  }

  submit(
    p: ParticipantId, text: string, lang: LangCode, langSource: 'manual' | 'auto', inputMode: TextMessage['inputMode'],
    speakingRate?: number, langDetectedBy?: TextMessage['langDetectedBy'], opts: { replyTo?: string; giftId?: string } = {},
  ) {
    const clean = text.trim().slice(0, 500);
    if (!clean) return null;
    // A phrasebook phrase knows its own language; trust it over a weak automatic guess.
    const ph = matchPhrase(clean);
    if (ph && langSource === 'auto') lang = ph.lang;
    const to = this.langs()[other(p)];
    const keywords = findConcepts(clean, lang);
    const m: TextMessage = {
      id: `m${++this.seq}`,
      participantId: p,
      text: clean,
      lang,
      langSource,
      inputMode,
      timestamp: this.events.now(),
      keywords,
      keywordSource: 'local_lexicon',
      translation: this.localTranslation(clean, lang, keywords, to),
      speakingRate,
      langDetectedBy: langSource === 'auto' ? langDetectedBy ?? 'text_heuristic' : undefined,
      replyTo: opts.replyTo,
      giftId: opts.giftId,
    };
    this.messages.push(m);
    if (this.messages.length > 200) this.messages.shift();
    this.events.push({
      type: 'text_message',
      participantId: p,
      source: inputMode === 'typed' ? 'text' : 'speech',
      features: {
        lang, langSource, inputMode, chars: clean.length, keywords: keywords.join(','),
        ...(m.langDetectedBy ? { langDetectedBy: m.langDetectedBy } : {}),
        ...(m.translation ? { translation: m.translation.source } : {}),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(speakingRate ? { speakingRate: Math.round(speakingRate) } : {}),
      },
    });
    if (m.replyTo) {
      const orig = this.messages.find((x) => x.id === m.replyTo);
      this.events.push({
        type: 'respond', participantId: p, source: 'user',
        features: {
          messageId: m.id, replyTo: m.replyTo, toParticipant: orig?.participantId ?? '', viaGift: !!opts.giftId,
          latencySec: orig ? Math.round((m.timestamp - orig.timestamp) * 10) / 10 : -1,
        },
      });
    }
    this.onMessage(m);
    this.localTopics(m);
    this.updateLocalSimilarity();
    this.onChange();
    if (this.aiEnabled) void this.analyzeWithAi(m);
    return m;
  }

  private recent(p: ParticipantId, now: number) {
    return this.messages.filter((x) => x.participantId === p && now - x.timestamp <= TOPIC_WINDOW_SEC);
  }

  private localTopics(m: TextMessage) {
    const theirs = this.recent(other(m.participantId), m.timestamp);
    const theirConcepts = new Set(theirs.flatMap((x) => (x.keywordSource === 'local_lexicon' ? x.keywords : findConcepts(x.text, x.lang))));
    const mine = findConcepts(m.text, m.lang);
    for (const c of mine) {
      if (!theirConcepts.has(c)) continue;
      if (this.topics.some((t) => t.label === conceptLabel(c, 'en') && m.timestamp - t.timestamp < 60)) continue;
      const evidence = theirs.filter((x) => findConcepts(x.text, x.lang).includes(c)).map((x) => x.id);
      this.addTopic({
        id: `t${this.topics.length + 1}`,
        label: conceptLabel(c, 'en'),
        source: 'local_lexicon',
        timestamp: m.timestamp,
        messageIds: [...evidence, m.id],
        similarity: conceptSimilarity(mine, [...theirConcepts]),
      }, conceptMotif(c), conceptLabel(c, 'zh'));
    }
  }

  private addTopic(t: SharedTopic, motif: SymbolKind, labelZh: string) {
    this.topics.push(t);
    this.events.push({
      type: 'shared_topic',
      participantId: 'shared',
      source: t.source === 'ai' ? 'ai' : 'derived',
      features: { topic: t.label, topicZh: labelZh, similarity: Math.round(t.similarity * 100) / 100, interpretation: t.source },
    });
    this.onTopic(t, motif, labelZh);
  }

  private updateLocalSimilarity() {
    if (this.similaritySource === 'ai') return;
    const now = this.events.now();
    const a = this.recent('A', now).flatMap((x) => findConcepts(x.text, x.lang));
    const b = this.recent('B', now).flatMap((x) => findConcepts(x.text, x.lang));
    this.similarity = conceptSimilarity(a, b);
  }

  private async analyzeWithAi(m: TextMessage) {
    const generation = this.generation;
    const revision = (this.revisions.get(m) ?? 0) + 1;
    this.revisions.set(m, revision);
    const ctrl = new AbortController();
    this.pending.add(ctrl);
    this.aiPending++;
    this.onChange();
    try {
      const recent = this.messages.slice(-10).map((x) => ({ id: x.id, participantId: x.participantId, lang: x.lang, text: x.text }));
      const r = await aiAnalyze({ messages: recent, targets: this.langs(), newMessageId: m.id }, ctrl.signal);
      if (generation !== this.generation || revision !== this.revisions.get(m)) return;
      this.aiError = null;
      const keepHuman = m.translation?.source === 'phrasebook' || m.translation?.source === 'manual';
      if (r.translation?.text && r.translation.to !== m.lang && !keepHuman) {
        m.translation = { text: r.translation.text, to: r.translation.to, source: 'ai' };
        this.onTranslation(m);
      }
      const kw = r.keywords?.[m.id];
      if (kw?.length) {
        m.keywords = kw;
        m.keywordSource = 'ai';
      }
      this.similarity = r.similarity;
      this.similaritySource = 'ai';
      for (const t of r.sharedTopics ?? []) {
        if (this.topics.some((x) => x.label.toLowerCase() === t.label_en.toLowerCase())) continue;
        // Use the lexicon's motif when the AI label matches a known concept; otherwise a flower.
        const known = findConcepts(t.label_en, 'en')[0];
        this.addTopic({
          id: `t${this.topics.length + 1}`,
          label: t.label_en,
          source: 'ai',
          timestamp: this.events.now(),
          messageIds: t.messageIds,
          similarity: t.similarity,
        }, known ? conceptMotif(known) : 'flower', t.label_zh || t.label_en);
      }
      this.events.push({ type: 'ai_analysis', participantId: 'system', source: 'ai', features: { provider: r.provider, model: r.model, topics: r.sharedTopics?.length ?? 0 } });
    } catch (e) {
      if (generation !== this.generation || ctrl.signal.aborted || revision !== this.revisions.get(m)) return;
      this.aiError = (e as Error).message;
      this.events.push({ type: 'ai_error', participantId: 'system', source: 'system', features: { message: this.aiError.slice(0, 80) } });
    } finally {
      this.pending.delete(ctrl);
      if (generation === this.generation) {
        this.aiPending--;
        this.onChange();
      }
    }
  }

  /** A person fixes the language of a message after it was sent (auto-detection can be wrong). */
  correctLanguage(id: string, lang: LangCode) {
    const m = this.messages.find((x) => x.id === id);
    if (!m || m.lang === lang) return;
    const was = m.lang;
    m.lang = lang;
    m.langSource = 'manual';
    m.corrected = true;
    m.keywords = findConcepts(m.text, lang);
    m.keywordSource = 'local_lexicon';
    const to = this.langs()[other(m.participantId)];
    m.translation = this.localTranslation(m.text, lang, m.keywords, to);
    this.events.push({ type: 'language_corrected', participantId: m.participantId, source: 'user', features: { messageId: id, from: was, to: lang } });
    this.onCorrected(m);
    this.localTopics(m);
    this.updateLocalSimilarity();
    this.onChange();
    if (this.aiEnabled) void this.analyzeWithAi(m);
  }

  /**
   * The reader says whether the translation made sense to them. Self-reported only:
   * it is stored as such and never treated as measured understanding.
   */
  check(id: string, by: ParticipantId, value: 'clear' | 'unclear') {
    const m = this.messages.find((x) => x.id === id);
    if (!m || m.participantId === by) return;
    m.check = { by, value, at: this.events.now() };
    this.events.push({ type: 'understanding_check', participantId: by, source: 'user', features: { messageId: id, value, about: m.participantId, translation: m.translation?.source ?? 'none' } });
    this.onChange();
  }

  /** A person corrects a translation by hand; it is then labelled "manual". */
  editTranslation(id: string, text: string) {
    const m = this.messages.find((x) => x.id === id);
    const t = text.trim();
    if (!m || !t) return;
    const to = m.translation?.to ?? this.langs()[other(m.participantId)];
    m.translation = { text: t.slice(0, 500), to, source: 'manual' };
    this.events.push({ type: 'translation_edited', participantId: m.participantId, source: 'user', features: { messageId: id, to } });
    this.onTranslation(m);
    this.onChange();
  }

  /** Freeze a completed session; late network responses cannot change its artwork or report. */
  cancelPending() {
    this.generation++;
    for (const ctrl of this.pending) ctrl.abort();
    this.pending.clear();
    this.aiPending = 0;
    this.onChange();
  }

  reset() {
    this.cancelPending();
    this.aiError = null;
    this.messages = [];
    this.topics = [];
    this.similarity = 0;
    this.similaritySource = 'local_lexicon';
  }
}
