import { COBALT, INK, LAVENDER, PAPER_RGB, rgba, SKY, WHITE, type RGB } from './palette';
import type { AudioFeatures, BodySource, ParticipantId, SpeakerMode, Vec2 } from '../types';

export interface MarksInput {
  W: number;
  H: number;
  time: number;
  audio: AudioFeatures;
  bodySource: BodySource;
  speaker: SpeakerMode;
  glyphs: string;
  hands: { id: ParticipantId; hand: 0 | 1; x: number; y: number }[];
  best: [Vec2, Vec2] | null;
  handDistance: number | null;
  weave: number;
}

/** One character per event type, written into the top-left "signal string". */
export function eventGlyph(type: string): string {
  const map: Record<string, string> = {
    weave_start: '<>', weave_end: '>', shared_shape: '@', path_cross: 'x', approach: '>>',
    sound_start: '^', sound_end: '.', silence: '_', voice_motion_start: '*',
    simultaneous_motion_start: '=', participant_enter: '+', participant_leave: '-',
    pause: '|', resume: '|', canvas_reset: '#', text_message: '¶', shared_topic: '✳', symbol: '†', arms_raised: 'Y',
  };
  return map[type] ?? '';
}

const MONO = '500 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Technical-drawing data marks: axes, hand coordinates, distance callout, RMS scale, spectrum,
 * event glyph string and source stamps (SIMULATED is always shown). Navy on the white ground,
 * white on the blue ground, with a halo. Live and optional in export — never recorded to video.
 */
export function drawSignalMarks(ctx: CanvasRenderingContext2D, m: MarksInput) {
  const { W, H, audio } = m;
  const onBlue = (x: number) => x >= W / 2;
  const ink = (x: number): RGB => (onBlue(x) ? WHITE : INK);
  const halo = (x: number): RGB => (onBlue(x) ? COBALT : PAPER_RGB);
  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left', a = 0.85) => {
    ctx.textAlign = align;
    ctx.strokeStyle = rgba(halo(x), 0.9);
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = rgba(ink(x), a);
    ctx.fillText(text, x, y);
  };

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = MONO;
  ctx.textBaseline = 'middle';

  // Axes with ticks (sky reads on both grounds).
  ctx.strokeStyle = rgba(SKY, 0.6);
  ctx.lineWidth = 0.7;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(40, H / 2); ctx.lineTo(W - 40, H / 2);
  ctx.moveTo(W / 2, 40); ctx.lineTo(W / 2, H - 40);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i <= 20; i++) {
    const x = 80 + (i / 20) * (W - 160);
    const tall = i % 5 === 0 ? 7 : 3;
    ctx.strokeStyle = rgba(ink(x), 0.45);
    ctx.beginPath(); ctx.moveTo(x, H / 2 - tall); ctx.lineTo(x, H / 2 + tall); ctx.stroke();
  }
  for (const [x, y] of [[28, 28], [W - 28, 28], [28, H - 28], [W - 28, H - 28]]) {
    ctx.strokeStyle = rgba(ink(x), 0.6);
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
  }

  // Event glyph string (top-left), built from real events.
  ctx.font = '600 14px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  label('>>>> ' + (m.glyphs || '_'), 48, 52);
  ctx.font = MONO;
  label(`T+${m.time.toFixed(1).padStart(6, '0')}`, 48, 72, 'left', 0.55);

  for (const h of m.hands) {
    label(`${h.id}${h.hand ? 'R' : 'L'} [${(h.x / W).toFixed(2)},${(h.y / H).toFixed(2)}]`, h.x + 16, h.y + 20, 'left', 0.8);
  }

  if (m.best && m.handDistance !== null && m.handDistance < 0.6) {
    const [a, b] = m.best;
    ctx.strokeStyle = rgba(LAVENDER, 0.6 + 0.4 * m.weave);
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    label(`d=${m.handDistance.toFixed(2)}`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 14, 'center');
  }

  // Vertical RMS scale (right edge, on blue).
  const sx = W - 56, top = H * 0.2, bot = H * 0.8;
  ctx.strokeStyle = rgba(WHITE, 0.6);
  ctx.beginPath(); ctx.moveTo(sx, bot); ctx.lineTo(sx, top - 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx - 4, top - 8); ctx.lineTo(sx, top - 14); ctx.lineTo(sx + 4, top - 8); ctx.stroke();
  for (let i = 0; i <= 10; i++) {
    const y = bot - (i / 10) * (bot - top);
    ctx.beginPath(); ctx.moveTo(sx - (i % 5 ? 3 : 7), y); ctx.lineTo(sx, y); ctx.stroke();
  }
  if (audio.source !== 'off') {
    const y = bot - audio.level * (bot - top);
    ctx.fillStyle = rgba(WHITE, 0.95);
    ctx.beginPath(); ctx.moveTo(sx + 3, y); ctx.lineTo(sx + 11, y - 5); ctx.lineTo(sx + 11, y + 5); ctx.closePath(); ctx.fill();
    label(`RMS ${audio.db.toFixed(0)}dB`, sx - 10, bot + 18, 'right');
    if (audio.pitchHz > 0) label(`F0 ${audio.pitchHz.toFixed(0)}Hz`, sx - 10, bot + 34, 'right', 0.7);

    const bx = W / 2 + 80; // right of centre, clear of the export caption
    for (let i = 0; i < 32; i++) {
      const h = audio.spectrum[i] * 26;
      ctx.fillStyle = rgba(i < 8 ? WHITE : i < 20 ? SKY : LAVENDER, 0.75);
      ctx.fillRect(bx + i * 10, H - 40 - h, 2, h);
    }
    label('LOW', bx, H - 28, 'left', 0.6);
    label('HIGH', bx + 320, H - 28, 'right', 0.6);
  }

  // Source stamps (top-right, on blue). Simulated sources and manual turns are always labelled.
  const stamps: string[] = [m.bodySource === 'mouse_sim' ? 'BODY: SIMULATED (MOUSE/TOUCH)' : 'BODY: CAMERA POSE'];
  if (audio.source === 'audio_sim') stamps.push('AUDIO: SIMULATED');
  else if (audio.source === 'mic') stamps.push('AUDIO: SHARED MIC');
  if (audio.source !== 'off' && m.speaker !== 'shared') stamps.push(`VOICE: ${m.speaker} (MANUAL TURN)`);
  stamps.forEach((s, i) => {
    const y = 52 + i * 24;
    const w = ctx.measureText(s).width + 16;
    const sim = s.includes('SIMULATED') || s.includes('MANUAL');
    ctx.strokeStyle = rgba(sim ? LAVENDER : WHITE, 0.95);
    ctx.lineWidth = 1;
    ctx.strokeRect(W - 48 - w, y - 10, w, 20);
    if (sim) {
      ctx.fillStyle = rgba(LAVENDER, 0.35);
      ctx.fillRect(W - 48 - w, y - 10, w, 20);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(WHITE, 0.95);
    ctx.fillText(s, W - 56, y);
  });
  ctx.restore();
}
