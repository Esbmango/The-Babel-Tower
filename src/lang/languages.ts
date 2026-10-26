import type { LangCode } from '../types';

export const LANGS: { code: LangCode; native: string; en: string; speech: string }[] = [
  { code: 'zh', native: '中文', en: 'Chinese', speech: 'zh-CN' },
  { code: 'en', native: 'English', en: 'English', speech: 'en-US' },
  { code: 'ja', native: '日本語', en: 'Japanese', speech: 'ja-JP' },
  { code: 'es', native: 'Español', en: 'Spanish', speech: 'es-ES' },
];

export const langName = (c: LangCode) => LANGS.find((l) => l.code === c)?.native ?? c;
export const speechLocale = (c: LangCode) => LANGS.find((l) => l.code === c)?.speech ?? 'en-US';

const ES_HINTS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'es', 'por', 'para', 'con', 'mi', 'mis', 'tu', 'su', 'una', 'un',
  'yo', 'me', 'te', 'se', 'no', 'muy', 'pero', 'como', 'cuando', 'donde', 'también', 'tambien', 'hogar', 'casa', 'estoy', 'soy',
]);
const EN_HINTS = new Set([
  'the', 'and', 'is', 'are', 'i', 'my', 'you', 'to', 'of', 'in', 'it', 'that', 'what', 'me', 'we', 'feel', 'home', 'miss', 'too',
  'with', 'for', 'this', 'was', 'be', 'have', 'do', 'not', 'like',
]);

/**
 * Lightweight local language guess for zh / en / ja / es. It can be wrong (short text, mixed
 * languages, kanji-only Japanese), so the UI always lets people correct it by hand.
 */
export function detectLang(text: string): { lang: LangCode; confidence: number } | null {
  const t = text.trim();
  if (!t) return null;
  const kana = (t.match(/[぀-ヿ]/g) ?? []).length;
  const han = (t.match(/[一-鿿㐀-䶿]/g) ?? []).length;
  if (kana > 0) return { lang: 'ja', confidence: Math.min(1, 0.6 + kana / Math.max(4, t.length)) };
  if (han > 0) return { lang: 'zh', confidence: han >= 2 ? 0.8 : 0.55 };

  const words = t.toLowerCase().normalize('NFC').match(/[a-záéíóúñü¿¡']+/g) ?? [];
  if (!words.length) return null;
  let es = /[ñ¿¡áéíóú]/i.test(t) ? 2 : 0;
  let en = 0;
  for (const w of words) {
    if (ES_HINTS.has(w)) es++;
    if (EN_HINTS.has(w)) en++;
  }
  if (es === en) return { lang: en > 0 ? 'en' : 'en', confidence: 0.4 };
  const lang: LangCode = es > en ? 'es' : 'en';
  return { lang, confidence: Math.min(0.95, 0.5 + Math.abs(es - en) / (words.length + 1)) };
}
