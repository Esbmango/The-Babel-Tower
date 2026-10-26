import { COBALT, COBALT_DEEP, INK, LAVENDER, PAPER_RGB, rgba, SKY, WHITE } from '../engine/palette';
import { langName } from '../lang/languages';
import type { LangCode, ParticipantId, Translation } from '../types';

/**
 * Story Film overlay — drawn ONLY into the recording, after the artwork frame has been copied:
 *   title card · two-sided subtitles (A's language left on white, B's language right on blue) ·
 *   key-event ticker · end card.
 * The Artistic Portrait PNG never contains any of this. No camera image or microphone audio is used.
 */
export interface FilmLine {
  speaker: ParticipantId;
  original: string;
  origLang: LangCode;
  inputMode: 'typed' | 'speech' | 'voice';
  translation?: Translation;
  replyTo?: { by: ParticipantId; text: string };
  at: number; // performance.now()
}

export interface FilmState {
  startedAt: number;
  /** The prompt in each person's language (A left, B right). */
  prompt: Record<ParticipantId, string>;
  langs: Record<ParticipantId, LangCode>;
  last: FilmLine | null;
  ticker: { text: string; at: number }[];
  ending: { lines: string[]; at: number } | null;
}

const SERIF = '"Iowan Old Style", "Palatino Linotype", "Songti SC", "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const SOURCE_LABEL: Record<string, string> = {
  ai: 'AI TRANSLATION',
  phrasebook: 'PHRASEBOOK · PRE-TRANSLATED',
  demo_gloss: 'DEMO GLOSS · KEYWORDS ONLY',
  manual: 'EDITED BY A PERSON',
};
export const INPUT_LABEL: Record<string, string> = { typed: 'TYPED', voice: 'HEARD · TRANSCRIBED', speech: 'DICTATED' };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const cjk = /[぀-ヿ㐀-鿿]/.test(text);
  const tokens = cjk ? [...text] : text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  for (const tk of tokens) {
    if (ctx.measureText(cur + tk).width > maxW && cur) { lines.push(cur.trimEnd()); cur = tk.trimStart(); }
    else cur += tk;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/, '…');
  }
  return lines;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, side: ParticipantId, label: string, text: string, sub: string, alpha: number) {
  const onA = side === 'A';
  ctx.fillStyle = rgba(onA ? PAPER_RGB : COBALT, 0.92 * alpha);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(onA ? COBALT_DEEP : WHITE, 0.8 * alpha);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = rgba(onA ? COBALT_DEEP : SKY, alpha);
  ctx.fillText(label, x + 16, y + 22);
  ctx.font = `400 32px ${SERIF}`;
  ctx.fillStyle = rgba(onA ? INK : WHITE, alpha);
  wrap(ctx, text, w - 32, 2).forEach((ln, i) => ctx.fillText(ln, x + 16, y + 60 + i * 38));
  if (sub) {
    ctx.font = `500 11px ${MONO}`;
    ctx.fillStyle = rgba(onA ? COBALT_DEEP : SKY, 0.85 * alpha);
    ctx.fillText(sub, x + 16, y + h - 12);
  }
}

export function drawFilm(ctx: CanvasRenderingContext2D, W: number, H: number, st: FilmState, now: number) {
  ctx.save();
  const age = now - st.startedAt;

  // ---- title card (first 3.5 s)
  if (age < 3500) {
    const a = age < 2800 ? 1 : 1 - (age - 2800) / 700;
    ctx.fillStyle = rgba(PAPER_RGB, 0.9 * a);
    ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = rgba(COBALT, 0.9 * a);
    ctx.fillRect(W / 2, 0, W / 2, H);
    ctx.textAlign = 'center';
    ctx.font = `italic 400 84px ${SERIF}`;
    ctx.fillStyle = rgba(COBALT_DEEP, a);
    ctx.fillText('The', W / 2 - 110, H * 0.42);
    ctx.fillStyle = rgba(WHITE, a);
    ctx.fillText('Babel', W / 2 + 120, H * 0.42);
    // Subtitle, drawn twice through a clip so it reads on both grounds.
    ctx.font = `italic 400 26px ${SERIF}`;
    for (const half of ['A', 'B'] as const) {
      ctx.save();
      ctx.beginPath(); ctx.rect(half === 'A' ? 0 : W / 2, 0, W / 2, H); ctx.clip();
      ctx.fillStyle = half === 'A' ? rgba(COBALT_DEEP, a) : rgba(WHITE, a);
      ctx.fillText('A Place Between Us', W / 2, H * 0.48);
      ctx.restore();
    }
    ctx.font = `400 28px ${SERIF}`;
    ctx.fillStyle = rgba(INK, a);
    ctx.fillText(st.prompt.A, W / 4, H * 0.6);
    ctx.fillStyle = rgba(WHITE, a);
    ctx.fillText(st.prompt.B, (W * 3) / 4, H * 0.6);
    ctx.font = `600 14px ${MONO}`;
    ctx.fillStyle = rgba(COBALT_DEEP, a);
    ctx.fillText(`A · ${langName(st.langs.A)}`, W / 4, H * 0.67);
    ctx.fillStyle = rgba(SKY, a);
    ctx.fillText(`B · ${langName(st.langs.B)}`, (W * 3) / 4, H * 0.67);
  }

  // ---- two-sided subtitles (12 s after each message)
  const L = st.last;
  if (L && now - L.at < 12000 && !st.ending) {
    const fadeIn = Math.min(1, (now - L.at) / 300);
    const fadeOut = now - L.at > 10500 ? 1 - (now - L.at - 10500) / 1500 : 1;
    const a = fadeIn * fadeOut;
    const y = H - 182, h = 146, pad = 36, w = W / 2 - pad - 8;
    for (const side of ['A', 'B'] as const) {
      const x = side === 'A' ? pad : W / 2 + 8;
      const speaking = L.speaker === side;
      if (speaking) {
        panel(ctx, x, y, w, h, side, `${side} · ${langName(L.origLang)} · ${INPUT_LABEL[L.inputMode] ?? ''}`, L.original,
          L.replyTo ? `↳ responding to ${L.replyTo.by}: “${[...L.replyTo.text].slice(0, 40).join('')}”` : '', a);
      } else if (L.translation) {
        panel(ctx, x, y, w, h, side, `→ ${side} · ${langName(L.translation.to)} · ${SOURCE_LABEL[L.translation.source]}`, L.translation.text,
          'translations can be wrong — check with each other', a);
      } else {
        panel(ctx, x, y, w, h, side, `${side} · same language`, L.original, '', a * 0.8);
      }
    }
  }

  // ---- key-event ticker (top centre, on the seam, 4.5 s each, at most 3)
  const live = st.ticker.filter((t) => now - t.at < 4500).slice(-3);
  live.forEach((t, i) => {
    const a = Math.min(1, (4500 - (now - t.at)) / 600);
    ctx.font = `600 14px ${MONO}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(t.text).width;
    const y = 36 + i * 30;
    ctx.fillStyle = rgba(LAVENDER, 0.92 * a);
    ctx.fillRect(W / 2 - tw / 2 - 11, y - 18, tw + 22, 26);
    ctx.fillStyle = rgba(WHITE, a);
    ctx.fillText(t.text, W / 2, y);
  });

  // ---- end card
  if (st.ending) {
    const a = Math.min(1, (now - st.ending.at) / 500);
    ctx.fillStyle = rgba(PAPER_RGB, 0.88 * a);
    ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = rgba(COBALT, 0.88 * a);
    ctx.fillRect(W / 2, 0, W / 2, H);
    // Text is drawn twice through a clip: A's ink on the white half, white on the blue half.
    for (const half of ['A', 'B'] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(half === 'A' ? 0 : W / 2, 0, W / 2, H);
      ctx.clip();
      const ink = half === 'A' ? rgba(COBALT_DEEP, a) : rgba(WHITE, a);
      ctx.textAlign = 'center';
      ctx.font = `italic 400 54px ${SERIF}`;
      ctx.fillStyle = ink;
      ctx.fillText('One shared place', W / 2, H * 0.3);
      ctx.font = `500 16px ${MONO}`;
      st.ending.lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.42 + i * 30));
      ctx.font = `500 12px ${MONO}`;
      ctx.fillStyle = half === 'A' ? rgba(INK, 0.75 * a) : rgba(WHITE, 0.8 * a);
      ctx.fillText('Counts of what happened — not a measure of understanding.', W / 2, H * 0.9);
      ctx.restore();
    }
  }
  ctx.restore();
}
