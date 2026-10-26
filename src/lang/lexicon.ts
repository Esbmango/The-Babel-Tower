import type { LangCode, SymbolKind } from '../types';

/**
 * Local multilingual concept lexicon — the offline "demo" semantic layer.
 * It recognises a small set of everyday concepts in zh / en / ja / es so that keywords,
 * shared topics and a word-by-word gloss work with no API. It is NOT a translator:
 * its gloss is labelled "demo gloss" everywhere it appears.
 * Concepts map to motifs only through what people actually wrote, never through who they are.
 */
interface Concept {
  id: string;
  label: Record<LangCode, string>;
  forms: Record<LangCode, string[]>;
  motif: SymbolKind;
}

const C = (id: string, motif: SymbolKind, label: [string, string, string, string], forms: [string[], string[], string[], string[]]): Concept => ({
  id,
  motif,
  label: { zh: label[0], en: label[1], ja: label[2], es: label[3] },
  forms: { zh: forms[0], en: forms[1], ja: forms[2], es: forms[3] },
});

export const CONCEPTS: Concept[] = [
  C('home', 'house', ['家', 'home', '家', 'hogar'], [['家乡', '故乡', '老家', '家'], ['home', 'homes', 'house'], ['故郷', 'ふるさと', '実家', '家'], ['hogar', 'casa', 'pueblo natal']]),
  C('hometown', 'house', ['家乡', 'hometown', '故郷', 'pueblo natal'], [['家乡', '故乡', '老家'], ['hometown', 'homeland'], ['故郷', 'ふるさと', '地元'], ['pueblo natal', 'tierra natal', 'mi pueblo']]),
  C('miss', 'feather', ['想念', 'miss', '恋しい', 'extrañar'], [['想念', '思念', '想家'], ['miss', 'missing', 'missed'], ['恋しい', '懐かしい', '会いたい'], ['extraño', 'extrañar', 'echo de menos', 'extraña']]),
  C('family', 'halo', ['家人', 'family', '家族', 'familia'], [['家人', '家庭', '家族'], ['family', 'families'], ['家族'], ['familia']]),
  C('mother', 'halo', ['妈妈', 'mother', '母', 'madre'], [['妈妈', '母亲', '妈'], ['mother', 'mom', 'mum', 'mama'], ['母', 'お母さん', 'ママ'], ['madre', 'mamá', 'mama']]),
  C('father', 'halo', ['爸爸', 'father', '父', 'padre'], [['爸爸', '父亲'], ['father', 'dad'], ['父', 'お父さん'], ['padre', 'papá']]),
  C('friend', 'bridge', ['朋友', 'friend', '友達', 'amigo'], [['朋友', '友谊'], ['friend', 'friends', 'friendship'], ['友達', '友人', '仲間'], ['amigo', 'amiga', 'amigos', 'amistad']]),
  C('food', 'flower', ['食物', 'food', '食べ物', 'comida'], [['食物', '饭', '吃', '菜', '饺子', '妈妈做的'], ['food', 'eat', 'eating', 'cook', 'cooking', 'meal', 'dinner'], ['食べ物', 'ご飯', '料理', '食べる'], ['comida', 'comer', 'cocinar', 'cena']]),
  C('tea', 'flower', ['茶', 'tea', 'お茶', 'té'], [['茶'], ['tea'], ['お茶', '茶'], ['té']]),
  C('language', 'eye', ['语言', 'language', '言葉', 'idioma'], [['语言', '话', '说话', '中文', '母语'], ['language', 'languages', 'words', 'speak', 'talk'], ['言葉', '言語', '話す'], ['idioma', 'lengua', 'palabras', 'hablar']]),
  C('city', 'rays', ['城市', 'city', '街', 'ciudad'], [['城市', '城'], ['city', 'town', 'boston'], ['街', '都市', '町'], ['ciudad', 'pueblo']]),
  C('sea', 'wings', ['海', 'sea', '海', 'mar'], [['海', '大海'], ['sea', 'ocean', 'beach'], ['海'], ['mar', 'océano', 'playa']]),
  C('mountain', 'rays', ['山', 'mountain', '山', 'montaña'], [['山'], ['mountain', 'mountains', 'hill'], ['山'], ['montaña', 'montañas']]),
  C('sky', 'star', ['天空', 'sky', '空', 'cielo'], [['天空', '天上'], ['sky', 'heaven'], ['空', '天空'], ['cielo']]),
  C('star', 'star', ['星星', 'star', '星', 'estrella'], [['星星', '星'], ['star', 'stars'], ['星'], ['estrella', 'estrellas']]),
  C('light', 'rays', ['光', 'light', '光', 'luz'], [['光', '灯', '阳光'], ['light', 'sunlight', 'lights'], ['光', '明かり', '日差し'], ['luz', 'sol']]),
  C('flower', 'flower', ['花', 'flower', '花', 'flor'], [['花'], ['flower', 'flowers', 'garden'], ['花'], ['flor', 'flores', 'jardín']]),
  C('bird', 'wings', ['鸟', 'bird', '鳥', 'pájaro'], [['鸟'], ['bird', 'birds'], ['鳥'], ['pájaro', 'pájaros', 'ave']]),
  C('fly', 'wings', ['飞', 'fly', '飛ぶ', 'volar'], [['飞', '飞翔'], ['fly', 'flying', 'flight'], ['飛ぶ', '飛'], ['volar', 'vuelo']]),
  C('dream', 'unfolding', ['梦', 'dream', '夢', 'sueño'], [['梦', '梦想'], ['dream', 'dreams'], ['夢'], ['sueño', 'sueños', 'soñar']]),
  C('music', 'rays', ['音乐', 'music', '音楽', 'música'], [['音乐', '歌', '唱'], ['music', 'song', 'songs', 'sing'], ['音楽', '歌'], ['música', 'canción', 'cantar']]),
  C('warm', 'halo', ['温暖', 'warm', '暖かい', 'cálido'], [['温暖', '温馨', '暖'], ['warm', 'warmth', 'cozy'], ['暖かい', '温かい'], ['cálido', 'calor', 'calidez']]),
  C('together', 'bridge', ['一起', 'together', '一緒', 'juntos'], [['一起', '在一起', '团聚'], ['together'], ['一緒', '共に'], ['juntos', 'juntas']]),
  C('love', 'flower', ['爱', 'love', '愛', 'amor'], [['爱', '喜欢'], ['love', 'loved'], ['愛', '好き'], ['amor', 'quiero', 'amo']]),
  C('school', 'eye', ['学校', 'school', '学校', 'escuela'], [['学校', '大学', '上学'], ['school', 'university', 'college', 'class'], ['学校', '大学'], ['escuela', 'universidad', 'colegio']]),
  C('rain', 'feather', ['雨', 'rain', '雨', 'lluvia'], [['雨', '下雨'], ['rain', 'rainy'], ['雨'], ['lluvia', 'llover']]),
  C('night', 'star', ['夜晚', 'night', '夜', 'noche'], [['夜', '晚上'], ['night', 'evening'], ['夜', '晩'], ['noche']]),
  C('memory', 'feather', ['回忆', 'memory', '思い出', 'recuerdo'], [['回忆', '记忆', '记得'], ['memory', 'memories', 'remember'], ['思い出', '覚えて', '記憶'], ['recuerdo', 'recuerdos', 'recordar']]),
  C('childhood', 'feather', ['童年', 'childhood', '子供の頃', 'infancia'], [['童年', '小时候'], ['childhood', 'kid', 'child'], ['子供の頃', '子ども', '子供'], ['infancia', 'niñez', 'niño', 'niña']]),
  C('heart', 'halo', ['心', 'heart', '心', 'corazón'], [['心'], ['heart'], ['心'], ['corazón']]),
  C('see', 'eye', ['看见', 'see', '見る', 'ver'], [['看见', '看到', '眼睛', '看'], ['see', 'seen', 'look', 'eye', 'eyes'], ['見る', '見た', '目'], ['ver', 'veo', 'mirar', 'ojo', 'ojos']]),
  C('travel', 'wings', ['旅行', 'travel', '旅', 'viaje'], [['旅行', '旅途', '离开'], ['travel', 'journey', 'trip'], ['旅', '旅行'], ['viaje', 'viajar']]),
  C('peace', 'halo', ['平静', 'peace', '平和', 'paz'], [['平静', '和平', '安心'], ['peace', 'calm', 'safe'], ['平和', '安心', '落ち着く'], ['paz', 'calma', 'tranquilo', 'tranquila']]),
  C('hope', 'halo', ['希望', 'hope', '希望', 'esperanza'], [['希望'], ['hope'], ['希望'], ['esperanza', 'espero']]),
  C('nature', 'tree', ['自然', 'nature', '自然', 'naturaleza'], [['自然', '树', '森林', '草地', '大自然', '花园'], ['nature', 'tree', 'trees', 'forest', 'woods', 'plant', 'plants', 'park'], ['自然', '木', '森', '林', '公園', '植物'], ['naturaleza', 'árbol', 'árboles', 'bosque', 'planta', 'parque']]),
  C('freedom', 'wings', ['自由', 'freedom', '自由', 'libertad'], [['自由', '无拘无束'], ['freedom', 'free', 'freely'], ['自由'], ['libertad', 'libre']]),
  C('connection', 'bridge', ['联系', 'connection', 'つながり', 'conexión'], [['联系', '连接', '连结', '相连', '陪伴'], ['connection', 'connected', 'connect', 'belong', 'belonging', 'company'], ['つながり', '繋がり', '絆', '一緒にいる'], ['conexión', 'conectar', 'conectados', 'compañía', 'pertenecer']]),
];

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Concept ids found in a message. CJK: substring match; en/es: whole words (accent-insensitive, simple plural). */
export function findConcepts(text: string, lang: LangCode): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  const cjk = lang === 'zh' || lang === 'ja';
  const words = cjk ? [] : stripAccents(lower).split(/[^a-zñü']+/).filter(Boolean);
  const wordSet = new Set(words.flatMap((w) => [w, w.replace(/(es|s)$/, '')]));
  const phrase = ' ' + words.join(' ') + ' ';
  // Also scan the other languages' CJK forms for mixed-language text.
  for (const c of CONCEPTS) {
    // Cross-language CJK forms only when 2+ characters: a single shared character (空, 天) is too ambiguous.
    const forms = cjk ? [...c.forms[lang], ...c.forms[lang === 'zh' ? 'ja' : 'zh'].filter((f) => [...f].length >= 2)] : c.forms[lang];
    for (const f of forms) {
      if (cjk) {
        if (lower.includes(f)) { found.add(c.id); break; }
      } else {
        const ff = stripAccents(f.toLowerCase());
        if (ff.includes(' ') ? phrase.includes(' ' + ff + ' ') : wordSet.has(ff)) { found.add(c.id); break; }
      }
    }
  }
  // "hometown" implies "home" — keep the more specific one only.
  if (found.has('hometown')) found.delete('home');
  return [...found];
}

export function conceptLabel(id: string, lang: LangCode) {
  return CONCEPTS.find((c) => c.id === id)?.label[lang] ?? id;
}

export function conceptMotif(id: string): SymbolKind {
  return CONCEPTS.find((c) => c.id === id)?.motif ?? 'flower';
}

/** Word-by-word concept gloss. Explicitly a demo, not a translation. */
export function demoGloss(concepts: string[], to: LangCode): string {
  return concepts.length ? concepts.map((id) => conceptLabel(id, to)).join(' · ') : '…';
}

/** Jaccard similarity of two concept sets (0..1). Topical overlap only — not understanding. */
export function conceptSimilarity(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

/** Guided-experience categories (Phase 6): what each recognised concept grows into. */
export const GUIDE_CATEGORIES: { id: 'HOME' | 'HOPE' | 'NATURE' | 'FREEDOM' | 'CONNECTION'; element: SymbolKind; concepts: string[]; label: string }[] = [
  { id: 'HOME', element: 'house', concepts: ['home', 'hometown', 'family', 'mother', 'father', 'food', 'tea', 'childhood', 'warm', 'memory'], label: 'Geometric House' },
  { id: 'HOPE', element: 'halo', concepts: ['hope', 'light', 'dream', 'peace', 'heart', 'love'], label: 'Halo' },
  { id: 'NATURE', element: 'tree', concepts: ['nature', 'flower', 'sea', 'mountain', 'rain', 'sky', 'star', 'night'], label: 'Flower / Tree' },
  { id: 'FREEDOM', element: 'wings', concepts: ['freedom', 'fly', 'bird', 'travel'], label: 'Wings' },
  { id: 'CONNECTION', element: 'bridge', concepts: ['connection', 'together', 'friend', 'language', 'miss', 'music'], label: 'Bridge / Weaving' },
];

export function guideCategory(conceptId: string) {
  return GUIDE_CATEGORIES.find((c) => c.concepts.includes(conceptId)) ?? null;
}
