import { useState } from 'react';
import { PALETTE } from '../engine/palette';
import { LANGS } from '../lang/languages';
import type { AiStatus } from '../ai/client';
import type { LangCode, ParticipantId } from '../types';

export type StartAudio = 'off' | 'mic' | 'sim';

export interface StartOptions {
  body: 'camera' | 'sim';
  audio: StartAudio;
  cameraConsent: boolean;
  micConsent: boolean;
  langs: Record<ParticipantId, LangCode>;
  aiConsent: boolean;
  speechConsent: boolean;
  voiceConsent: boolean;
  record: boolean;
  guided: boolean;
}

interface Props {
  prompt: string;
  error: string | null;
  ai: AiStatus;
  speechAvailable: boolean;
  recordSupported: boolean;
  initialLangs: Record<ParticipantId, LangCode>;
  onStart: (o: StartOptions) => void;
}

export function ConsentScreen({ prompt, error, ai, speechAvailable, recordSupported, initialLangs, onStart }: Props) {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const [audio, setAudio] = useState<StartAudio>('off');
  const [micOk, setMicOk] = useState(false);
  const [langs, setLangs] = useState(initialLangs);
  const [aiOk, setAiOk] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const [record, setRecord] = useState(recordSupported);
  const [voiceOk, setVoiceOk] = useState(false);
  const [guided, setGuided] = useState(true);
  const voiceAvailable = !!ai.transcribe?.available;
  const audioReady = audio !== 'mic' || micOk;

  const go = (body: 'camera' | 'sim') =>
    onStart({
      body, audio, langs, record: record && recordSupported,
      cameraConsent: body === 'camera' && a && b,
      micConsent: audio === 'mic' && micOk,
      aiConsent: ai.available && aiOk,
      speechConsent: speechAvailable && speechOk,
      voiceConsent: voiceAvailable && voiceOk,
      guided,
    });

  return (
    <div className="consent">
      <div className="consent-card">
        <div className="consent-head">
          <p className="eyebrow">An interactive artwork for two // a place between us</p>
          <h1 className="title">The Babel</h1>
          <p className="tagline">Two Languages. Two Stories. One Shared Place.</p>
        </div>

        <div className="prompt-block">
          <span className="eyebrow">Today's question</span>
          <p className="prompt">{prompt}</p>
          <p className="prompt-alt">是什么让你有家的感觉？ · あなたが「家にいる」と感じるのはどんなとき？ · ¿Qué te hace sentir en casa?</p>
        </div>

        <ol className="how">
          <li>
            Left person <b style={{ color: PALETTE.A.css }}>A</b> — blue on white, a pen line {PALETTE.A.marker}. Right person{' '}
            <b style={{ color: PALETTE.B.css }}>B</b> — white on blue, a ribbon {PALETTE.B.marker}.
          </li>
          <li>Move, speak, write in your own language. Hands meeting weave shared shapes; shared topics grow shared motifs; raise both arms for wings.</li>
          <li>The more you make together, the more the white and blue grounds merge.</li>
        </ol>

        <fieldset className="consent-group">
          <legend>Experience</legend>
          <div className="seg" role="radiogroup" aria-label="Experience">
            <button role="radio" aria-checked={guided} className={`seg-btn ${guided ? 'on' : ''}`} onClick={() => setGuided(true)}>Guided: answer → send & catch → build a sanctuary</button>
            <button role="radio" aria-checked={!guided} className={`seg-btn ${!guided ? 'on' : ''}`} onClick={() => setGuided(false)}>Free canvas</button>
          </div>
          <p className="fine">The guide can be skipped or left at any time; everything stays available on the free canvas.</p>
        </fieldset>

        <fieldset className="consent-group">
          <legend>Languages</legend>
          <div className="lang-pick">
            {(['A', 'B'] as const).map((p) => (
              <label key={p} className="lang-row">
                <span className={`who-tag ${p}`}>{p}</span>
                <select value={langs[p]} onChange={(e) => setLangs({ ...langs, [p]: e.target.value as LangCode })} aria-label={`Participant ${p} language`}>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native} · {l.en}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="fine">You can change languages and correct auto-detection at any time. Languages never decide which symbols appear.</p>
        </fieldset>

        <fieldset className="consent-group">
          <legend>Camera</legend>
          <label className="check"><input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} />Participant A agrees to use the camera</label>
          <label className="check"><input type="checkbox" checked={b} onChange={(e) => setB(e.target.checked)} />Participant B agrees to use the camera</label>
        </fieldset>

        <fieldset className="consent-group">
          <legend>Sound</legend>
          <div className="seg" role="radiogroup" aria-label="Sound input">
            {(['off', 'mic', 'sim'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={audio === m} className={`seg-btn ${audio === m ? 'on' : ''}`} onClick={() => setAudio(m)}>
                {m === 'off' ? 'No sound' : m === 'mic' ? 'Shared microphone' : 'Simulated audio (demo)'}
              </button>
            ))}
          </div>
          {audio === 'mic' && (
            <label className="check"><input type="checkbox" checked={micOk} onChange={(e) => setMicOk(e.target.checked)} />Both participants agree to the shared microphone</label>
          )}
          <p className="fine">One microphone hears both of you mixed. It measures loudness, frequency, pitch and rhythm of the shared sound only. It cannot tell who is speaking unless you set the speaker turn by hand. Sound is never recorded or played back.</p>
        </fieldset>

        <fieldset className="consent-group">
          <legend>Cloud services (optional)</legend>
          <label className={`check ${ai.available ? '' : 'disabled'}`}>
            <input type="checkbox" disabled={!ai.available} checked={aiOk} onChange={(e) => setAiOk(e.target.checked)} />
            {ai.available
              ? `Both agree to send our typed / dictated text to ${ai.provider} (${ai.model}) through this computer's server, for translation, topics and a summary`
              : 'Cloud AI unavailable — no API key on the server. Local demo mode: lexicon keywords, demo gloss, data-only summary.'}
          </label>
          <label className={`check ${voiceAvailable ? '' : 'disabled'}`}>
            <input type="checkbox" disabled={!voiceAvailable} checked={voiceOk} onChange={(e) => setVoiceOk(e.target.checked)} />
            {voiceAvailable
              ? `Both agree to voice clips: while one of us holds "hold to speak", that short recording is uploaded once through this computer's server to OpenAI (${ai.transcribe?.model}) to transcribe it and detect its language. Clips are not stored.`
              : 'Automatic multilingual speech recognition unavailable — no transcription key on the server.'}
          </label>
          <label className={`check ${speechAvailable ? '' : 'disabled'}`}>
            <input type="checkbox" disabled={!speechAvailable} checked={speechOk} onChange={(e) => setSpeechOk(e.target.checked)} />
            {speechAvailable
              ? "Both agree to dictation: click mic to start and stop; this browser sends audio to its vendor's cloud service"
              : 'Dictation unavailable in this browser — typing works.'}
          </label>
        </fieldset>

        <label className={`check ${recordSupported ? '' : 'disabled'}`}>
          <input type="checkbox" disabled={!recordSupported} checked={record && recordSupported} onChange={(e) => setRecord(e.target.checked)} />
          {recordSupported ? 'Record the Story Film (the canvas + two-sided subtitles; no camera image, no microphone sound; kept on this device until you download it)' : 'Video recording is not supported in this browser — PNG export still works.'}
        </label>

        <div className="privacy">
          <b>Your data.</b> Camera images and sound features are analysed locally. Raw camera video is never saved or uploaded.
          Voice clips or dictation send audio to the configured provider only with the separate consent above; clips stay in memory and are discarded after transcription.
          Text leaves this device only if you both enable cloud AI. Story Film contains only the art and subtitles. Reader feedback is self-reported.
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="consent-actions">
          <button className="btn primary" disabled={!(a && b) || !audioReady} onClick={() => go('camera')}>Begin with camera</button>
          <button className="btn" disabled={!audioReady} onClick={() => go('sim')}>Mouse / touch mode (simulated body)</button>
        </div>
      </div>
    </div>
  );
}
