import type { LangCode } from '../types';

/**
 * Pre-translated demo phrasebook for the prompt "What makes you feel at home?".
 * Used so the core exchange is legible with no API: picking (or typing exactly) one of these
 * phrases gives a real, human-written translation, labelled PHRASEBOOK everywhere.
 * Anything else falls back to AI translation (with consent + key) or the keyword-only DEMO GLOSS.
 */
export interface Phrase {
  id: string;
  kind: 'answer' | 'reply';
  text: Record<LangCode, string>;
}

export const PHRASES: Phrase[] = [
  { id: 'cooking', kind: 'answer', text: {
    en: "My mother's cooking makes me feel at home.",
    zh: '妈妈做的饭让我有家的感觉。',
    ja: '母の手料理を食べると、家にいるような気持ちになります。',
    es: 'La comida de mi madre me hace sentir en casa.',
  } },
  { id: 'language', kind: 'answer', text: {
    en: 'Hearing my own language makes me feel at home.',
    zh: '听到自己的母语让我有家的感觉。',
    ja: '自分の母語を聞くと、家にいるような気持ちになります。',
    es: 'Escuchar mi propio idioma me hace sentir en casa.',
  } },
  { id: 'friends', kind: 'answer', text: {
    en: 'Friends who listen to me make me feel at home.',
    zh: '愿意倾听我的朋友让我有家的感觉。',
    ja: '話を聞いてくれる友達がいると、家にいるような気持ちになります。',
    es: 'Los amigos que me escuchan me hacen sentir en casa.',
  } },
  { id: 'sea', kind: 'answer', text: {
    en: 'The sea near my hometown.',
    zh: '我家乡附近的大海。',
    ja: '故郷の近くの海です。',
    es: 'El mar cerca de mi pueblo natal.',
  } },
  { id: 'garden', kind: 'answer', text: {
    en: 'A garden full of trees.',
    zh: '一个种满树的花园。',
    ja: '木がたくさんある庭です。',
    es: 'Un jardín lleno de árboles.',
  } },
  { id: 'freedom', kind: 'answer', text: {
    en: 'The freedom to be myself.',
    zh: '可以做自己的自由。',
    ja: '自分らしくいられる自由です。',
    es: 'La libertad de ser yo mismo.',
  } },
  { id: 'hope', kind: 'answer', text: {
    en: 'Having hope makes this city feel like home.',
    zh: '心怀希望让这座城市像家一样。',
    ja: '希望があると、この街も家のように感じます。',
    es: 'Tener esperanza hace que esta ciudad se sienta como mi hogar.',
  } },
  { id: 'family', kind: 'answer', text: {
    en: 'I miss my family.',
    zh: '我想念我的家人。',
    ja: '家族が恋しいです。',
    es: 'Extraño a mi familia.',
  } },
  { id: 'metoo', kind: 'reply', text: { en: 'Me too.', zh: '我也是。', ja: '私もです。', es: 'Yo también.' } },
  { id: 'more', kind: 'reply', text: { en: 'Tell me more.', zh: '再多说一点吧。', ja: 'もっと聞かせてください。', es: 'Cuéntame más.' } },
  { id: 'thanks', kind: 'reply', text: { en: 'Thank you for sharing.', zh: '谢谢你的分享。', ja: '話してくれてありがとう。', es: 'Gracias por compartir.' } },
  { id: 'rephrase', kind: 'reply', text: {
    en: "I don't understand. Can you say it another way?",
    zh: '我没听懂，可以换个说法吗？',
    ja: 'よくわかりません。別の言い方で言ってもらえますか？',
    es: 'No entiendo. ¿Puedes decirlo de otra manera?',
  } },
];

const norm = (s: string) =>
  s.normalize('NFKC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.,!?¿¡。、，！？’'"「」…]/g, '');

const INDEX = new Map<string, { phrase: Phrase; lang: LangCode }>();
for (const p of PHRASES) for (const [lang, t] of Object.entries(p.text)) INDEX.set(norm(t), { phrase: p, lang: lang as LangCode });

/** Exact (punctuation-insensitive) phrasebook match, or null. */
export function matchPhrase(text: string) {
  return INDEX.get(norm(text)) ?? null;
}
