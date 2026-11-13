# The Babel — A Place Between Us

*Two Languages. Two Stories. One Shared Place.*
The Babel explores a simple question: can two people who do not share a common language create a sense of belonging together?

Inspired by the story of the Tower of Babel, where differences in language interrupted collective creation, our project reimagines what happens when those differences become the foundation of a new shared experience.

Two participants express what home means to them through their own languages, voices, movements, and gestures. Their expressions appear as distinct visual forms: blue lines on white and white ribbons on blue. Each sees the other's words in their own language, with every translation labelled by where it came from. As they exchange ideas, respond to each other, and transform each other's symbols, their separate visual worlds begin to connect.

Together, they construct a shared sanctuary shaped by their individual stories and interactions. The result is not a perfect translation, but a unique record of two people attempting to understand, respond, and create together.

Each encounter leaves behind three artifacts: a **Story Film** of the creative process, an **Artistic Portrait** of their collaborative artwork, and a **Communication Portrait** documenting how the interaction unfolded.

The Babel does not ask people to become the same. It invites them to build something together while remaining different.

### How it works

Two university students who don't share a fluent language meet for the first time at one screen. Each speaks or writes in their own language (中文 / English / 日本語 / Español); the other side of the screen shows it in theirs. They answer each other, pass words and symbols back and forth, and move together — and all of it becomes one artwork in a **Cobalt Signal Collage** style: **A is blue on white**, **B is white on blue**.

**Express → Understand → Respond → Co-Create → Reflect.** Every session leaves three outputs: a **Story Film** (video of the artwork being made, with two-sided subtitles), an **Artistic Portrait** (pure PNG) and a **Communication Portrait** (what was said, how it was translated, who responded to what, computed statistics).

See **DEMO.md** for the 90-second judge demo (中文 ↔ Español), the fallback ladder, likely judge questions and the submission checklist, and **HANDOFF.md** for what was verified, known issues and test tools.

(The folder is still `between-us`; the project is The Babel.)

## Run

```bash
cd ~/Desktop/between-us
npm run build
npm run dev
```

Open http://localhost:5173/. Dependencies and the local lite pose model were present during the Mac QA on 2026-10-24. Only if dependencies are missing, run `npm install`; only if the local pose model is missing, run `npm run fetch-model`. For the built app, run `npm run preview` and open the URL it prints. The AI proxy runs with both dev and preview; a static host serving only `dist/` has no AI proxy.

### Optional cloud AI (translation, topics, narrative)

```bash
cp .env.example .env.local
# DeepSeek:  DEEPSEEK_API_KEY=sk-...            (model defaults to deepseek-flash)
# OpenAI:    OPENAI_API_KEY=sk-...  AI_MODEL=<a current model id>
npm run dev
```

The key is read by the Vite server (`server/aiProxy.mjs`) and never reaches the browser. The proxy answers only same-origin requests. Without a key — or if the provider fails — everything runs in **local demo mode**: lexicon keywords, a clearly labelled *demo gloss*, local shared-topic detection, and the data-template summary.

## Interaction flow

**Express → Understand → Respond → Co-Create → Reflect**

- **Bilingual Exchange Bridge** (the strip under the canvas). The speaker's side shows what they said in their language, with how it got there (TYPED / HEARD · TRANSCRIBED, language chosen / guessed / heard). The other side shows it in the reader's language, labelled by where the translation came from: **AI TRANSLATION**, **PHRASEBOOK · PRE-TRANSLATED** (human-written phrases for the demo prompt), **DEMO GLOSS · KEYWORDS ONLY** (no API: a keyword list, not a translation), or **EDITED BY A PERSON**. The language of a message can be corrected and any translation fixed by hand.
- **Understand.** The reader can mark *I follow* or *unclear*. These are self-reports, stored and shown as such — never a measurement. *unclear* shows the speaker "try saying it another way".
- **Respond.** *respond ↩* links the reader's next message to what it answers (shown as "↳ responding to …" in the bridge, the film and the transcript, with response latency in the report).
- **Send & Catch.** Words become elements (HOME → house · HOPE → halo · NATURE → tree · FREEDOM → wings · CONNECTION → bridge; symbols and shared topics too). *send these words as a gift* (or *Send →* in a composer) flies the element **with the sentence on it** to the other person. They catch it by hand (0.5 s reach) or with *Catch*, can **add their own words to it** (a linked response that becomes a caption on the gift), rotate / resize / add their texture, then *place* it in the painting or *send it back*. Uncaught gifts settle after 15 s; held gifts are placed after 90 s idle — nothing hangs. Every step is an event.
- **Shared Sanctuary** (toolbar). A parametric house inside a bilingual medallion; **A's hand drives the left wing, B's the right**; moving together grows halo → rays → stars. Topics change geometry (HOPE → halo, NATURE → trees, CONNECTION → bridge, FREEDOM → feathers). *Seal* stamps it into the ink.
- **Guided experience** ("What makes you feel at home?") or **Free canvas**, chosen at the start.
- **Presentation** (*Present* or P): fullscreen artwork, large two-sided subtitles with source labels, and a small A / B / Shared legend. Controls and translation-edit buttons are hidden. Esc or *Show controls* returns. At a 1512 px viewport, subtitles are about 39 px; normal-mode subtitles are 24–32 px.
- **Toolbar** is minimal: Pause · Sanctuary · Present · More ▾ (body / sound inputs, Story Film recording, PNG, data marks, data panel, clear) · End session. The data panel and marks are off by default.

## Voice: automatic multilingual speech recognition

**Hold to speak** in your own composer (pointer or Space/Enter on the button), release when done; clips under 0.6 s are discarded. The short clip is uploaded once (both participants must agree at the start) through the local server to OpenAI `/audio/transcriptions`, which **detects the language automatically** — no language preset. The transcript appears in that person's box with the detected language ("heard: 日本語"), and is sent after 4 s unless you click to edit it or correct the language. Then the usual pipeline runs: translation into the other person's language, keywords, shared topics, elements, motifs.

- Identity is explicit: whoever holds *hold to speak* is the speaker (manual turn) — a shared microphone cannot separate two people talking at once.
- After sending, the language of the last message can still be corrected, and any translation edited (labelled EDITED).
- Without a transcription key: the browser's dictation (language preset, separate consent) if available, otherwise typing. Everything else keeps working.
- Server config: `OPENAI_API_KEY` (or `TRANSCRIBE_API_KEY`), `AI_TRANSCRIBE_MODEL` (default `gpt-transcribe`; `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` also work). DeepSeek has no speech endpoint, so voice needs an OpenAI-compatible key even if text AI uses DeepSeek.
- Future work: low-latency streaming transcription; two microphones for per-person audio.

## Inputs (independent, switchable while running)

| Input | Real | Simulated / local (always labelled) |
|---|---|---|
| Body | Camera → MediaPipe Pose, 2 people | Mouse / touch (A = you, B mirrors; two fingers = two people) |
| Sound | One shared microphone | Speech-like audio sim (hold **V** to "speak") |
| Voice attribution | Shared by default | **Manual turn**: "A speaking" / "B speaking" (keys 1 / 2, 0 = shared) |
| Text | Each person types in zh / en / ja / es; auto-detect with one-click correction | — |
| Dictation | Browser speech recognition (cloud, separate consent) | typing |
| Semantics | Cloud AI (consent + server key) | Local lexicon (~38 concepts × 4 languages) |

Every real input asks both participants for consent. Turning an input off or ending a session releases it (tracks stopped, AudioContext closed). Pending transcription and conversation AI requests are cancelled at session end. The completed artwork stops rendering behind the results. *Back to canvas* resumes the existing session and reopens its selected devices under the consent already given; *New session* returns to fresh consent.

## How data becomes the artwork

| Data | Visual |
|---|---|
| **Body** wrist position / speed | A: cobalt pen line with hatching ○ · B: white ribbon with halftone ■ · speed → wave amplitude |
| Ink density (40 px cells) | where a spot already holds a lot of ink, new pen / ribbon ink is lighter (half strength after ~160 passes, never below 22 %), recovering over ~45 s — keeps the newest exchange readable without erasing anything |
| Stillness | nothing drawn → negative space |
| Both wrists raised | wings unfold at that person |
| **Voice** RMS | stroke width ×1–3.2, brighter ink |
| Low / high band | sound-ring scale / stipple grain |
| Pitch (F0) | wave tint and finer ripple (a signal measurement, not emotion) |
| Rhythm (onsets/s) | ring cadence |
| Shared mic vs. manual turn | one bilingual shared wave vs. that person's wave style |
| Silence | voice layer dissolves |
| **Language** typed / dictated text | typography on the writer's side + translation (AI or DEMO GLOSS) |
| Shared topic | shared motif: flower + the topic's symbol + bilingual label |
| **Interaction** hands < 0.30 apart | weave bridge; weave start → shared shape (half hatching / half halftone) + halo |
| Path crossing | star + registration mark |
| Sustained simultaneous motion | symmetrical unfolding |
| Shapes, motifs, shared symbols | white and blue grounds fuse further |
| **User choice** | symbol palette: wings · halo · rays · eye · star · flower · feather · unfold |

Symbols are triggered only by user choice, measured events, or topics in what people wrote — never inferred from culture, religion or language identity.

## Data → Art: two worked examples

The result screen and the JSON report (`evidence`) rebuild these two chains from **this session's** events — nothing is a mock-up.

**1 · Hands → shared shapes** (`src/analysis/interaction.ts`, `src/engine/weavingEngine.ts`)
1. Camera: MediaPipe Pose (2 people, in the browser) → wrist landmarks → One Euro filter → A/B identity by nearest previous body centre. (Mouse sim: the pointer and its mirror, labelled SIMULATED.)
2. `d` = smallest distance between an A hand and a B hand, in frame heights (frame 1600 × 900).
3. `weave = smoothstep((0.30 − d) / (0.30 − 0.09))`, eased over ~0.25 s.
4. `weave > 0.55` → event `weave_start` → a shared disc (R 30) at the hands' midpoint, rotated along A→B: left half A's hatching on paper, right half B's halftone on cobalt, plus a shared halo. While weaving, a smaller disc every 2.2 s; rings = 2 + round(3 × motion synchrony). Each disc adds 0.025 to the fusion of the two grounds.

**2 · Words → concepts → geometry** (`src/lang/lexicon.ts`, `src/lang/conversation.ts`, `src/engine/sanctuary.ts`)
1. Words arrive typed, picked from the phrasebook, or transcribed from a consented voice clip.
2. A hand-built lexicon (~38 concepts × zh / en / ja / es) finds concepts (substring for zh / ja with ≥ 2-character cross-language forms; whole words for en / es).
3. Concept → category → element: HOME → house · HOPE → halo · NATURE → tree · FREEDOM → wings · CONNECTION → bridge. The element enters the writer's *my elements* (sendable as a gift) and the Sanctuary's geometry (HOPE adds a halo ring, NATURE trees, CONNECTION a bridge, FREEDOM feathers).
4. The same concept in both people's words within 180 s → a shared topic motif; topic overlap = Jaccard similarity of the two concept sets. With cloud AI, AI topics are added and labelled AI.

## Responsible design

- **Consent per input:** camera (A and B tick separately), shared microphone, cloud AI text, voice-clip upload, browser dictation — each off until both agree.
- **No raw media kept:** pose runs in the browser; no camera frame is saved or uploaded. Voice clips are uploaded once for transcription and held only in memory. The Story Film has no camera image and no audio track.
- **Provenance everywhere:** AI TRANSLATION · PHRASEBOOK · DEMO GLOSS · EDITED BY A PERSON; TYPED · HEARD · DICTATED; SIMULATED body / sound; AI-GENERATED summary.
- **No inference about people:** no facial-expression or emotion analysis, no symbols chosen from culture, religion or language. "I follow / unclear" are reader self-reports, never a score.
- **Control:** pause, switch camera → mouse or microphone → off at any time (tracks released), correct languages and translations, export a **counts-only** report without any words, and *New session · clear this one* clears everything from memory. Nothing is stored server-side.
- **Not colour alone:** A ○ / B ■ / Shared ◇ markers and letters on every label; everything is reachable by buttons and keyboard (hold-to-speak works with Space / Enter).

## Outputs (three per session)

1. **Story Film** (`.webm`, VP9 → VP8 → MP4 fallback). Recorded if chosen at the start (default on) or via More ▾ → ● Record Story Film. It is the artwork canvas plus a film overlay drawn only into the recording (`src/export/film.ts`): a bilingual title card, two-sided subtitles (original on the speaker's side, translation + its source label on the other), a ticker of key events (sent / caught / answered on the gift / shared topic / sanctuary stages / self-reports) and an end card of counted facts. **No camera image and no microphone sound** — the stream has no audio track.
2. **Artistic Portrait** (PNG). Pure artwork: no UI, subtitles or labels. A version with data marks can still be previewed / downloaded.
3. **Communication Portrait** (result screen + JSON, with or without conversation text). The transcript (original, translation with source, input mode, how the language was determined, corrections, reply links, reader self-reports), responses (count, on gifts, latency, pairs), translation-source counts, Send & Catch counts, sanctuary, contributions, timeline, event counts, data → art mapping and the two worked examples above, a zh/en data-template summary, and an optional AI narrative (labelled AI-GENERATED).

All statistics are computed by `src/report/report.ts`. The AI narrative is stored separately (`aiSummary`) and is told to use only those numbers and never judge emotions or understanding.

## Data

Events: `{timestamp, type, participantId, source, features}`; `source` ∈ `pose | mouse_sim | mic | audio_sim | text | speech | user | derived | ai | system`. Bounded: 2000 events, 900 one-second summaries, 60 s live timeline. No audio, video or images are stored.

## Keys

Space pause · R reset · S PNG · G marks · D data · H hide UI · P present (Esc exits) · M partner (mouse sim) · V speak (audio sim) · 0 / 1 / 2 voice turn. Shortcuts are ignored while typing.

## Architecture

```
server/aiProxy.mjs   Vite middleware: /api/ai/status | analyze | summary | transcribe (OpenAI-compatible; keys from env)
src/
  tracking/  input/  audio/          pose, mouse sim, mic (RMS, bands, F0, rhythm), audio sim
  analysis/interaction.ts            distance, approach, weave, sync, crossings, voice+motion, events
  lang/                              languages + detection, lexicon, phrasebook, conversation (replies, self-reports), voice clips, dictation
  ai/client.ts                       browser client for the proxy (falls back on any failure)
  engine/                            weavingEngine, gifts (Send & Catch), sanctuary, symbols, paper, overlay, palette
  export/recorder.ts, film.ts         Story Film recorder + subtitle/ticker overlay
  report/                            Communication Portrait
  ui/                                consent, SubtitleBridge, conversation bar (composers, gifts), guide, data panel, result screen
```

## Honest limits / future work

- One shared microphone cannot tell speakers apart; per-person voices exist only as manual turns. **Future:** two microphones.
- Auto language detection is heuristic (kanji-only Japanese reads as Chinese; very short text is unreliable) — always correctable.
- Without an API, only the 12 phrasebook phrases get real translations; anything else gets a keyword-only demo gloss, clearly labelled.
- The local lexicon covers ~38 everyday concepts; its "demo gloss" is not a translation.
- Dictation depends on the browser (Chrome / Edge / Safari) and its cloud service.
- Chrome's WebM files carry no duration header; the in-app player fixes this, some desktop players may show no length.
- **Not implemented:** face geometry / facial expression shapes; per-person audio separation; streaming transcription; advanced semantics beyond topics.
- Nothing here measures emotion, personality or how well two people understand each other.


## 90-second BU demonstration

The full script is in **DEMO.md**: A = 中文, B = Español — Express → Understand → Respond → Send & Catch → Shared Sanctuary → three outputs, in **AI mode** (hold-to-speak + AI translation) or the clearly labelled **fallback mode** (phrasebook phrases, mouse/touch). Say which mode is running. Without a key, free text is only **DEMO GLOSS · KEYWORDS ONLY**; use live-AI wording only after an actual provider test. A 90-second talk does not require the sanctuary to reach 100%.

## Final QA — 2026-10-24

```bash
npm run test:qa
npm run build
```

Ten synthetic regression checks cover a zh ↔ es report with evidence, lexicon false positives, four-language phrasebook output, replies/self-reports, failed or late AI responses, language-correction races, voice/microphone startup cancellation, idempotent recorder shutdown, proxy configuration and origin protection. They do not use real people, live speech, or paid provider calls.

Mac production-preview verification also exercised four languages, manual translation editing, Send & Catch (one catch by simulated hand and one by button), Sanctuary, Presentation, pause/end, all three downloads, Back to canvas, and New session. No console warnings/errors were observed in these flows. The sample downloaded film has one VP9 video track at 1600×900 and **zero audio tracks**; the sample PNG is 2400×1350. These dimensions reflect that test device and viewport.

**Still required before judging:** two people with the real camera and microphone; check framing and A/B stability, actual transcription/translation with a configured key, and playback on the presentation computer. The checked-in test harness uses fake devices/providers and cannot establish real speech quality or live translation availability. No `.env.local` or API key was present during this QA.

AI keys: `AI_PROVIDER`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, optional `AI_API_KEY` override, `AI_MODEL`, `AI_BASE_URL`; speech: `TRANSCRIBE_API_KEY`, `TRANSCRIBE_BASE_URL`, `AI_TRANSCRIBE_MODEL`. OpenAI chat requires an explicit `AI_MODEL`; speech defaults to `gpt-transcribe`. DeepSeek text defaults to `deepseek-flash`. Both key availability and model support still depend on the actual account. Config changes require restarting dev/preview. All keys remain on the server and must never use a `VITE_` prefix.

Model references checked on 2026-10-24: [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [DeepSeek API configuration](https://api-docs.deepseek.com/quick_start/agent_integrations/). `deepseek-v4-flash` is a legacy alias accepted by DeepSeek; the default now follows its documented `deepseek-flash` alias. Explicit `AI_MODEL` settings are preserved.
