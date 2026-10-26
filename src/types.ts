export type ParticipantId = 'A' | 'B';
export const PARTICIPANTS: ParticipantId[] = ['A', 'B'];

export interface Vec2 {
  x: number;
  y: number;
}

/** One wrist target in normalized, mirrored screen space (0..1). */
export interface HandTarget {
  x: number;
  y: number;
  visible: boolean;
}

export interface ParticipantTarget {
  present: boolean;
  /** [left wrist, right wrist] from the participant's own point of view. */
  hands: [HandTarget, HandTarget];
}

export type EngineTargets = Record<ParticipantId, ParticipantTarget>;

/** Where a piece of data came from. Simulated sources are always labelled as such. */
export type DataSource = 'pose' | 'mouse_sim' | 'mic' | 'audio_sim' | 'text' | 'speech' | 'user' | 'derived' | 'ai' | 'system';
export type BodySource = 'pose' | 'mouse_sim';
export type AudioSource = 'mic' | 'audio_sim' | 'off';

/** Unified, timestamped interaction event (seconds since session start). */
export interface InteractionEvent {
  timestamp: number;
  type: string;
  participantId: ParticipantId | 'shared' | 'system';
  source: DataSource;
  features: Record<string, number | string | boolean>;
}

/** Shared-microphone features. One mic = mixed audio of both people; never attributed to a speaker. */
export interface AudioFeatures {
  source: AudioSource;
  /** Raw RMS of the time-domain signal (0..1 full scale). */
  rms: number;
  /** RMS in dBFS. */
  db: number;
  /** Normalized loudness above the adaptive noise floor, smoothed (0..1). */
  level: number;
  /** Normalized band energies above their noise floors, smoothed (0..1). */
  low: number;
  mid: number;
  high: number;
  /** Spectral centroid in Hz (0 when silent). */
  centroid: number;
  /** Voice/sound activity (with hysteresis + hold). */
  active: boolean;
  /** Seconds since activity last stopped (0 while active). */
  silenceSec: number;
  /** 64-sample waveform snapshot (-1..1) for drawing sound waves. */
  wave: Float32Array;
  /** 32 log-spaced spectrum bins (0..1) for the data view. */
  spectrum: Float32Array;
  /** Prosody (measurable signal only — never read as emotion). Fundamental frequency in Hz, 0 if unvoiced. */
  pitchHz: number;
  /** log-scaled pitch, 80 Hz → 0, 400 Hz → 1 (0 if unvoiced). */
  pitchNorm: number;
  /** Loudness onsets per second over the last 3 s (speaking rhythm proxy). */
  onsetRate: number;
}

export function silentAudio(source: AudioSource = 'off'): AudioFeatures {
  return {
    source, rms: 0, db: -100, level: 0, low: 0, mid: 0, high: 0, centroid: 0,
    active: false, silenceSec: 0, wave: new Float32Array(64), spectrum: new Float32Array(32),
    pitchHz: 0, pitchNorm: 0, onsetRate: 0,
  };
}

export interface HandStats {
  x: number;
  y: number;
  speed: number;
  visible: boolean;
}

export interface TimelineSample {
  t: number;
  level: number;
  speedA: number;
  speedB: number;
  distance: number | null;
}

export interface EngineStats {
  renderFps: number;
  bodySource: BodySource;
  audio: AudioFeatures;
  participants: Record<ParticipantId, { present: boolean; hands: [HandStats, HandStats]; maxSpeed: number }>;
  /** Closest A-hand ↔ B-hand distance, in units of frame height (2D image space). */
  handDistance: number | null;
  /** Rate of change of handDistance, frame-heights / s (negative = approaching). */
  approachRate: number;
  weave: number;
  sync: number;
  voiceMotion: boolean;
  sharedNodes: number;
  crossings: number;
  symbols: number;
  /** 0..1 how far the white and blue grounds have merged (grows with shared shapes). */
  fusion: number;
  speakerMode: SpeakerMode;
  /** Live explanation of what is currently changing the artwork. */
  effects: { input: string; effect: string }[];
  paused: boolean;
  elapsed: number;
}

export function emptyTargets(): EngineTargets {
  const hidden = (): [HandTarget, HandTarget] => [
    { x: 0.5, y: 0.5, visible: false },
    { x: 0.5, y: 0.5, visible: false },
  ];
  return { A: { present: false, hands: hidden() }, B: { present: false, hands: hidden() } };
}

// ---------------------------------------------------------------- Phase 4 + 5

export type LangCode = 'zh' | 'en' | 'ja' | 'es';
export type SymbolKind = 'wings' | 'halo' | 'rays' | 'eye' | 'star' | 'flower' | 'feather' | 'unfolding' | 'house' | 'tree' | 'bridge';
/** Who the shared microphone is attributed to: only by an explicit, user-set turn. */
export type SpeakerMode = 'shared' | 'A' | 'B';
/** Where an interpretation came from. AI output is always labelled separately from measured data. */
export type InterpretationSource = 'local_lexicon' | 'ai';

export interface Translation {
  text: string;
  to: LangCode;
  /** ai = cloud model · phrasebook = pre-translated demo phrase · demo_gloss = keywords only · manual = corrected by a person */
  source: 'ai' | 'phrasebook' | 'demo_gloss' | 'manual';
}

export interface TextMessage {
  id: string;
  participantId: ParticipantId;
  text: string;
  lang: LangCode;
  langSource: 'manual' | 'auto';
  /** typed · speech = browser dictation · voice = cloud transcription of a voice clip */
  inputMode: 'typed' | 'speech' | 'voice';
  timestamp: number;
  /** Concept ids found by the local lexicon (or AI keywords mapped to labels). */
  keywords: string[];
  keywordSource: InterpretationSource;
  translation?: Translation;
  /** Words (or CJK characters) per minute — only for dictated text with a known duration. */
  speakingRate?: number;
  /** Where the language label came from, if it was not typed by hand. */
  langDetectedBy?: 'text_heuristic' | 'speech_model';
  /** Set when a person corrected the language after sending. */
  corrected?: boolean;
  /** The message this one responds to (an explicit "Respond", or a reply written on a caught gift). */
  replyTo?: string;
  /** Set when the reply was written on a gift. */
  giftId?: string;
  /** Self-reported by the reader of the translation — never inferred. */
  check?: { by: ParticipantId; value: 'clear' | 'unclear'; at: number };
}

export interface SharedTopic {
  id: string;
  label: string;
  source: InterpretationSource;
  timestamp: number;
  messageIds: string[];
  similarity: number;
}

// ---------------------------------------------------------------- Phase 6: Send & Catch, Shared Sanctuary

export type GiftState = 'flying' | 'waiting' | 'held' | 'placed' | 'dropped' | 'cancelled';

/** An element someone made (from their words, a chosen symbol or a shared topic) that they can send. */
export interface TrayItem {
  id: string;
  kind: SymbolKind;
  label: string;
  source: 'text' | 'voice' | 'symbol' | 'topic';
  /** When the element came from a message: that message (its words travel with the gift). */
  messageId?: string;
  text?: string;
  lang?: LangCode;
}

export interface GiftCaption {
  by: ParticipantId;
  text: string;
  lang: LangCode;
  messageId?: string;
}

export interface GiftSnapshot {
  id: string;
  kind: SymbolKind;
  label: string;
  origin: ParticipantId;
  from: ParticipantId;
  to: ParticipantId;
  holder: ParticipantId | null;
  state: GiftState;
  hops: number;
  /** Participants whose visual identity is now part of the gift. */
  marks: ParticipantId[];
  textures: ParticipantId[];
  waitLeft: number;
  dwell: number;
  scale: number;
  rot: number;
  captions: GiftCaption[];
  originMessageId?: string;
}

export interface SanctuaryStats {
  active: boolean;
  growth: number;
  stage: number;
  stageName: string;
  wing: Record<ParticipantId, { spread: number; feathers: number; energy: number; texture: number }>;
  coordinatedSec: number;
  sealed: number;
}
