import type { InteractionEvent, ParticipantId, SanctuaryStats, SharedTopic, TextMessage } from '../types';
import type { ArtStats } from '../engine/weavingEngine';
import { langName } from '../lang/languages';
import { conceptLabel, findConcepts, guideCategory } from '../lang/lexicon';
import { WEAVE_FAR, WEAVE_NEAR } from '../analysis/interaction';

/**
 * Communication Portrait — every number here is computed by this module from the session's
 * events and 1 Hz feature summaries. Nothing is produced by a language model. The optional AI
 * narrative is stored separately (`aiSummary`) and labelled as AI-generated.
 */
export interface CommunicationReport {
  title: string;
  prompt: string;
  generatedAt: string;
  durationSec: number;
  sources: { body: string[]; audio: string[]; simulatedBody: boolean; simulatedAudio: boolean; manualVoiceTurns: boolean };
  modalities: { body: boolean; voice: boolean; text: boolean; speech: boolean; userSymbols: boolean };
  participants: Record<ParticipantId, {
    trackedSec: number;
    meanSpeed: number;
    maxSpeed: number;
    movingPct: number;
    messages: number;
    languages: string[];
    dictated: number;
    meanSpeakingRate: number | null;
    armsRaised: number;
  }>;
  audio: {
    analysedSec: number;
    meanLevel: number;
    peakDb: number | null;
    soundPct: number;
    bands: { low: number; mid: number; high: number };
    pitch: { voicedSec: number; meanHz: number | null; minHz: number | null; maxHz: number | null };
    meanOnsetRate: number | null;
    soundSegments: number;
    pauses: { count: number; meanSec: number | null; longestSec: number | null };
    turnsBySpeaker: Record<string, number>;
  };
  between: { meanDistance: number | null; minDistance: number | null; closePct: number; meanWeave: number };
  /** Send & Catch counts — actions taken, not a measure of understanding. */
  exchange: {
    sent: Record<ParticipantId, number>;
    caught: Record<ParticipantId, number>;
    caughtByHand: number;
    caughtByButton: number;
    transformed: Record<ParticipantId, number>;
    transformOps: Record<string, number>;
    returned: Record<ParticipantId, number>;
    placed: number;
    timeouts: number;
    cancelled: number;
    maxHops: number;
    meanCatchWaitSec: number | null;
  };
  sanctuary: SanctuaryStats & { started: number; stagesReached: string[]; completed: number };
  /** What was actually said, with where each piece came from. */
  transcript: {
    id: string; t: number; by: ParticipantId; lang: string; input: string; languageFrom: string; text: string;
    translation: { text: string; to: string; source: string } | null; replyTo: string | null; viaGift: boolean; corrected: boolean;
    readerCheck: string | null;
  }[];
  translationSources: Record<string, number>;
  /** Response relations: an explicit "respond" or words added to a caught gift. */
  responses: {
    total: number;
    by: Record<ParticipantId, number>;
    viaGift: number;
    meanLatencySec: number | null;
    pairs: { from: ParticipantId; to: ParticipantId; replyId: string; toId: string; latencySec: number | null }[];
  };
  /** Two worked Data → Art examples, built only from this session's events and the code's real constants. */
  evidence: {
    body: {
      input: string;
      algorithm: string[];
      session: { weaveStarts: { t: number; handDistance: number }[]; sharedShapes: { t: number; x: number; y: number; rings: number; size: number }[]; closePct: number; minDistance: number | null };
    };
    language: {
      algorithm: string[];
      messages: { id: string; by: ParticipantId; text: string; concepts: { id: string; label: string; category: string | null; element: string | null }[]; keywordSource: string }[];
      topics: { label: string; source: string; at: number; messageIds: string[]; similarity: number }[];
      sanctuaryCategories: string[];
    };
  };
  /** Self-reported by the reader ("I follow" / "unclear"); never measured or inferred. */
  selfReports: { clear: number; unclear: number; byReader: Record<ParticipantId, { clear: number; unclear: number }> };
  contributions: Record<ParticipantId, {
    messages: number;
    voiceClips: number;
    symbolsChosen: number;
    giftsSent: number;
    giftsCaught: number;
    transforms: number;
    sanctuaryShare: number | null;
    wingFeathers: number;
  }>;
  eventCounts: Record<string, number>;
  art: ArtStats;
  topics: { label: string; source: string; similarity: number; at: number }[];
  textSimilarity: { value: number; source: string };
  timeline: { t: number; speedA: number | null; speedB: number | null; level: number | null; distance: number | null }[];
  eventMarks: { t: number; type: string }[];
  mappings: { data: string; rule: string; observed: string }[];
  summary: { zh: string; en: string; source: 'data_template' };
  aiSummary?: { zh: string; en: string; source: 'ai'; provider: string; model: string; generatedAt: string; includedText: boolean };
  limits: string[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function buildReport(input: {
  prompt: string;
  durationSec: number;
  events: InteractionEvent[];
  summaries: InteractionEvent[];
  eventCounts: Record<string, number>;
  art: ArtStats;
  messages: TextMessage[];
  topics: SharedTopic[];
  similarity: { value: number; source: string };
  sanctuary: SanctuaryStats;
}): CommunicationReport {
  const { events, summaries } = input;
  const motion = (id: ParticipantId) => summaries.filter((s) => s.type === 'motion_summary' && s.participantId === id);
  const audioS = summaries.filter((s) => s.type === 'audio_summary');
  const between = summaries.filter((s) => s.type === 'between_summary');

  const participant = (id: ParticipantId) => {
    const m = motion(id);
    const speeds = m.map((s) => num(s.features.speed) ?? 0);
    const msgs = input.messages.filter((x) => x.participantId === id);
    const rates = msgs.map((x) => x.speakingRate).filter((x): x is number => typeof x === 'number');
    return {
      trackedSec: m.length,
      meanSpeed: r2(mean(speeds) ?? 0),
      maxSpeed: r2(speeds.length ? Math.max(...speeds) : 0),
      movingPct: pct(speeds.filter((v) => v > 0.15).length, speeds.length),
      messages: msgs.length,
      languages: [...new Set(msgs.map((x) => langName(x.lang)))],
      dictated: msgs.filter((x) => x.inputMode === 'speech').length,
      meanSpeakingRate: rates.length ? Math.round(mean(rates)!) : null,
      armsRaised: events.filter((e) => e.type === 'arms_raised' && e.participantId === id).length,
    };
  };

  // Pauses = gaps between the end of one sound segment and the start of the next.
  const soundEv = events.filter((e) => e.type === 'sound_start' || e.type === 'sound_end');
  const gaps: number[] = [];
  for (let i = 1; i < soundEv.length; i++) {
    if (soundEv[i - 1].type === 'sound_end' && soundEv[i].type === 'sound_start') gaps.push(soundEv[i].timestamp - soundEv[i - 1].timestamp);
  }
  const turnsBySpeaker: Record<string, number> = {};
  for (const e of events.filter((x) => x.type === 'sound_start')) turnsBySpeaker[e.participantId] = (turnsBySpeaker[e.participantId] ?? 0) + 1;

  const levels = audioS.map((s) => num(s.features.level) ?? 0);
  const dbs = audioS.map((s) => num(s.features.rmsDb)).filter((x): x is number => x !== null);
  const voiced = audioS.map((s) => num(s.features.pitchHz) ?? 0).filter((x) => x > 0);
  const activeOnsets = audioS.filter((s) => s.features.active).map((s) => num(s.features.onsetRate) ?? 0);
  const dists = between.map((s) => num(s.features.handDistance)).filter((x): x is number => x !== null);
  const weaves = between.map((s) => num(s.features.weave) ?? 0);

  // Whole-session timeline from the 1 Hz summaries (≤ 300 points).
  const rows = new Map<number, { t: number; speedA: number | null; speedB: number | null; level: number | null; distance: number | null }>();
  const row = (t: number) => {
    const k = Math.round(t);
    if (!rows.has(k)) rows.set(k, { t: k, speedA: null, speedB: null, level: null, distance: null });
    return rows.get(k)!;
  };
  for (const s of summaries) {
    const rw = row(s.timestamp);
    if (s.type === 'motion_summary') rw[s.participantId === 'A' ? 'speedA' : 'speedB'] = num(s.features.speed);
    if (s.type === 'audio_summary') rw.level = num(s.features.level);
    if (s.type === 'between_summary') rw.distance = num(s.features.handDistance);
  }
  let timeline = [...rows.values()].sort((a, b) => a.t - b.t);
  if (timeline.length > 300) {
    const step = timeline.length / 300;
    timeline = Array.from({ length: 300 }, (_, i) => timeline[Math.floor(i * step)]);
  }
  const markTypes = new Set(['weave_start', 'shared_shape', 'path_cross', 'shared_topic', 'symbol', 'text_message', 'sound_start', 'arms_raised', 'gift_send', 'gift_catch', 'gift_return', 'sanctuary_stage', 'sanctuary_complete']);
  const eventMarks = events.filter((e) => markTypes.has(e.type)).map((e) => ({ t: e.timestamp, type: e.type })).slice(-400);

  const bodySources = [...new Set(events.filter((e) => e.type === 'body_input').map((e) => String(e.features.mode)))];
  const audioSources = [...new Set(events.filter((e) => e.type === 'audio_input').map((e) => String(e.features.mode)).filter((m) => m !== 'off'))];
  const counts = input.eventCounts;
  const userSymbols = events.filter((e) => e.type === 'symbol' && e.features.trigger === 'user').length;

  const A = participant('A'), B = participant('B');
  const audio = {
    analysedSec: audioS.length,
    meanLevel: r2(mean(levels) ?? 0),
    peakDb: dbs.length ? Math.round(Math.max(...dbs)) : null,
    soundPct: pct(audioS.filter((s) => s.features.active).length, audioS.length),
    bands: {
      low: r2(mean(audioS.map((s) => num(s.features.low) ?? 0)) ?? 0),
      mid: r2(mean(audioS.map((s) => num(s.features.mid) ?? 0)) ?? 0),
      high: r2(mean(audioS.map((s) => num(s.features.high) ?? 0)) ?? 0),
    },
    pitch: {
      voicedSec: voiced.length,
      meanHz: voiced.length ? Math.round(mean(voiced)!) : null,
      minHz: voiced.length ? Math.round(Math.min(...voiced)) : null,
      maxHz: voiced.length ? Math.round(Math.max(...voiced)) : null,
    },
    meanOnsetRate: activeOnsets.length ? r2(mean(activeOnsets)!) : null,
    soundSegments: counts.sound_start ?? 0,
    pauses: { count: gaps.length, meanSec: gaps.length ? r2(mean(gaps)!) : null, longestSec: gaps.length ? r2(Math.max(...gaps)) : null },
    turnsBySpeaker,
  };
  const betweenStats = {
    meanDistance: dists.length ? r2(mean(dists)!) : null,
    minDistance: dists.length ? r2(Math.min(...dists)) : null,
    closePct: pct(dists.filter((d) => d < 0.3).length, dists.length),
    meanWeave: r2(mean(weaves) ?? 0),
  };

  // ---- Final sprint: transcript, translation sources, responses, self-reports
  const transcript = input.messages.map((m) => ({
    id: m.id, t: r2(m.timestamp), by: m.participantId, lang: m.lang, input: m.inputMode,
    languageFrom: m.langSource === 'manual' ? 'chosen' : m.langDetectedBy === 'speech_model' ? 'heard by speech model' : 'guessed from text',
    text: m.text,
    translation: m.translation ? { text: m.translation.text, to: m.translation.to, source: m.translation.source } : null,
    replyTo: m.replyTo ?? null, viaGift: !!m.giftId, corrected: !!m.corrected,
    readerCheck: m.check ? `${m.check.value} (self-reported by ${m.check.by})` : null,
  }));
  const translationSources: Record<string, number> = {};
  for (const m of input.messages) {
    const k = m.translation?.source ?? 'none (same language)';
    translationSources[k] = (translationSources[k] ?? 0) + 1;
  }
  const replies = input.messages.filter((m) => m.replyTo);
  const pairs = replies.map((m) => {
    const o = input.messages.find((x) => x.id === m.replyTo);
    return { from: m.participantId, to: (o?.participantId ?? (m.participantId === 'A' ? 'B' : 'A')) as ParticipantId, replyId: m.id, toId: m.replyTo!, latencySec: o ? r2(m.timestamp - o.timestamp) : null };
  });
  const lat = pairs.map((x) => x.latencySec).filter((x): x is number => x !== null);
  const responses = {
    total: replies.length,
    by: { A: replies.filter((m) => m.participantId === 'A').length, B: replies.filter((m) => m.participantId === 'B').length },
    viaGift: replies.filter((m) => m.giftId).length,
    meanLatencySec: lat.length ? r2(mean(lat)!) : null,
    pairs,
  };
  const checks = input.messages.filter((m) => m.check);
  const selfReports = {
    clear: checks.filter((m) => m.check!.value === 'clear').length,
    unclear: checks.filter((m) => m.check!.value === 'unclear').length,
    byReader: (['A', 'B'] as const).reduce((acc, p) => {
      acc[p] = {
        clear: checks.filter((m) => m.check!.by === p && m.check!.value === 'clear').length,
        unclear: checks.filter((m) => m.check!.by === p && m.check!.value === 'unclear').length,
      };
      return acc;
    }, {} as Record<ParticipantId, { clear: number; unclear: number }>),
  };

  // ---- Phase 6: exchange, shared creation, contributions
  const by = (type: string, p: ParticipantId) => events.filter((e) => e.type === type && e.participantId === p).length;
  const catches = events.filter((e) => e.type === 'gift_catch');
  const waits = catches.map((e) => num(e.features.waitSec)).filter((x): x is number => x !== null && x > 0);
  const ops: Record<string, number> = {};
  for (const e of events.filter((x) => x.type === 'gift_transform')) ops[String(e.features.op)] = (ops[String(e.features.op)] ?? 0) + 1;
  const exchange = {
    sent: { A: by('gift_send', 'A'), B: by('gift_send', 'B') },
    caught: { A: by('gift_catch', 'A'), B: by('gift_catch', 'B') },
    caughtByHand: catches.filter((e) => e.features.method === 'hand').length,
    caughtByButton: catches.filter((e) => e.features.method === 'button').length,
    transformed: { A: by('gift_transform', 'A'), B: by('gift_transform', 'B') },
    transformOps: ops,
    returned: { A: by('gift_return', 'A'), B: by('gift_return', 'B') },
    placed: events.filter((e) => e.type === 'gift_place').length,
    timeouts: events.filter((e) => e.type === 'gift_timeout').length,
    cancelled: events.filter((e) => e.type === 'gift_cancel').length,
    maxHops: Math.max(0, ...events.filter((e) => e.type.startsWith('gift_')).map((e) => num(e.features.hops) ?? 0)),
    meanCatchWaitSec: waits.length ? r2(mean(waits)!) : null,
  };
  const sanctEv = events.filter((e) => e.type.startsWith('sanctuary_'));
  const lastShare = [...sanctEv].reverse().find((e) => e.features.shareA !== undefined);
  const sanctuary = {
    ...input.sanctuary,
    started: sanctEv.filter((e) => e.type === 'sanctuary_start').length,
    stagesReached: [...new Set(sanctEv.filter((e) => e.type === 'sanctuary_stage' || e.type === 'sanctuary_complete').map((e) => String(e.features.name)))],
    completed: sanctEv.filter((e) => e.type === 'sanctuary_complete').length,
  };
  const share = (p: ParticipantId) => {
    const eA = input.sanctuary.wing.A.energy, eB = input.sanctuary.wing.B.energy;
    if (eA + eB > 0) return r2((p === 'A' ? eA : eB) / (eA + eB));
    return lastShare ? num(lastShare.features[p === 'A' ? 'shareA' : 'shareB']) : null;
  };
  const contributions = (['A', 'B'] as const).reduce((acc, p) => {
    acc[p] = {
      messages: input.messages.filter((m) => m.participantId === p).length,
      voiceClips: input.messages.filter((m) => m.participantId === p && m.inputMode === 'voice').length,
      symbolsChosen: input.art.userSymbolsBy[p] ?? 0,
      giftsSent: exchange.sent[p] + exchange.returned[p],
      giftsCaught: exchange.caught[p],
      transforms: exchange.transformed[p],
      sanctuaryShare: share(p),
      wingFeathers: input.sanctuary.wing[p].feathers,
    };
    return acc;
  }, {} as CommunicationReport['contributions']);

  const mappings = [
    { data: 'Wrist position & speed (pose or mouse)', rule: 'A: cobalt pen line on white · B: white ribbon on blue; speed → wave amplitude', observed: `mean speed A ${A.meanSpeed} · B ${B.meanSpeed} frame-heights/s` },
    { data: 'Stillness', rule: 'nothing drawn → negative space', observed: `moving ${A.movingPct}% (A) / ${B.movingPct}% (B) of tracked time` },
    { data: 'RMS loudness (shared mic)', rule: 'stroke width ×1–3.2 and brighter ink', observed: audio.analysedSec ? `mean level ${audio.meanLevel}, peak ${audio.peakDb ?? '—'} dBFS` : 'no audio' },
    { data: 'Low / high frequency bands', rule: 'low → sound-ring scale · high → stipple grain', observed: audio.analysedSec ? `low ${audio.bands.low} · mid ${audio.bands.mid} · high ${audio.bands.high}` : 'no audio' },
    { data: 'Pitch (F0) & rhythm', rule: 'pitch → wave tint & finer ripple · onsets/s → ring cadence', observed: audio.pitch.meanHz ? `F0 ${audio.pitch.minHz}–${audio.pitch.maxHz} Hz, ${audio.meanOnsetRate ?? '—'} onsets/s` : 'no voiced audio' },
    { data: 'Silence', rule: 'voice layer slowly dissolves', observed: `${audio.pauses.count} pauses, longest ${audio.pauses.longestSec ?? '—'} s` },
    { data: 'Hand distance < 0.30', rule: 'weave bridge; weave start → shared shape + halo', observed: `close ${betweenStats.closePct}% of time · ${input.art.sharedShapes} shared shapes` },
    { data: 'Trajectory crossings', rule: 'star + registration mark', observed: `${input.art.crossings} crossings` },
    { data: 'Both wrists raised', rule: 'wings unfold at that person', observed: `${A.armsRaised} (A) / ${B.armsRaised} (B)` },
    { data: 'Written / dictated text', rule: 'typography on the writer’s side + translation', observed: `${A.messages + B.messages} messages` },
    { data: 'Shared topics', rule: 'shared motif: flower + topic symbol + bilingual label', observed: `${input.topics.length} topics · ${input.art.motifs} motifs` },
    { data: 'Shared shapes, motifs, symbols', rule: 'white and blue grounds fuse at the centre', observed: `fusion ${Math.round(input.art.fusion * 100)}%` },
    { data: 'Responses', rule: 'a reply is linked to what it answers; replies on a gift become its captions', observed: `${responses.total} responses (A ${responses.by.A} · B ${responses.by.B}), ${responses.viaGift} on gifts` },
    { data: 'Send / Catch / Return', rule: 'a gift flies between people; each catch adds the catcher’s line language', observed: `sent A ${exchange.sent.A} · B ${exchange.sent.B} · caught ${exchange.caught.A + exchange.caught.B} · returned ${exchange.returned.A + exchange.returned.B}` },
    { data: 'Transform', rule: 'rotate · resize · add your texture (A hatching / B halftone)', observed: Object.entries(ops).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none' },
    { data: 'A / B hand height, direction, motion', rule: 'left / right wing of the Shared Sanctuary: spread, aim, feathers, texture', observed: `feathers A ${input.sanctuary.wing.A.feathers} · B ${input.sanctuary.wing.B.feathers}` },
    { data: 'Both moving / moving together', rule: 'the sanctuary’s house, halo and rays grow faster', observed: `growth ${Math.round(input.sanctuary.growth * 100)}% · ${input.sanctuary.coordinatedSec} s coordinated` },
  ];

  // ---- Data → Art evidence (worked examples from this session)
  const ev = (type: string) => events.filter((e) => e.type === type);
  const simBody = bodySources.includes('mouse_sim');
  const evidence: CommunicationReport['evidence'] = {
    body: {
      input: bodySources.length ? bodySources.map((b) => (b === 'pose' ? 'camera → MediaPipe Pose wrists (real)' : 'mouse / touch (SIMULATED body)')).join(' + ') : 'none',
      algorithm: [
        simBody ? 'Hand positions come from the pointer (A) and its mirror (B) — simulated, labelled as such.'
          : 'Wrist landmarks from MediaPipe Pose (2 people) are smoothed with a One Euro filter; identity A/B = nearest previous body centre.',
        'd = smallest distance between an A hand and a B hand, in frame heights (frame = 1600 × 900).',
        `weave = smoothstep((${WEAVE_FAR} − d) / (${WEAVE_FAR} − ${WEAVE_NEAR})), eased over ~0.25 s.`,
        'weave rises above 0.55 → event weave_start → a shared disc (R 30) at the midpoint of the two hands, rotated along A→B: left half A hatching on paper, right half B halftone on cobalt, plus a shared halo.',
        'While weaving: one smaller disc (R 18) every 2.2 s; rings around it = 2 + round(3 × motion synchrony).',
        'Each shared disc raises the fusion of the two grounds by 0.025.',
      ],
      session: {
        weaveStarts: ev('weave_start').slice(0, 5).map((e) => ({ t: r2(e.timestamp), handDistance: num(e.features.handDistance) ?? 0 })),
        sharedShapes: ev('shared_shape').slice(0, 6).map((e) => ({ t: r2(e.timestamp), x: num(e.features.x) ?? 0, y: num(e.features.y) ?? 0, rings: num(e.features.rings) ?? 0, size: num(e.features.size) ?? 0 })),
        closePct: betweenStats.closePct,
        minDistance: betweenStats.minDistance,
      },
    },
    language: {
      algorithm: [
        'Words come from typing, phrase picking, or a voice clip transcribed by the speech model (only with consent).',
        'Concepts: a hand-built lexicon (~38 concepts × zh / en / ja / es) is matched against the text (substring for zh / ja, whole words for en / es). With cloud AI on, AI keywords are stored separately and labelled.',
        'Concept → category → element: HOME → house · HOPE → halo · NATURE → tree · FREEDOM → wings · CONNECTION → bridge. The element enters the writer’s “my elements” and the Sanctuary’s geometry (e.g. HOPE adds a halo ring, NATURE adds trees, CONNECTION adds a bridge).',
        'Shared topic: the same concept appears in both people’s messages within 180 s → a shared motif (flower + the concept’s symbol + bilingual label). Topic overlap = Jaccard similarity of the two concept sets.',
      ],
      messages: input.messages.slice(0, 8).map((m) => ({
        id: m.id, by: m.participantId, text: m.text, keywordSource: m.keywordSource,
        concepts: findConcepts(m.text, m.lang).slice(0, 4).map((c) => {
          const cat = guideCategory(c);
          return { id: c, label: conceptLabel(c, 'en'), category: cat?.id ?? null, element: cat?.element ?? null };
        }),
      })),
      topics: input.topics.map((t) => ({ label: t.label, source: t.source, at: r2(t.timestamp), messageIds: t.messageIds, similarity: r2(t.similarity) })),
      sanctuaryCategories: [...new Set(input.messages.flatMap((m) => findConcepts(m.text, m.lang)).map((c) => guideCategory(c)?.id).filter((x): x is NonNullable<typeof x> => !!x))],
    },
  };

  const report: CommunicationReport = {
    title: 'The Babel — Communication Portrait',
    prompt: input.prompt,
    generatedAt: new Date().toISOString(),
    durationSec: Math.round(input.durationSec),
    sources: {
      body: bodySources,
      audio: audioSources,
      simulatedBody: bodySources.includes('mouse_sim'),
      simulatedAudio: audioSources.includes('audio_sim'),
      manualVoiceTurns: Object.keys(turnsBySpeaker).some((k) => k === 'A' || k === 'B'),
    },
    modalities: {
      body: A.trackedSec + B.trackedSec > 0,
      voice: audio.soundSegments > 0,
      text: input.messages.some((m) => m.inputMode === 'typed'),
      speech: input.messages.some((m) => m.inputMode === 'speech'),
      userSymbols: userSymbols > 0,
    },
    participants: { A, B },
    audio,
    between: betweenStats,
    exchange,
    sanctuary,
    contributions,
    transcript,
    translationSources,
    responses,
    selfReports,
    evidence,
    eventCounts: counts,
    art: input.art,
    topics: input.topics.map((t) => ({ label: t.label, source: t.source, similarity: r2(t.similarity), at: r2(t.timestamp) })),
    textSimilarity: { value: r2(input.similarity.value), source: input.similarity.source },
    timeline,
    eventMarks,
    mappings,
    summary: { zh: '', en: '', source: 'data_template' },
    limits: [
      'Positions are 2D image coordinates; distances are in frame-heights, not metres.',
      'One shared microphone cannot tell speakers apart; per-person voice counts exist only for manual turns.',
      'Text similarity measures shared topics, not agreement or understanding.',
      'Send / Catch / Transform counts and contribution shares describe actions taken; they are not scores of understanding or effort.',
      '"I follow" / "unclear" are what the reader chose to report — not measured understanding. Translations (AI, phrasebook, keyword gloss) can be wrong.',
      'Nothing in this report measures emotion, personality or how well the participants understood each other.',
      'Feature summaries cover at most the last 15 minutes; events at most the last 2000.',
    ],
  };
  report.summary = { zh: templateSummary(report, 'zh'), en: templateSummary(report, 'en'), source: 'data_template' };
  return report;
}

const fmtDur = (s: number, lang: 'zh' | 'en') => {
  const m = Math.floor(s / 60), r = s % 60;
  return lang === 'zh' ? (m ? `${m} 分 ${r} 秒` : `${r} 秒`) : m ? `${m} min ${r} s` : `${r} s`;
};

/** Fill-in-the-blanks summary from computed numbers only (no model involved). */
export function templateSummary(r: CommunicationReport, lang: 'zh' | 'en'): string {
  const A = r.participants.A, B = r.participants.B;
  const langs = [...new Set([...A.languages, ...B.languages])];
  const topics = r.topics.map((t) => t.label);
  const sym = Object.entries(r.art.symbols).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`);
  if (lang === 'zh') {
    const modes = [
      r.modalities.body && `身体动作（${r.sources.simulatedBody && !r.sources.body.includes('pose') ? '鼠标模拟' : '摄像头'}）`,
      r.modalities.voice && `共享声音（${r.sources.simulatedAudio && !r.sources.audio.includes('mic') ? '模拟音频' : '麦克风'}）`,
      (r.modalities.text || r.modalities.speech) && `文字${langs.length ? `（${langs.join('、')}）` : ''}`,
      r.modalities.userSymbols && '主动选择的符号',
    ].filter(Boolean);
    return [
      `本次会话时长 ${fmtDur(r.durationSec, 'zh')}，使用了${modes.length ? modes.join('、') : '较少的交流方式'}。`,
      r.between.meanDistance !== null ? `两人的手在 ${r.between.closePct}% 的时间里处于交织距离内，形成 ${r.art.sharedShapes} 个共享图形，轨迹交叉 ${r.art.crossings} 次。` : '',
      r.audio.analysedSec ? `声音出现在 ${r.audio.soundPct}% 的时间里，共 ${r.audio.soundSegments} 段，${r.audio.pauses.count} 次停顿${r.audio.pitch.meanHz ? `，平均音高约 ${r.audio.pitch.meanHz} Hz` : ''}；这些特征改变了线条粗细、声波环和颗粒。` : '',
      A.messages + B.messages ? `共提交 ${A.messages + B.messages} 条文字（A ${A.messages} 条，B ${B.messages} 条）${topics.length ? `，出现共同主题：${topics.join('、')}，并生成了共享图案` : ''}。` : '',
      sym.length ? `画面中出现的符号：${sym.join('、')}。` : '',
      r.transcript.length ? `翻译来源：${Object.entries(r.translationSources).map(([k, n]) => `${({ ai: 'AI 翻译', phrasebook: '预翻译短语', demo_gloss: '关键词对照', manual: '人工修改' } as Record<string, string>)[k] ?? '同语言'} ${n}`).join('、')}。` : '',
      r.responses.total ? `共有 ${r.responses.total} 次回应（A ${r.responses.by.A}，B ${r.responses.by.B}）${r.responses.meanLatencySec !== null ? `，平均间隔 ${r.responses.meanLatencySec} 秒` : ''}。` : '',
      r.selfReports.clear + r.selfReports.unclear ? `读者自评“看懂”${r.selfReports.clear} 次、“不清楚”${r.selfReports.unclear} 次（自我报告，并非测量）。` : '',
      r.exchange.sent.A + r.exchange.sent.B ? `双方互相传递了 ${r.exchange.sent.A + r.exchange.sent.B} 个符号（A ${r.exchange.sent.A}，B ${r.exchange.sent.B}），接住 ${r.exchange.caught.A + r.exchange.caught.B} 个，改变 ${r.exchange.transformed.A + r.exchange.transformed.B} 次，传回 ${r.exchange.returned.A + r.exchange.returned.B} 次。` : '',
      r.sanctuary.started ? `共同建造的圣所完成度 ${Math.round(r.sanctuary.growth * 100)}%（左翼 ${r.sanctuary.wing.A.feathers} 根羽毛，右翼 ${r.sanctuary.wing.B.feathers} 根）。` : '',
      `白色与蓝色两个底面在中央融合了 ${Math.round(r.art.fusion * 100)}%。以上内容由程序根据测量数据生成，不代表对情绪或理解程度的判断。`,
    ].filter(Boolean).join('');
  }
  const modes = [
    r.modalities.body && `body movement (${r.sources.simulatedBody && !r.sources.body.includes('pose') ? 'mouse simulation' : 'camera'})`,
    r.modalities.voice && `shared voice (${r.sources.simulatedAudio && !r.sources.audio.includes('mic') ? 'simulated audio' : 'microphone'})`,
    (r.modalities.text || r.modalities.speech) && `written text${langs.length ? ` (${langs.join(', ')})` : ''}`,
    r.modalities.userSymbols && 'chosen symbols',
  ].filter(Boolean);
  return [
    `This ${fmtDur(r.durationSec, 'en')} session used ${modes.length ? modes.join(', ') : 'few channels'}.`,
    r.between.meanDistance !== null ? ` Hands were within weaving distance ${r.between.closePct}% of the time, making ${r.art.sharedShapes} shared shapes; paths crossed ${r.art.crossings} times.` : '',
    r.audio.analysedSec ? ` Sound was present ${r.audio.soundPct}% of the time in ${r.audio.soundSegments} segments with ${r.audio.pauses.count} pauses${r.audio.pitch.meanHz ? `, mean pitch about ${r.audio.pitch.meanHz} Hz` : ''}; these features set line width, sound rings and grain.` : '',
    A.messages + B.messages ? ` ${A.messages + B.messages} messages were written (A ${A.messages}, B ${B.messages})${topics.length ? `; shared topics — ${topics.join(', ')} — became shared motifs` : ''}.` : '',
    sym.length ? ` Symbols on the canvas: ${sym.join(', ')}.` : '',
    r.transcript.length ? ` Translations came from: ${Object.entries(r.translationSources).map(([k, n]) => `${({ ai: 'AI', phrasebook: 'phrasebook', demo_gloss: 'keyword gloss', manual: 'human edit' } as Record<string, string>)[k] ?? 'same language'} ${n}`).join(', ')}.` : '',
    r.responses.total ? ` There were ${r.responses.total} responses (A ${r.responses.by.A}, B ${r.responses.by.B})${r.responses.meanLatencySec !== null ? `, on average ${r.responses.meanLatencySec} s after the message` : ''}.` : '',
    r.selfReports.clear + r.selfReports.unclear ? ` Readers self-reported "I follow" ${r.selfReports.clear} times and "unclear" ${r.selfReports.unclear} times (self-reported, not measured).` : '',
    r.exchange.sent.A + r.exchange.sent.B ? ` ${r.exchange.sent.A + r.exchange.sent.B} symbols were sent between them (A ${r.exchange.sent.A}, B ${r.exchange.sent.B}); ${r.exchange.caught.A + r.exchange.caught.B} were caught, ${r.exchange.transformed.A + r.exchange.transformed.B} transformations made, ${r.exchange.returned.A + r.exchange.returned.B} sent back.` : '',
    r.sanctuary.started ? ` The Shared Sanctuary reached ${Math.round(r.sanctuary.growth * 100)}% (left wing ${r.sanctuary.wing.A.feathers} feathers, right wing ${r.sanctuary.wing.B.feathers}).` : '',
    ` The white and blue grounds fused ${Math.round(r.art.fusion * 100)}% at the centre. Generated from measured data by the program; it does not judge emotions or understanding.`,
  ].filter(Boolean).join('');
}

/** Numbers-only payload for the AI narrative (no raw media; text only if both agreed). */
export function aiSummaryInput(r: CommunicationReport) {
  const { timeline, eventMarks, summary, aiSummary, ...rest } = r;
  void timeline; void eventMarks; void summary; void aiSummary;
  return rest;
}

