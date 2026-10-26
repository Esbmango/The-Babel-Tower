import { useCallback, useEffect, useRef, useState } from 'react';
import { WeavingEngine, W, H } from './engine/weavingEngine';
import { EventLog } from './engine/events';
import { PALETTE } from './engine/palette';
import { PoseTracker } from './tracking/poseTracker';
import { PoseInput } from './tracking/poseInput';
import { PointerSim, type PartnerMode } from './input/pointerSim';
import { MicAnalyzer } from './audio/micAnalyzer';
import { AudioSim } from './audio/audioSim';
import { Conversation } from './lang/conversation';
import { speechSupported } from './lang/speech';
import { aiStatus, aiSummary, aiTranscribe, type AiStatus } from './ai/client';
import { VoiceClip } from './lang/voiceClip';
import { conceptLabel, conceptMotif, findConcepts, guideCategory } from './lang/lexicon';
import { detectLang, langName } from './lang/languages';
import { GuideStrip, GUIDE_STEPS } from './ui/GuideStrip';
import { ArtRecorder, pickVideoMime, videoExt } from './export/recorder';
import { aiSummaryInput, buildReport } from './report/report';
import { ConsentScreen, type StartAudio, type StartOptions } from './ui/ConsentScreen';
import { DataPanel } from './ui/DataPanel';
import { ConfirmModal } from './ui/ConfirmModal';
import { SaveModal } from './ui/SaveModal';
import { ConversationBar, FlowSteps, type FlowState, type GiftAction, type VoiceUi } from './ui/ConversationBar';
import { SubtitleBridge, PROMPT_IN } from './ui/SubtitleBridge';
import { drawFilm, type FilmState } from './export/film';
import { ResultScreen, fixWebmDuration, type ResultData } from './ui/ResultScreen';
import {
  emptyTargets, silentAudio,
  type EngineStats, type GiftSnapshot, type InteractionEvent, type LangCode, type ParticipantId, type SanctuaryStats, type SpeakerMode,
  type SymbolKind, type TextMessage, type TimelineSample, type TrayItem,
} from './types';

const PROMPT = 'What makes you feel at home?';
const params = new URLSearchParams(window.location.search);
const POSE_FPS = Math.min(30, Math.max(5, Number(params.get('posefps')) || 15));
const MODEL: 'lite' | 'full' = params.get('model') === 'full' ? 'full' : 'lite';
const VIDEO_MIME = pickVideoMime();

type Body = 'camera' | 'sim';
type Modal = null | 'save' | 'reset' | 'camera-consent' | 'mic-consent' | 'video-preview';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export default function App() {
  const [phase, setPhase] = useState<'consent' | 'running'>('consent');
  const [body, setBody] = useState<Body>('sim');
  const [audioMode, setAudioMode] = useState<StartAudio>('off');
  const [consent, setConsent] = useState({ camera: false, mic: false, ai: false, speech: false, voice: false });
  const [trays, setTrays] = useState<Record<ParticipantId, TrayItem[]>>({ A: [], B: [] });
  const [gifts, setGifts] = useState<GiftSnapshot[]>([]);
  const [sanct, setSanct] = useState<SanctuaryStats | null>(null);
  const [guided, setGuided] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [guideProgress, setGuideProgress] = useState('');
  const [presenting, setPresenting] = useState(false);
  const [showControlsHint, setShowControlsHint] = useState(false);
  const [voice, setVoice] = useState<VoiceUi>({ mode: 'none', active: null, phase: 'idle', elapsed: 0, draft: { A: null, B: null } });
  const [langs, setLangs] = useState<Record<ParticipantId, LangCode>>({ A: 'zh', B: 'en' });
  const [ai, setAi] = useState<AiStatus>({ available: false, reason: 'checking' });
  const [speaker, setSpeaker] = useState<SpeakerMode>('shared');
  const [bodyStatus, setBodyStatus] = useState('');
  const [micStatus, setMicStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Record<ParticipantId, string | null>>({ A: null, B: null });
  const [hideUI, setHideUI] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [partner, setPartner] = useState<PartnerMode>('mirror');
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [recent, setRecent] = useState<InteractionEvent[]>([]);
  const [timeline, setTimeline] = useState<{ samples: TimelineSample[]; events: InteractionEvent[] }>({ samples: [], events: [] });
  const [bodyLabel, setBodyLabel] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [, setConvTick] = useState(0);
  const [rec, setRec] = useState({ on: false, elapsed: 0 });
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [finishing, setFinishing] = useState(false);
  const inputsActive = phase === 'running' && !result && !finishing;
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WeavingEngine | null>(null);
  const eventsRef = useRef(new EventLog());
  const langsRef = useRef(langs);
  const convRef = useRef(new Conversation(eventsRef.current, () => langsRef.current));
  const recorderRef = useRef<ArtRecorder | null>(null);
  const autoRecordRef = useRef(false);
  const trackerRef = useRef<PoseTracker | null>(null);
  const inferMsRef = useRef(0);
  const simRef = useRef<PointerSim | null>(null);
  const audioSimRef = useRef<AudioSim | null>(null);
  const partnerRef = useRef<PartnerMode>('mirror');
  const blobsRef = useRef<{ art: Blob | null; marks: Blob | null }>({ art: null, marks: null });
  const traysRef = useRef<Record<ParticipantId, TrayItem[]>>({ A: [], B: [] });
  const traySeq = useRef(0);
  const clipRef = useRef<VoiceClip | null>(null);
  const speakerBeforeVoice = useRef<SpeakerMode>('shared');
  const voiceOwner = useRef<ParticipantId | null>(null);
  const voiceRequest = useRef<AbortController | null>(null);
  const summaryGeneration = useRef(0);
  const videoUrlRef = useRef<string | null>(null);
  const resultUrlsRef = useRef<string[]>([]);
  const guideRef = useRef({ guided: false, step: 0, since: 0 });
  const replyRef = useRef<Record<ParticipantId, { replyTo?: string; giftId?: string }>>({ A: {}, B: {} });
  const filmMsgId = useRef<string | null>(null);
  const filmRef = useRef<FilmState>({ startedAt: 0, prompt: { A: PROMPT_IN.zh, B: PROMPT_IN.en }, langs: { A: 'zh', B: 'en' }, last: null, ticker: [], ending: null });

  /** Add an element a person made to their tray (what they can send). Newest last, at most 8. */
  const addTray = useCallback((p: ParticipantId, kind: SymbolKind, label: string, source: TrayItem['source'], words?: { text: string; lang: LangCode; messageId: string }) => {
    const list = traysRef.current[p].filter((t) => !(t.kind === kind && t.label === label));
    list.push({ id: `t${++traySeq.current}`, kind, label, source, ...(words ?? {}) });
    traysRef.current = { ...traysRef.current, [p]: list.slice(-8) };
    setTrays(traysRef.current);
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const cancelVoice = useCallback(() => {
    if (clipRef.current?.recording) setSpeaker(speakerBeforeVoice.current);
    voiceOwner.current = null;
    voiceRequest.current?.abort();
    voiceRequest.current = null;
    void clipRef.current?.stop();
    clipRef.current = null;
    setVoice((v) => ({ ...v, active: null, phase: 'idle', draft: { A: null, B: null } }));
  }, []);

  useEffect(() => () => {
    convRef.current.cancelPending();
    voiceRequest.current?.abort();
    void clipRef.current?.stop();
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    resultUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => { void aiStatus().then(setAi); }, []);
  useEffect(() => { langsRef.current = langs; }, [langs]);

  // Fit the fixed 16:9 art frame into whatever space the UI leaves (never stretched, never covered).
  useEffect(() => {
    if (phase !== 'running' || !wrapRef.current) return;
    const el = wrapRef.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const pad = hideUI ? 0 : 18;
      const aw = Math.max(1, r.width - pad * 2), ah = Math.max(1, r.height - pad * 2);
      const w = Math.min(aw, (ah * W) / H);
      setFrame({ w: Math.floor(w), h: Math.floor((w * H) / W) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, hideUI, showPanel]);

  // Engine + conversation + recorder lifetime = running phase.
  useEffect(() => {
    if (phase !== 'running' || !canvasRef.current) return;
    const engine = new WeavingEngine(canvasRef.current, eventsRef.current);
    engineRef.current = engine;
    engine.start();
    if (params.has('debug')) (window as unknown as { __babel?: WeavingEngine }).__babel = engine; // test hook only
    const conv = convRef.current;
    conv.onMessage = (m) => {
      engine.addText(m);
      // Words become elements: recognised concepts map to HOME / HOPE / NATURE / FREEDOM / CONNECTION elements.
      // The first element carries the actual words, so sending it sends the sentence (and its translation) too.
      const concepts = m.keywordSource === 'local_lexicon' ? m.keywords : findConcepts(m.text, m.lang);
      const words = { text: m.text, lang: m.lang, messageId: m.id };
      const src = m.inputMode === 'typed' ? 'text' : 'voice';
      if (!m.giftId) {
        concepts.slice(0, 3).forEach((c, i) => {
          const cat = guideCategory(c);
          if (cat) engine.sanctuary.categories.add(cat.id);
          addTray(m.participantId, cat?.element ?? conceptMotif(c), conceptLabel(c, m.lang), src, i === 0 ? words : undefined);
        });
        if (!concepts.length) addTray(m.participantId, 'star', [...m.text].slice(0, 8).join(''), src, words);
      } else {
        for (const c of concepts.slice(0, 3)) { const cat = guideCategory(c); if (cat) engine.sanctuary.categories.add(cat.id); }
      }
      // Story Film subtitles.
      const replied = m.replyTo ? conv.messages.find((x) => x.id === m.replyTo) : undefined;
      filmMsgId.current = m.id;
      filmRef.current.last = {
        speaker: m.participantId, original: m.text, origLang: m.lang, inputMode: m.inputMode, translation: m.translation,
        replyTo: replied ? { by: replied.participantId, text: replied.text } : undefined, at: performance.now(),
      };
    };
    conv.onCorrected = (m) => {
      engine.addCorrection(m);
      const last = filmRef.current.last;
      if (last && filmMsgId.current === m.id) {
        last.origLang = m.lang;
        last.translation = m.translation;
      }
    };
    conv.onTranslation = (m) => {
      engine.addTranslation(m);
      const L = filmRef.current.last;
      if (L && filmMsgId.current === m.id) L.translation = m.translation; // update in place: no restart of the subtitle timer
    };
    // Story Film ticker: key interaction events, as plain words.
    const TICK: Record<string, (e: InteractionEvent) => string> = {
      gift_send: (e) => `${e.participantId} sent ${String(e.features.kind)} → ${String(e.features.to)}`,
      gift_catch: (e) => `${e.participantId} caught it${e.features.how === 'hand' ? ' by hand' : ''}`,
      gift_transform: (e) => `${e.participantId} changed the gift · ${String(e.features.op)}`,
      gift_respond: (e) => `${e.participantId} answered on the gift`,
      gift_return: (e) => `${e.participantId} sent it back`,
      gift_place: (e) => `${e.participantId} placed it in the artwork`,
      respond: (e) => `${e.participantId} responded`,
      shared_topic: (e) => `shared topic · ${String(e.features.topic ?? '')}${e.source === 'ai' ? ' (AI)' : ''}`,
      weave_start: () => 'hands met — weaving',
      sanctuary_stage: (e) => `sanctuary · ${String(e.features.name ?? '')}`,
      sanctuary_complete: () => 'sanctuary complete',
      understanding_check: (e) => `${e.participantId}: ${e.features.value === 'clear' ? '“I follow”' : '“unclear”'} (self-report)`,
    };
    eventsRef.current.onPush = (e) => {
      const f = TICK[e.type];
      if (!f) return;
      const tk = filmRef.current.ticker;
      tk.push({ text: f(e), at: performance.now() });
      if (tk.length > 12) tk.shift();
    };
    engine.filmOverlay = (ctx, w, h) => drawFilm(ctx, w, h, filmRef.current, performance.now());
    conv.onTopic = (t, motif, labelZh) => {
      engine.addMotif(t, motif, labelZh);
      const c = findConcepts(t.label, 'en')[0];
      const cat = c ? guideCategory(c) : null;
      if (cat) engine.sanctuary.categories.add(cat.id);
      const kind = cat?.element ?? motif;
      addTray('A', kind, t.label, 'topic');
      addTray('B', kind, t.label, 'topic');
    };
    conv.onChange = () => setConvTick((n) => n + 1);
    const recorder = new ArtRecorder(engine);
    recorderRef.current = recorder;
    recorder.onAutoStop = () => void stopRecording(true);
    if (autoRecordRef.current) {
      if (recorder.start()) { filmRef.current.startedAt = performance.now(); setRec({ on: true, elapsed: 0 }); }
      else setError('Story Film recording could not start. PNG and JSON exports remain available.');
    }
    return () => {
      eventsRef.current.onPush = null;
      void recorder.stop();
      recorderRef.current = null;
      engine.stop();
      engineRef.current = null;
    };
  }, [phase]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.showMarks = showMarks;
  }, [showMarks, phase]);
  useEffect(() => {
    if (engineRef.current) engineRef.current.speakerMode = speaker;
    if (phase === 'running') eventsRef.current.push({ type: 'voice_turn', participantId: 'system', source: 'user', features: { speaker } });
  }, [speaker, phase]);
  useEffect(() => {
    convRef.current.aiEnabled = consent.ai && ai.available;
  }, [consent.ai, ai.available]);

  // ---------------------------------------------------------------- body input (camera pose / mouse sim)
  useEffect(() => {
    if (!inputsActive) return;
    const engine = engineRef.current, canvas = canvasRef.current, video = videoRef.current;
    if (!engine || !canvas || !video) return;
    const events = eventsRef.current;
    events.push({ type: 'body_input', participantId: 'system', source: 'system', features: { mode: body === 'camera' ? 'pose' : 'mouse_sim' } });

    if (body === 'sim') {
      const sim = new PointerSim();
      sim.partnerMode = partnerRef.current;
      sim.attach(canvas);
      simRef.current = sim;
      engine.bodySource = 'mouse_sim';
      engine.targetProvider = (now) => sim.compute(now);
      setBodyLabel('mouse / touch · SIMULATED');
      return () => {
        sim.detach();
        simRef.current = null;
        engine.targetProvider = () => emptyTargets();
      };
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let tracker: PoseTracker | null = null;
    const poseInput = new PoseInput();
    engine.bodySource = 'pose';
    engine.targetProvider = () => poseInput.targets;
    setBodyLabel('camera starting…');

    const drawPreview = () => {
      const pc = previewRef.current;
      if (!pc) return;
      const g = pc.getContext('2d')!;
      const PW = pc.width, PH = pc.height;
      g.save();
      g.translate(PW, 0);
      g.scale(-1, 1);
      g.filter = 'grayscale(1) contrast(1.1)';
      g.drawImage(video, 0, 0, PW, PH);
      g.restore();
      g.fillStyle = 'rgba(36,64,230,0.18)';
      g.fillRect(0, 0, PW, PH);
      for (const id of ['A', 'B'] as const) {
        const lm = poseInput.landmarksFor(id);
        if (!lm) continue;
        g.strokeStyle = g.fillStyle = id === 'A' ? '#ffffff' : PALETTE.B.css;
        g.lineWidth = 1.5;
        for (const [i, j] of BONES) {
          if ((lm[i]?.visibility ?? 0) < 0.3 || (lm[j]?.visibility ?? 0) < 0.3) continue;
          g.beginPath();
          g.moveTo((1 - lm[i].x) * PW, lm[i].y * PH);
          g.lineTo((1 - lm[j].x) * PW, lm[j].y * PH);
          g.stroke();
        }
        for (const w of [15, 16]) {
          if ((lm[w]?.visibility ?? 0) < 0.35) continue;
          g.beginPath();
          g.arc((1 - lm[w].x) * PW, lm[w].y * PH, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    };

    (async () => {
      try {
        setBodyStatus('Requesting camera…');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        tracker = new PoseTracker(POSE_FPS, MODEL);
        trackerRef.current = tracker;
        await tracker.init(setBodyStatus);
        if (cancelled) { tracker.dispose(); return; }
        tracker.start(video, (r) => {
          inferMsRef.current = r.inferenceMs;
          poseInput.update(r.poses, r.t);
          drawPreview();
        });
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        const name = (err as Error)?.name;
        const msg =
          name === 'NotAllowedError' ? 'Camera permission was denied.'
            : name === 'NotFoundError' ? 'No camera was found.'
              : `Pose tracking could not start (${(err as Error)?.message ?? err}).`;
        setBodyStatus('');
        setError(`${msg} Switched to mouse / touch mode.`);
        events.push({ type: 'camera_error', participantId: 'system', source: 'system', features: { reason: name ?? 'unknown' } });
        setBody('sim');
      }
    })();

    return () => {
      cancelled = true;
      tracker?.dispose();
      if (trackerRef.current === tracker) trackerRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      engine.targetProvider = () => emptyTargets();
      setBodyStatus('');
    };
  }, [inputsActive, body]);

  // ---------------------------------------------------------------- sound input (shared mic / simulation / off)
  useEffect(() => {
    if (!inputsActive) return;
    const engine = engineRef.current;
    if (!engine) return;
    const events = eventsRef.current;
    const source = audioMode === 'mic' ? 'mic' : audioMode === 'sim' ? 'audio_sim' : 'off';
    events.push({ type: 'audio_input', participantId: 'system', source: 'system', features: { mode: source } });

    if (audioMode === 'off') {
      const off = silentAudio('off');
      engine.audioProvider = () => off;
      return;
    }
    if (audioMode === 'sim') {
      const sim = new AudioSim();
      audioSimRef.current = sim;
      engine.audioProvider = (dt) => sim.update(dt);
      return () => { audioSimRef.current = null; engine.audioProvider = () => silentAudio('off'); };
    }

    let cancelled = false;
    const mic = new MicAnalyzer();
    const idle = silentAudio('mic');
    engine.audioProvider = (dt) => (mic.running ? mic.update(dt) : idle);
    setMicStatus('Requesting microphone…');
    mic.start().then(
      () => {
        if (cancelled) { mic.stop(); return; }
        setMicStatus('');
      },
      (err) => {
        if (cancelled) return;
        console.error(err);
        const name = (err as Error)?.name;
        setMicStatus('');
        setError(`${name === 'NotAllowedError' ? 'Microphone permission was denied.' : name === 'NotFoundError' ? 'No microphone was found.' : 'The microphone could not start.'} Drawing continues without sound.`);
        events.push({ type: 'mic_error', participantId: 'system', source: 'system', features: { reason: name ?? 'unknown' } });
        setAudioMode('off');
      },
    );
    return () => {
      cancelled = true;
      mic.stop();
      engine.audioProvider = () => silentAudio('off');
      setMicStatus('');
    };
  }, [inputsActive, audioMode]);

  useEffect(() => {
    partnerRef.current = partner;
    if (simRef.current) simRef.current.partnerMode = partner;
  }, [partner]);

  // Data view refresh at 5 Hz (keeps React out of the 60 fps loop).
  useEffect(() => {
    if (!inputsActive) return;
    const id = window.setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const log = eventsRef.current;
      setStats(e.getStats());
      setGifts(e.gifts.snapshot());
      const ss = e.sanctuaryStats();
      setSanct(ss);
      if (clipRef.current?.recording) setVoice((v) => ({ ...v, elapsed: clipRef.current?.elapsed ?? 0 }));
      // Guided experience: advance when the step's condition is met (never forced — Next / Free canvas always work).
      const g = guideRef.current;
      if (g.guided) {
        const evs = log.exportData().events;
        const n = (type: string, p?: ParticipantId) => evs.filter((x) => x.type === type && (!p || x.participantId === p)).length;
        const msgs = (p: ParticipantId) => convRef.current.messages.filter((m) => m.participantId === p).length;
        let done = false, prog = '';
        const step = GUIDE_STEPS[g.step]?.id;
        if (step === 'answer') { prog = `A ${msgs('A') ? '✓' : '…'} · B ${msgs('B') ? '✓' : '…'}`; done = msgs('A') > 0 && msgs('B') > 0; }
        else if (step === 'elements') { prog = `A ${traysRef.current.A.length} · B ${traysRef.current.B.length} elements`; done = traysRef.current.A.length > 0 && traysRef.current.B.length > 0 && performance.now() - g.since > 6000; }
        else if (step === 'send') { prog = `caught: A ${n('gift_catch', 'A')} · B ${n('gift_catch', 'B')}`; done = n('gift_catch', 'A') > 0 && n('gift_catch', 'B') > 0; }
        else if (step === 'transform') { prog = `transforms: A ${n('gift_transform', 'A')} · B ${n('gift_transform', 'B')} · returned ${n('gift_return')}`; done = n('gift_transform', 'A') > 0 && n('gift_transform', 'B') > 0; }
        else if (step === 'sanctuary') { prog = `${Math.round(ss.growth * 100)}% · ${ss.stageName} · feathers A ${ss.wing.A.feathers} / B ${ss.wing.B.feathers}`; done = ss.growth >= 0.86; }
        setGuideProgress(prog);
        if (done) advanceGuide();
      }
      setRecent(log.recent(9));
      setTimeline({ samples: log.timelineSamples().slice(), events: log.since(60) });
      const r = recorderRef.current;
      setRec({ on: !!r?.recording, elapsed: r?.elapsed ?? 0 });
      const t = trackerRef.current;
      if (body === 'camera' && t && !bodyStatus)
        setBodyLabel(`camera pose · ${MODEL} · ${t.delegate} · ${t.fps} fps · ${inferMsRef.current.toFixed(0)} ms`);
    }, 200);
    return () => clearInterval(id);
  }, [inputsActive, body, bodyStatus]);

  // ---------------------------------------------------------------- recording
  const startRecording = () => {
    const r = recorderRef.current;
    if (!r) return;
    if (!r.supported) { setError('Video recording is not supported in this browser. PNG export still works.'); return; }
    if (r.start()) {
      filmRef.current.startedAt = performance.now();
      filmRef.current.ending = null;
      setRec({ on: true, elapsed: 0 });
      eventsRef.current.push({ type: 'recording_start', participantId: 'system', source: 'system', features: { mime: r.mime ?? '' } });
    } else setError('Story Film recording could not start. Try again, or export PNG and JSON.');
  };

  const stopRecording = async (showPreview: boolean) => {
    const r = recorderRef.current;
    if (!r || !r.recording) return null;
    const blob = await r.stop();
    setRec({ on: false, elapsed: 0 });
    eventsRef.current.push({ type: 'recording_stop', participantId: 'system', source: 'system', features: { bytes: blob?.size ?? 0 } });
    if (!blob) return null;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(blob);
    videoUrlRef.current = url;
    setVideo({ blob, url });
    if (showPreview) setModal('video-preview');
    return blob;
  };

  // ---------------------------------------------------------------- actions
  const togglePause = useCallback(() => {
    setPaused((p) => {
      engineRef.current?.setPaused(!p);
      return !p;
    });
  }, []);

  const doSave = useCallback(async (withMarks: boolean) => {
    setModal(null);
    const blob = await engineRef.current?.exportPNG(withMarks, PROMPT);
    if (!blob) return;
    download(blob, `the-babel-portrait-${stamp()}${withMarks ? '-marks' : ''}.png`);
    eventsRef.current.push({ type: 'portrait_saved', participantId: 'system', source: 'system', features: { withMarks } });
    flash('Portrait saved');
  }, [flash]);

  const doReset = useCallback(() => {
    setModal(null);
    engineRef.current?.reset();
    flash('Canvas cleared');
  }, [flash]);

  const exportData = useCallback(() => {
    const data = {
      project: 'The Babel',
      prompt: PROMPT,
      exportedAt: new Date().toISOString(),
      note: 'Derived features and events only. No audio, video or images. Audio features describe one shared microphone unless a manual voice turn was set. AI outputs are marked source "ai".',
      messages: convRef.current.messages,
      topics: convRef.current.topics,
      ...eventsRef.current.exportData(),
    };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `the-babel-session-${stamp()}.json`);
  }, []);

  const endingRef = useRef(false);
  const endSession = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setFinishing(true);
    cancelVoice();
    convRef.current.cancelPending();
    exitPresentation();
    setMoreOpen(false);
    setModal(null);
    try {
      await finishSession();
    } catch (e) {
      console.error('[babel] end session failed', e);
      setError(`Could not finish the session: ${(e as Error).message}`);
    } finally {
      endingRef.current = false;
      setFinishing(false);
    }
  };
  const finishSession = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (recorderRef.current?.recording) {
      // Story Film end card: a few counted facts, held for ~2.5 s before the recording stops.
      const ms = convRef.current.messages;
      const n = (t: string) => eventsRef.current.exportData().eventCounts[t] ?? 0;
      filmRef.current.ending = {
        at: performance.now(),
        lines: [
          `${ms.filter((m) => m.participantId === 'A').length} messages from A · ${ms.filter((m) => m.participantId === 'B').length} from B`,
          `${ms.filter((m) => m.replyTo).length} responses · ${n('gift_send')} gifts sent · ${n('gift_catch')} caught`,
          `${Math.round(engine.sanctuaryStats().growth * 100)}% shared sanctuary · ${Math.round(eventsRef.current.now())} s together`,
        ],
      };
      flash('Closing the Story Film…');
      await new Promise((r) => setTimeout(r, 2600));
    }
    const videoBlob = (await stopRecording(false)) ?? video?.blob ?? null;
    filmRef.current.ending = null;
    engine.setPaused(true);
    setPaused(true);
    console.info('[babel] end: exporting portraits');
    const art = await engine.exportPNG(false, PROMPT);
    const marks = await engine.exportPNG(true, PROMPT);
    if (!art || !marks) throw new Error('PNG export failed. Please try End session again.');
    engine.stop();
    console.info('[babel] end: building report');
    blobsRef.current = { art, marks };
    const log = eventsRef.current;
    const data = log.exportData();
    const conv = convRef.current;
    const report = buildReport({
      prompt: PROMPT,
      durationSec: log.now(),
      events: data.events,
      summaries: data.summaries,
      eventCounts: data.eventCounts,
      art: engine.artStats(),
      messages: conv.messages,
      topics: conv.topics,
      similarity: { value: conv.similarity, source: conv.similaritySource },
      sanctuary: engine.sanctuaryStats(),
    });
    log.push({ type: 'session_end', participantId: 'system', source: 'system', features: { durationSec: report.durationSec } });
    const vurl = videoBlob ? videoUrlRef.current : null;
    const artUrl = art ? URL.createObjectURL(art) : '';
    const marksUrl = marks ? URL.createObjectURL(marks) : '';
    resultUrlsRef.current = [artUrl, marksUrl].filter(Boolean);
    setResult({
      artUrl,
      marksUrl,
      video: videoBlob && vurl ? { url: vurl, mime: videoBlob.type, sizeMB: videoBlob.size / 1e6, ext: videoExt(videoBlob.type) } : null,
      videoNote: !VIDEO_MIME ? 'This browser cannot record video (MediaRecorder / captureStream unsupported). The PNG portraits are complete.' : 'No Story Film this session. Choose “Record Story Film” at the start, or More ▾ → ● Rec.',
      report,
    });
    setAiError(null);
  };

  const backToCanvas = () => {
    summaryGeneration.current++;
    setAiBusy(false);
    if (result) {
      URL.revokeObjectURL(result.artUrl);
      URL.revokeObjectURL(result.marksUrl);
    }
    setResult(null);
    resultUrlsRef.current = [];
    engineRef.current?.setPaused(false);
    engineRef.current?.start();
    setPaused(false);
  };

  const newSession = () => {
    summaryGeneration.current++;
    setAiBusy(false);
    if (result) {
      URL.revokeObjectURL(result.artUrl);
      URL.revokeObjectURL(result.marksUrl);
    }
    if (video) URL.revokeObjectURL(video.url);
    videoUrlRef.current = null;
    resultUrlsRef.current = [];
    setVideo(null);
    setResult(null);
    setPaused(false);
    setStats(null);
    setSpeaker('shared');
    convRef.current.reset();
    cancelVoice();
    setHideUI(false);
    setMoreOpen(false);
    setModal(null);
    setShowPanel(false);
    setShowMarks(false);
    blobsRef.current = { art: null, marks: null };
    setGuide(false, 0);
    exitPresentation();
    setPhase('consent');
  };

  const downloadResult = (what: 'art' | 'marks' | 'video' | 'report' | 'report-counts') => {
    if (!result) return;
    if (what === 'art' && blobsRef.current.art) download(blobsRef.current.art, `the-babel-portrait-${stamp()}.png`);
    if (what === 'marks' && blobsRef.current.marks) download(blobsRef.current.marks, `the-babel-portrait-${stamp()}-marks.png`);
    if (what === 'video' && result.video) {
      void fetch(result.video.url).then((r) => r.blob()).then((b) => download(b, `the-babel-story-film-${stamp()}.${result.video!.ext}`));
    }
    if (what === 'report-counts') {
      // Privacy option: every number, no words. Transcript, examples and AI text (if it quoted text) are removed.
      const r = result.report;
      const payload = {
        ...r,
        transcript: r.transcript.map((m) => ({ ...m, text: '', translation: m.translation ? { ...m.translation, text: '' } : null })),
        evidence: { ...r.evidence, language: { ...r.evidence.language, messages: r.evidence.language.messages.map((m) => ({ ...m, text: '' })) } },
        aiSummary: r.aiSummary?.includedText ? undefined : r.aiSummary,
        events: eventsRef.current.exportData().events.map((e) => (typeof e.features.label === 'string' ? { ...e, features: { ...e.features, label: '' } } : e)),
        labels: { privacy: 'counts-only export: conversation text removed', measured: 'computed by the program', simulated: 'sources marked *_sim', selfReported: 'I follow / unclear are reader self-reports' },
      };
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `the-babel-report-counts-${stamp()}.json`);
    }
    if (what === 'report') {
      const payload = {
        ...result.report,
        events: eventsRef.current.exportData().events,
        labels: { measured: 'computed by the program', simulated: 'sources marked *_sim', ai: 'aiSummary / source "ai" fields only' },
      };
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `the-babel-report-${stamp()}.json`);
    }
  };

  const generateAiSummary = async () => {
    if (!result) return;
    const generation = ++summaryGeneration.current;
    setAiBusy(true);
    setAiError(null);
    try {
      const includeText = consent.ai;
      const r = await aiSummary({
        stats: aiSummaryInput(result.report),
        includeText,
        messages: includeText ? convRef.current.messages.map((m) => ({ id: m.id, participantId: m.participantId, lang: m.lang, text: m.text })) : [],
      });
      if (generation !== summaryGeneration.current) return;
      const report = { ...result.report, aiSummary: { zh: r.zh, en: r.en, source: 'ai' as const, provider: r.provider, model: r.model, generatedAt: new Date().toISOString(), includedText: includeText } };
      setResult((current) => current === result ? { ...result, report } : current);
      eventsRef.current.push({ type: 'ai_summary', participantId: 'system', source: 'ai', features: { provider: r.provider, model: r.model } });
    } catch (e) {
      if (generation !== summaryGeneration.current) return;
      setAiError(`AI summary failed: ${(e as Error).message}. The data summary is unaffected.`);
    } finally {
      if (generation === summaryGeneration.current) setAiBusy(false);
    }
  };

  const chooseBody = (b: Body) => {
    if (b === 'camera' && !consent.camera) setModal('camera-consent');
    else setBody(b);
  };
  const chooseAudio = (m: StartAudio) => {
    if (m === 'mic' && !consent.mic) setModal('mic-consent');
    else setAudioMode(m);
  };

  const onSymbol = (owner: ParticipantId | 'shared', k: SymbolKind) => {
    engineRef.current?.addSymbol(k, owner, 'user');
    if (owner !== 'shared') addTray(owner, k, k, 'symbol');
  };
  const onSubmit = (p: ParticipantId, text: string, lang: LangCode, src: 'manual' | 'auto', mode: TextMessage['inputMode'], rate?: number, by?: TextMessage['langDetectedBy']) => {
    if (!inputsActive) return;
    const opts = replyRef.current[p];
    const m = convRef.current.submit(p, text, lang, src, mode, rate, by, opts);
    if (m && opts.replyTo) clearReply(p);
  };
  const setReply = (p: ParticipantId, messageId: string | null, giftId?: string) => {
    replyRef.current = { ...replyRef.current, [p]: messageId ? { replyTo: messageId, giftId } : {} };
    setReplyTo((r) => ({ ...r, [p]: messageId }));
  };
  const clearReply = (p: ParticipantId) => setReply(p, null);

  // ---------------------------------------------------------------- Bilingual bridge
  const onCheck = (id: string, by: ParticipantId, v: 'clear' | 'unclear') => convRef.current.check(id, by, v);
  const onRespond = (reader: ParticipantId, messageId: string) => {
    setReply(reader, messageId);
    window.setTimeout(() => (document.querySelector(`.composer.${reader} textarea, .composer.${reader} input[type="text"]`) as HTMLElement | null)?.focus(), 0);
  };
  const onSendAsGift = (m: TextMessage) => {
    const e = engineRef.current;
    if (!e) return;
    const c = m.keywords[0] ?? findConcepts(m.text, m.lang)[0];
    const cat = c ? guideCategory(c) : null;
    const item: TrayItem = {
      id: `t${++traySeq.current}`, kind: cat?.element ?? (c ? conceptMotif(c) : 'star'),
      label: c ? conceptLabel(c, m.lang) : [...m.text].slice(0, 8).join(''),
      source: m.inputMode === 'typed' ? 'text' : 'voice', text: m.text, lang: m.lang, messageId: m.id,
    };
    if (!e.gifts.send(m.participantId, item)) flash(`${m.participantId} already has two gifts in the air`);
    setGifts(e.gifts.snapshot());
  };

  // ---------------------------------------------------------------- Send & Catch
  const onSend = (p: ParticipantId, item: TrayItem) => {
    const e = engineRef.current;
    if (!e) return;
    if (!e.gifts.send(p, item)) flash(`${p} already has two gifts in the air`);
    setGifts(e.gifts.snapshot());
  };
  const onGift = (id: string, a: GiftAction) => {
    const g = engineRef.current?.gifts;
    if (!g) return;
    if (a === 'catch') g.catch(id, 'button');
    else if (a === 'cancel') g.cancel(id);
    else if (a === 'place') g.place(id);
    else if (a === 'send_on') g.sendOn(id);
    else g.transform(id, a);
    setGifts(g.snapshot());
  };

  /** The holder answers on the caught gift: a linked reply message + a caption on the gift itself. */
  const onGiftReply = (id: string, text: string) => {
    const e = engineRef.current;
    const g = e?.gifts.snapshot().find((x) => x.id === id);
    if (!e || !g || g.state !== 'held' || !g.holder) return;
    const by = g.holder;
    const det = detectLang(text);
    const lang = det?.lang ?? langsRef.current[by];
    const origin = e.gifts.messageOf(id);
    const m = convRef.current.submit(by, text, lang, det ? 'auto' : 'manual', 'typed', undefined, det ? 'text_heuristic' : undefined, { replyTo: origin, giftId: id });
    if (m) e.gifts.respond(id, { by, text: m.text, lang: m.lang, messageId: m.id });
    setGifts(e.gifts.snapshot());
  };

  // ---------------------------------------------------------------- Shared Sanctuary
  const toggleSanctuary = () => {
    const e = engineRef.current;
    if (!e) return;
    if (e.sanctuary.active) { e.sealSanctuary(); flash('Sanctuary sealed into the artwork'); }
    else e.sanctuary.start('user');
    setSanct(e.sanctuaryStats());
  };

  // ---------------------------------------------------------------- Guided experience
  const setGuide = (guidedOn: boolean, step: number) => {
    guideRef.current = { guided: guidedOn, step, since: performance.now() };
    setGuided(guidedOn);
    setGuideStep(step);
    const id = GUIDE_STEPS[step]?.id;
    if (guidedOn && id === 'sanctuary') engineRef.current?.sanctuary.start('guided');
    eventsRef.current.push({ type: 'guide_step', participantId: 'system', source: 'user', features: { guided: guidedOn, step: id ?? 'off' } });
  };
  const advanceGuide = () => {
    const g = guideRef.current;
    if (g.step < GUIDE_STEPS.length - 1) setGuide(true, g.step + 1);
  };

  // ---------------------------------------------------------------- Voice clips (auto language) / dictation fallback
  const voiceMode: VoiceUi['mode'] = consent.voice && ai.transcribe?.available ? 'cloud' : consent.speech && speechSupported() ? 'browser' : 'none';
  const onVoice = async (p: ParticipantId, action: 'start' | 'stop') => {
    const clip = clipRef.current;
    if (action === 'stop') {
      if (!clip || voiceOwner.current !== p) return;
      if (!clip.recording) { cancelVoice(); return; }
      voiceOwner.current = null;
      // Stop → upload once → text + detected language back into this person's box.
      setVoice((v) => ({ ...v, phase: 'transcribing' }));
      const res = await clip.stop();
      if (clipRef.current !== clip) return;
      clipRef.current = null;
      setSpeaker(speakerBeforeVoice.current);
      if (!res) { setVoice((v) => ({ ...v, active: null, phase: 'idle' })); return; }
      if (res.seconds < 0.6) {
        setVoice((v) => ({ ...v, active: null, phase: 'idle' }));
        flash('Too short — hold the button while you speak');
        return;
      }
      eventsRef.current.push({ type: 'voice_clip', participantId: p, source: 'speech', features: { seconds: Math.round(res.seconds * 10) / 10, uploaded: true } });
      const request = new AbortController();
      voiceRequest.current = request;
      try {
        const t = await aiTranscribe(res.blob, request.signal);
        if (request.signal.aborted) return;
        const lang = t.language ?? (t.text ? detectLang(t.text)?.lang ?? null : null);
        const detectedBy = t.language ? 'speech_model' : 'none';
        eventsRef.current.push({
          type: 'voice_transcribed', participantId: p, source: 'ai',
          features: { lang: lang ?? 'unknown', detectedBy, rawLanguage: t.rawLanguage ?? '', chars: t.text.length, model: t.model },
        });
        setVoice((v) => ({ ...v, active: null, phase: 'idle', draft: { ...v.draft, [p]: { stamp: Date.now(), text: t.text, lang, detectedBy, seconds: res.seconds } } }));
        if (!t.text) flash('No speech recognised — try again, or type');
      } catch (err) {
        if (request.signal.aborted) return;
        setVoice((v) => ({ ...v, active: null, phase: 'idle' }));
        setError(`Transcription failed: ${(err as Error).message}. You can type instead.`);
      } finally {
        if (voiceRequest.current === request) voiceRequest.current = null;
      }
      return;
    }
    if (!inputsActive || voiceOwner.current || clip || voiceRequest.current) return;
    const vc = new VoiceClip();
    clipRef.current = vc;
    voiceOwner.current = p;
    setVoice((v) => ({ ...v, active: p, phase: 'starting', elapsed: 0 }));
    vc.onAutoStop = () => void onVoice(p, 'stop');
    try {
      await vc.start();
    } catch (err) {
      if (clipRef.current !== vc) return;
      cancelVoice();
      setError(`Microphone for voice clips unavailable: ${(err as Error).message}`);
      return;
    }
    if (clipRef.current !== vc || !vc.recording) { void vc.stop(); return; }
    // Speaking identity is explicit: the person who pressed "speak" is the speaker (manual turn).
    speakerBeforeVoice.current = speaker;
    setSpeaker(p);
    setVoice((v) => ({ ...v, active: p, phase: 'recording', elapsed: 0 }));
  };

  // ---------------------------------------------------------------- Presentation mode
  const enterPresentation = () => {
    cancelVoice();
    setPresenting(true);
    setHideUI(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
    eventsRef.current.push({ type: 'presentation', participantId: 'system', source: 'user', features: { on: true } });
  };
  const exitPresentation = useCallback(() => {
    setPresenting(false);
    setHideUI(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    if (!presenting) return;
    const onFs = () => { if (!document.fullscreenElement) exitPresentation(); };
    let t = 0;
    const onMove = () => { setShowControlsHint(true); clearTimeout(t); t = window.setTimeout(() => setShowControlsHint(false), 2000); };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('mousemove', onMove);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('mousemove', onMove); clearTimeout(t); };
  }, [presenting, exitPresentation]);

  // Keyboard shortcuts (ignored while typing). V (hold) = "speak" in simulated audio. 0/1/2 = voice turn.
  useEffect(() => {
    if (phase !== 'running' || result) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (presenting) exitPresentation(); setMoreOpen(false); return; }
      if (modal || finishing || e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || (e.target as HTMLElement)?.closest('button, summary, a')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); togglePause(); }
      else if (k === 's') setModal('save');
      else if (k === 'r') setModal('reset');
      else if (k === 'd') setShowPanel((v) => !v);
      else if (k === 'g') setShowMarks((v) => !v);
      else if (k === 'h') setHideUI((v) => !v);
      else if (k === 'p') { if (presenting) exitPresentation(); else enterPresentation(); }
      else if (k === 'escape' && presenting) exitPresentation();
      else if (k === 'm') setPartner((p) => (p === 'mirror' ? 'auto' : 'mirror'));
      else if (k === '0') setSpeaker('shared');
      else if (k === '1') setSpeaker('A');
      else if (k === '2') setSpeaker('B');
      else if (k === 'v' && audioSimRef.current) audioSimRef.current.manualGate = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v' && audioSimRef.current) audioSimRef.current.manualGate = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [phase, modal, finishing, togglePause, result, presenting, exitPresentation]);

  const start = (o: StartOptions) => {
    setError(null);
    setConsent({ camera: o.cameraConsent, mic: o.micConsent, ai: o.aiConsent, speech: o.speechConsent, voice: o.voiceConsent });
    traysRef.current = { A: [], B: [] };
    setTrays(traysRef.current);
    setGifts([]);
    setVoice({ mode: 'none', active: null, phase: 'idle', elapsed: 0, draft: { A: null, B: null } });
    setLangs(o.langs);
    langsRef.current = o.langs;
    replyRef.current = { A: {}, B: {} };
    setReplyTo({ A: null, B: null });
    filmMsgId.current = null;
    filmRef.current = { startedAt: performance.now(), prompt: { A: PROMPT_IN[o.langs.A], B: PROMPT_IN[o.langs.B] }, langs: o.langs, last: null, ticker: [], ending: null };
    setBody(o.body);
    setAudioMode(o.audio);
    autoRecordRef.current = o.record;
    eventsRef.current.reset();
    convRef.current.reset();
    eventsRef.current.push({
      type: 'session_start', participantId: 'system', source: 'system',
      features: { langA: o.langs.A, langB: o.langs.B, aiConsent: o.aiConsent, speechConsent: o.speechConsent, voiceConsent: o.voiceConsent, record: o.record, guided: o.guided },
    });
    setPhase('running');
    setGuide(o.guided, 0);
  };

  const conv = convRef.current;
  const nobody = stats && !stats.participants.A.present && !stats.participants.B.present;
  const audioLabel =
    micStatus || (audioMode === 'mic' ? 'shared microphone · REAL (both voices mixed)' : audioMode === 'sim' ? 'SIMULATED audio (hold V to speak)' : 'off');
  const status = bodyStatus || micStatus;
  const aiOn = consent.ai && ai.available;
  const aiLabel = aiOn ? `AI · ${ai.provider}` : 'LOCAL DEMO';
  const chips: { label: string; kind: 'real' | 'sim' | 'ai' | '' }[] = [
    { label: `BODY · ${body === 'camera' ? 'CAMERA (REAL)' : 'MOUSE (SIM)'}`, kind: body === 'sim' ? 'sim' : 'real' },
    { label: `SOUND · ${audioMode === 'mic' ? 'SHARED MIC' : audioMode === 'sim' ? 'SIMULATED' : 'OFF'}`, kind: audioMode === 'sim' ? 'sim' : audioMode === 'mic' ? 'real' : '' },
    { label: `TEXT · ${aiOn ? `AI (${ai.provider})` : 'LOCAL DEMO'}`, kind: aiOn ? 'ai' : 'sim' },
  ];
  // Express → Understand → Respond → Co-Create → Reflect: cumulative "done" flags + the next plain-language action.
  const counts = eventsRef.current.countsByType();
  const msgs = conv.messages;
  const lastMsg = msgs[msgs.length - 1];
  const reader: ParticipantId | null = lastMsg ? (lastMsg.participantId === 'A' ? 'B' : 'A') : null;
  const coCreated = (counts.gift_catch ?? 0) > 0 || (sanct?.growth ?? 0) > 0.2;
  const done = [msgs.length > 0, msgs.some((m) => m.check), msgs.some((m) => m.replyTo), coCreated, !!result];
  const firstOpen = done.findIndex((d) => !d);
  const lastReader = reader ?? 'B';
  const flow: FlowState = {
    done,
    next: firstOpen === 0 ? 'Answer the question in your own language: type, pick a phrase, or hold to speak.'
      : firstOpen === 1 ? `${lastReader}: read ${lastMsg!.participantId}'s words on your side, then tap “I follow” or “unclear”.`
      : firstOpen === 2 ? `${lastReader}: tap “respond ↩” and answer in ${langName(langs[lastReader])}.`
      : firstOpen === 3 ? 'Co-create: “send these words as a gift”, catch it, change it, send it back — or open Sanctuary and move together.'
      : 'Keep talking and making, or End session to see your Story Film and portraits.',
  };
  const voiceNote = voiceMode === 'cloud' ? 'voice: hold to speak (cloud transcription)' : voiceMode === 'browser' ? 'voice: browser dictation' : 'voice off: type or pick phrases';
  const mode = aiOn
    ? { kind: 'ai' as const, label: `AI translation · ${ai.provider}`, detail: `${voiceNote}${conv.aiError ? ` · last AI error: ${conv.aiError}` : ''}` }
    : { kind: 'local' as const, label: 'Local demo · no AI', detail: `phrasebook = real translation · other text = keyword gloss · ${voiceNote}` };
  const hint = status ? status
    : paused ? 'Paused — the portrait is held. Space to continue.'
    : body === 'sim' ? `Mouse: you are A, B ${partner === 'mirror' ? 'mirrors you' : 'drifts'}. Meet in the middle to weave; move to the top for wings.`
    : nobody ? 'Step into the frame, side by side, hands visible.'
    : 'Move, talk, write. Raise both arms for wings. Silence leaves space.';

  return (
    <div className={`app ${hideUI ? 'hide-ui' : ''} ${presenting ? 'presenting' : ''} phase-${phase}`}>
      <video ref={videoRef} className="hidden-video" playsInline muted />

      {phase === 'consent' && (
        <ConsentScreen prompt={PROMPT} error={error} ai={ai} speechAvailable={speechSupported()} recordSupported={!!VIDEO_MIME} initialLangs={langs} onStart={start} />
      )}

      {phase === 'running' && (
        <>
          <header className="topbar ui">
            <div className="brand">
              <span className="title small-title">The Babel</span>
              <span className="hud-prompt">{PROMPT}</span>
            </div>
            <nav className="controls" aria-label="Controls">
              {rec.on && <span className="rec-dot mono" title="Story Film recording (canvas + subtitles only)">● {Math.floor(rec.elapsed / 60)}:{String(Math.floor(rec.elapsed % 60)).padStart(2, '0')}</span>}
              <button className="btn" disabled={finishing} onClick={togglePause} title="Space">{paused ? 'Resume' : 'Pause'}</button>
              <button className={`btn ${sanct?.active ? 'on-sanct' : ''}`} disabled={finishing} onClick={toggleSanctuary} title="Shared Sanctuary: A drives the left wing, B the right">
                {sanct?.active ? `Seal sanctuary ${Math.round(sanct.growth * 100)}%` : 'Sanctuary'}
              </button>
              <button className="btn" disabled={finishing} onClick={enterPresentation} title="P">Present</button>
              <div className="more">
                <button className={`btn ${moreOpen ? 'on' : ''}`} disabled={finishing} aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>More ▾</button>
                {moreOpen && (
                  <div className="more-menu" role="menu" onClick={(e) => { if ((e.target as HTMLElement).tagName === 'BUTTON' && !(e.target as HTMLElement).classList.contains('seg-btn')) setMoreOpen(false); }}>
                    <div className="seg" role="group" aria-label="Body input">
                      <span className="seg-label">body</span>
                      <button className={`seg-btn ${body === 'camera' ? 'on' : ''}`} onClick={() => chooseBody('camera')}>camera</button>
                      <button className={`seg-btn ${body === 'sim' ? 'on' : ''}`} onClick={() => chooseBody('sim')}>mouse sim</button>
                    </div>
                    <div className="seg" role="group" aria-label="Sound input">
                      <span className="seg-label">sound</span>
                      <button className={`seg-btn ${audioMode === 'off' ? 'on' : ''}`} onClick={() => chooseAudio('off')}>off</button>
                      <button className={`seg-btn ${audioMode === 'mic' ? 'on' : ''}`} onClick={() => chooseAudio('mic')}>mic</button>
                      <button className={`seg-btn ${audioMode === 'sim' ? 'on' : ''}`} onClick={() => chooseAudio('sim')}>audio sim</button>
                    </div>
                    <button className={`btn rec-btn ${rec.on ? 'on' : ''}`} onClick={() => (rec.on ? void stopRecording(true) : startRecording())} title={VIDEO_MIME ?? 'Video recording not supported'}>
                      {rec.on ? '■ Stop Story Film' : '● Record Story Film'}
                    </button>
                    <button className="btn" onClick={() => setModal('save')} title="S">Save PNG</button>
                    <button className="btn" onClick={() => setShowMarks((v) => !v)} title="G">{showMarks ? 'Hide data marks' : 'Show data marks'}</button>
                    <button className="btn" onClick={() => setShowPanel((v) => !v)} title="D">{showPanel ? 'Hide data panel' : 'Show data panel'}</button>
                    <button className="btn" onClick={() => setModal('reset')} title="R">Clear canvas</button>
                  </div>
                )}
              </div>
              <button className="btn primary" disabled={finishing} onClick={() => void endSession()}>{finishing ? 'Finishing…' : 'End session'}</button>
            </nav>
          </header>

          {guided && !hideUI && !finishing && !result && (
            <GuideStrip step={guideStep} progress={guideProgress} onNext={advanceGuide} onExit={() => setGuide(false, guideStep)} onEnd={() => void endSession()} />
          )}
          <main className="workspace">
            <div className="stage-wrap" ref={wrapRef}>
              <div className="frame" style={{ width: frame.w, height: frame.h }}>
                <canvas ref={canvasRef} className="stage" />
                <span className="crop tl" /><span className="crop tr" /><span className="crop bl" /><span className="crop br" />
                <span className="frame-label top ui">A ○ BLUE PEN · B ■ WHITE RIBBON · SHARED ◇ GEOMETRY</span>
              </div>
            </div>
            {showPanel && !hideUI && (
              <DataPanel
                stats={stats} bodyLabel={bodyStatus || bodyLabel} audioLabel={audioLabel} events={recent} timeline={timeline} onExportData={exportData}
                language={{
                  messagesA: conv.messages.filter((m) => m.participantId === 'A').length,
                  messagesB: conv.messages.filter((m) => m.participantId === 'B').length,
                  similarity: conv.similarity, similaritySource: conv.similaritySource, topics: conv.topics, ai: aiLabel, pending: conv.aiPending,
                }}
              />
            )}
          </main>

          {(!hideUI || presenting) && !result && (
            <SubtitleBridge
              key={conv.messages[conv.messages.length - 1]?.id ?? 'prompt'}
              presenting={presenting || finishing}
              messages={conv.messages}
              langs={langs}
              onCheck={onCheck}
              onRespond={onRespond}
              onCorrectLang={(id, l) => convRef.current.correctLanguage(id, l)}
              onEditTranslation={(id, t) => convRef.current.editTranslation(id, t)}
              onSendAsGift={onSendAsGift}
              aiPending={conv.aiPending > 0}
            />
          )}

          {inputsActive && <ConversationBar
            active={!presenting}
            langs={langs}
            setLang={(p, l) => {
              setLangs((s) => ({ ...s, [p]: l }));
              filmRef.current.langs = { ...filmRef.current.langs, [p]: l };
              filmRef.current.prompt = { ...filmRef.current.prompt, [p]: PROMPT_IN[l] };
              eventsRef.current.push({ type: 'language_set', participantId: p, source: 'user', features: { lang: l } });
            }}
            topics={conv.topics}
            similarity={{ value: conv.similarity, source: conv.similaritySource }}
            speechEnabled={consent.speech && speechSupported()}
            flow={flow}
            mode={mode}
            aiNote={aiOn ? `cloud AI on (${ai.provider} · ${ai.model})${conv.aiError ? ` — last error: ${conv.aiError}` : ''}` : 'local demo: lexicon keywords + demo gloss · shared topics appear when both write about the same thing'}
            audioOn={audioMode !== 'off'}
            speaker={speaker}
            setSpeaker={setSpeaker}
            chips={chips}
            hint={hint}
            onSubmit={onSubmit}
            onSymbol={onSymbol}
            voice={{ ...voice, mode: voiceMode }}
            onVoice={(p, a) => void onVoice(p, a)}
            replyTargets={{
              A: replyTo.A ? conv.messages.find((m) => m.id === replyTo.A) ?? null : null,
              B: replyTo.B ? conv.messages.find((m) => m.id === replyTo.B) ?? null : null,
            }}
            onClearReply={clearReply}
            onGiftReply={onGiftReply}
            trays={trays}
            gifts={gifts}
            onSend={onSend}
            onGift={onGift}
            preview={<canvas ref={previewRef} width={160} height={90} className={`preview ${body === 'camera' ? '' : 'off'}`} aria-label="Camera keypoint preview" />}
          />}

          {error && <div className="toast error-toast" role="alert" onClick={() => setError(null)}>{error} ✕</div>}
          {toast && <div className="toast">{toast}</div>}

          {modal === 'save' && <SaveModal onSave={doSave} onCancel={() => setModal(null)} />}
          {modal === 'reset' && (
            <ConfirmModal title="Clear the canvas?" body="The current artwork will be erased. Save it first if you want to keep it." confirmLabel="Clear" onConfirm={doReset} onCancel={() => setModal(null)} />
          )}
          {modal === 'camera-consent' && (
            <ConfirmModal
              title="Use the camera?"
              body="Both participants agree to use the camera. The image is analysed in this browser as body keypoints; no video is recorded or uploaded."
              confirmLabel="We both agree"
              onConfirm={() => { setConsent((c) => ({ ...c, camera: true })); setBody('camera'); setModal(null); }}
              onCancel={() => setModal(null)}
            />
          )}
          {modal === 'mic-consent' && (
            <ConfirmModal
              title="Use the shared microphone?"
              body="Both participants agree to use one shared microphone. Only loudness, frequency, pitch and rhythm are computed in this browser. It cannot tell who is speaking, and no sound is recorded or played back."
              confirmLabel="We both agree"
              onConfirm={() => { setConsent((c) => ({ ...c, mic: true })); setAudioMode('mic'); setModal(null); }}
              onCancel={() => setModal(null)}
            />
          )}
          {modal === 'video-preview' && video && (
            <div className="modal-backdrop" onClick={() => setModal(null)}>
              <div className="modal wide" role="dialog" aria-label="Recording preview" onClick={(e) => e.stopPropagation()}>
                <h2>Story Film</h2>
                <video src={video.url} controls playsInline className="final-video" ref={fixWebmDuration} />
                <p>Canvas + subtitles only, no camera image or microphone sound — {(video.blob.size / 1e6).toFixed(1)} MB · {video.blob.type}. Kept on this device until you download it.</p>
                <div className="modal-actions">
                  <button className="btn ghost" onClick={() => setModal(null)}>Close</button>
                  <button className="btn primary" onClick={() => download(video.blob, `the-babel-story-film-${stamp()}.${videoExt(video.blob.type)}`)}>Download video</button>
                </div>
              </div>
            </div>
          )}

          {presenting && (
            <>
              <div className="lower-third" aria-live="polite">
                <span className="lt-title">The Babel</span>
                <FlowSteps flow={flow} compact />
                <span className="mono">A ○ blue on white · B ■ white on blue · Shared ◇ geometry</span>
                <span className="mono">
                  gifts {gifts.length ? `${gifts.filter((g) => g.state === 'held').length} held · ${gifts.filter((g) => g.state !== 'held').length} travelling` : 'none in the air'}
                  {' · '}{conv.messages.length} messages · {conv.topics.length} shared topics
                  {sanct?.active ? ` · sanctuary ${Math.round(sanct.growth * 100)}% (${sanct.stageName})` : ''}
                </span>
              </div>
              <button className={`present-exit ${showControlsHint ? 'show' : ''}`} onClick={exitPresentation}>Show controls (Esc)</button>
            </>
          )}

          {result && (
            <ResultScreen
              data={result}
              aiAvailable={ai.available}
              aiConsent={consent.ai}
              aiBusy={aiBusy}
              aiError={aiError}
              onAiSummary={() => void generateAiSummary()}
              onDownload={downloadResult}
              onBack={backToCanvas}
              onNew={newSession}
            />
          )}
        </>
      )}
    </div>
  );
}
