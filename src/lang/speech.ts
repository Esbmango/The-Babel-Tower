import { speechLocale } from './languages';
import type { LangCode } from '../types';

/**
 * Optional speech-to-text via the browser's Web Speech API.
 * In Chrome / Edge / Safari this sends audio to the browser vendor's cloud speech service, so the UI
 * asks for explicit consent first and labels dictated text as "speech". The transcript goes into the
 * text box for the person to check and correct before sending — it is never submitted automatically.
 */
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => !!ctor();

/** Words per minute, or CJK characters per minute for Chinese / Japanese. */
export function speakingRate(text: string, lang: LangCode, seconds: number) {
  if (seconds < 0.8) return undefined;
  const units = lang === 'zh' || lang === 'ja'
    ? (text.match(/[぀-ヿ㐀-鿿]/g) ?? []).length
    : text.split(/\s+/).filter(Boolean).length;
  return units ? (units / seconds) * 60 : undefined;
}

export class Dictation {
  private rec: Recognition | null = null;
  private speechStart = 0;

  start(lang: LangCode, onText: (text: string, final: boolean, seconds: number) => void, onEnd: (error?: string) => void) {
    const C = ctor();
    if (!C) { onEnd('not_supported'); return; }
    const rec = new C();
    this.rec = rec;
    rec.lang = speechLocale(lang);
    rec.interimResults = true;
    rec.continuous = false;
    this.speechStart = performance.now();
    let finalText = '';
    rec.onspeechstart = () => { this.speechStart = performance.now(); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      const secs = (performance.now() - this.speechStart) / 1000;
      onText((finalText + interim).trim(), !interim, secs);
    };
    rec.onerror = (e) => onEnd(e.error);
    rec.onend = () => { this.rec = null; onEnd(); };
    rec.start();
  }

  stop() {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = rec.onspeechstart = null;
    rec.stop();
  }
}
