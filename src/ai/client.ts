import type { LangCode, ParticipantId } from '../types';

/**
 * Browser client for the server-side AI proxy (/api/ai/*). The browser never sees an API key.
 * Every call can fail (no key, offline, provider error): callers must fall back to local demo mode.
 */
export interface AiStatus {
  available: boolean;
  provider?: string;
  model?: string;
  reason?: string;
  /** Cloud speech-to-text with automatic language identification (needs an OpenAI-compatible key). */
  transcribe?: { available: boolean; model: string };
}

export interface TranscribeResult {
  text: string;
  language: LangCode | null;
  rawLanguage: string | null;
  detectedBy: 'speech_model' | 'none';
  durationSec: number | null;
  model: string;
}

export interface AnalyzeResult {
  provider: string;
  model: string;
  translation: { id: string; to: LangCode; text: string };
  keywords: Record<string, string[]>;
  sharedTopics: { label_en: string; label_zh: string; messageIds: string[]; similarity: number }[];
  similarity: number;
}

export interface SummaryResult {
  provider: string;
  model: string;
  zh: string;
  en: string;
}

const url = (p: string) => new URL(`api/ai/${p}`, document.baseURI).toString();

async function post<T>(path: string, body: unknown, timeoutMs = 30000, signal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `AI request failed (${r.status})`);
    return j as T;
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', abort);
  }
}

export async function aiStatus(): Promise<AiStatus> {
  try {
    const r = await fetch(url('status'), { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return { available: false, reason: 'no_server' };
    const j = await r.json();
    return { available: !!j.available, provider: j.provider, model: j.model, reason: j.reason, transcribe: j.transcribe };
  } catch {
    return { available: false, reason: 'no_server' };
  }
}

export function aiAnalyze(body: {
  messages: { id: string; participantId: ParticipantId; lang: LangCode; text: string }[];
  targets: Record<ParticipantId, LangCode>;
  newMessageId: string;
}, signal?: AbortSignal) {
  return post<AnalyzeResult>('analyze', body, 30000, signal);
}

export function aiSummary(body: { stats: unknown; includeText: boolean; messages: unknown[] }) {
  return post<SummaryResult>('summary', body, 45000);
}

/** Upload one short voice clip for transcription + automatic language detection. Only called with both participants' consent. */
export async function aiTranscribe(clip: Blob, signal?: AbortSignal): Promise<TranscribeResult> {
  const buf = new Uint8Array(await clip.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return post<TranscribeResult>('transcribe', { audio: btoa(bin), mime: clip.type || 'audio/webm' }, 45000, signal);
}
