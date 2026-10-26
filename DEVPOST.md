# Devpost draft — The Babel: A Place Between Us

Copy each section into the matching Devpost field. Every technical claim below is implemented in this repo; the last section lists what was *not* tested so the write-up stays honest.

---

## Tagline (≤ 200 chars)

Two languages, two stories, one shared place: two people without a common language express, respond and co-create one artwork — and leave with a film, a portrait and a record of how they connected.

## Inspiration

In the story of the Tower of Babel, differences in language interrupted collective creation. On a campus like BU, that story repeats in small ways every day: two students sit next to each other, both far from home, and the language gap makes a first conversation feel impossible.

We asked a simple question: **can two people who do not share a common language create a sense of belonging together?** Instead of hiding their differences behind a perfect translation, The Babel makes the differences visible. They become the material for something the two people build together.

## What it does

Two participants share one screen and one prompt: **"What makes you feel at home?"**

- **Express.** Each person answers in their own language (中文 · English · 日本語 · Español) by speaking (browser dictation), typing, or picking a phrase. Their movement, voice and words become distinct visual forms: **A draws blue lines on white, B white ribbons on blue**.
- **Understand.** A two-sided subtitle bridge shows the original on the speaker's side and a translation on the reader's side. Every translation is labelled **AI**, **pre-translated phrase**, **keyword gloss** or **edited by a person**. The reader can tap *I follow* or *unclear*; these are self-reports, never a score.
- **Respond.** A reply is linked to what it answers. Words can be **sent as a gift**: a token carrying the sentence flies to the other person. They catch it with a reach of the hand, add their own words and texture, and send it back or place it in the painting.
- **Co-Create.** In the **Shared Sanctuary**, A's hand opens the left wing and B's the right, and moving together grows a shared house, halo and rays. Topics from their words shape the geometry: home → house, hope → halo, nature → trees, connection → bridge.
- **Reflect.** Each encounter leaves three artifacts:
  - a **Story Film** of the creative process with bilingual subtitles (no camera image, no audio);
  - an **Artistic Portrait** (the pure artwork);
  - a **Communication Portrait**: what was said, how it was translated, who responded to what, and two worked *data → art* examples from that session.

The Babel does not ask people to become the same. It invites them to build something together while remaining different.

## How we built it

- **Frontend:** Vite + React + TypeScript; Canvas 2D on a fixed 1600 × 900 art frame (Cobalt Signal Collage style: halftone, hatching, paper and cobalt grounds).
- **Body:** MediaPipe Pose (two people, in the browser, GPU → CPU fallback) → wrist landmarks → One Euro filter → A/B identity by nearest body centre. A mouse/touch simulation is available and labelled SIMULATED.
- **Sound:** Web Audio features from one shared microphone: loudness, frequency bands, pitch by autocorrelation, onset rhythm. Speaker identity comes only from explicit hold-to-speak turns.
- **Language:** a hand-built 4-language lexicon (~38 concepts) and a 12-phrase human-translated phrasebook for offline use. With consent, a server-side proxy calls **DeepSeek** (`deepseek-flash`) for translation, shared-topic detection and the optional AI summary; the proxy is OpenAI-compatible, and an optional OpenAI transcription path (hold to speak, automatic language detection) is built in but not used in our demo. Voice input in the demo uses the browser's dictation. API keys stay on the server.
- **Data → Art (deterministic):** `d` = closest A–B hand distance in frame heights; `weave = smoothstep((0.30 − d)/(0.30 − 0.09))`; at weave > 0.55 a shared disc appears at the hands' midpoint, half A's hatching, half B's halftone. A concept appearing in both people's words within 180 s becomes a shared topic motif, with overlap measured as Jaccard similarity.
- **Outputs:** MediaRecorder on a separate art-only canvas with a subtitle overlay; PNG export; a JSON report computed by code (not by an LLM), also exportable as counts only with no words.
- **Quality:** a TypeScript build, 10 Node regression tests, and a headless two-person Playwright scenario (中文 ↔ Español) with fake camera, fake microphone and a fake AI provider.

## Challenges we ran into

- **Honesty versus magic.** Translation fails, and one microphone cannot tell two voices apart. We chose to label everything (translation source, simulated inputs, self-reports) rather than pretend.
- **Making co-creation legible.** Early versions became a tangle of lines. We added ink saturation, where dense areas take lighter ink, and live captions that show which hand drives which wing.
- **Working without the internet.** The core experience had to run with no API key, so we wrote a human-translated phrasebook and a clearly labelled keyword-gloss fallback.
- **Privacy by design.** Pose runs in the browser. Voice clips are uploaded only with both people's consent and are held in memory. The Story Film has no camera image or audio track.

## Accomplishments that we're proud of

- A complete loop for two strangers, from expressing to reflecting, that also works offline.
- Every pixel of the shared artwork traces back to a measured signal or a choice someone made, and the report shows the chain for that session.
- Responsible design is built into the interface itself: consent per input, provenance labels, self-reports instead of "understanding scores", and a text-free export.

## What we learned

The most useful translation interface is not the most fluent one. It is the one that shows where its words came from and invites the other person to check, respond and build. Visualising *how* two people tried to connect turned out to be more meaningful than claiming *that* they understood each other.

## What's next for The Babel

- Two microphones for per-person voice, and streaming transcription.
- A larger, community-written phrasebook for more languages.
- Studying with students whether the shared artwork changes how a first conversation feels, with consent and without measuring emotions.

## Built with

`typescript` `react` `vite` `canvas` `mediapipe` `web-audio-api` `mediarecorder` `openai-api` `deepseek` `node.js` `playwright`

---

## Honesty notes (keep these true when you post)

- Say in the video which mode is shown: **AI mode** (real key) or **fallback mode** (phrasebook + mouse simulation).
- Real-camera, real-microphone and real-API runs must be tested by you before you claim them. The repo's automated tests use fake devices and a fake AI provider.
- Do not describe *I follow* counts as measured understanding.
