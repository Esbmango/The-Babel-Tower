# The Babel — A Place Between Us · 90-second judge demo

Two people, one screen. **A speaks 中文, B speaks Español.** Express → Understand → Respond → Co-Create → Reflect.

**Our setup: DeepSeek for all AI text** (translation, shared topics, AI summary). DeepSeek has no speech-to-text, so voice input uses **Chrome's built-in dictation** (the *mic* button in each composer), not the cloud *hold to speak*. `.env.local` already contains `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY=…`, `AI_MODEL=deepseek-flash`.

## Before the judges arrive (5 min)

1. `npm run build && npm run preview` (or `npm run dev`). Open **Chrome**, full window, ≥ 1280 × 720.
2. Terminal line on start tells you the mode: `deepseek · deepseek-flash (key loaded from server env)` = **AI mode**; `no API key — app runs in local demo mode` = **Fallback mode**. Use **real Chrome** (not the Claude app's browser pane) — dictation needs Chrome's speech service.
3. Do one 20-second dry run, press **New session · clear this one**, and you are back at the start screen.
4. Have a second person ready as B. If the room is loud, use **Fallback mode** (phrases) — it is fully labelled and never depends on the network.

## Start screen (10 s, before the clock)

- Experience: **Free canvas**. Languages: **A = 中文, B = Español**.
- Camera: both tick "agrees to use the camera" → **Camera**. (No camera / bad light → **Mouse / touch**; it is labelled SIMULATED everywhere.)
- AI mode: both tick **cloud AI** (DeepSeek translation) and **dictation** (Chrome sends the audio to its speech service while the mic is on). The *voice clips* box stays greyed out — that is expected with DeepSeek only.
- Leave **Record the Story Film** ticked.

## The 90 seconds

| Time | Step | Who does what | What the judges should see |
|---|---|---|---|
| 0–15 s | **Express** | **A** clicks **mic**, says **"我最想念外婆家的院子，夏天有很多花。"**, clicks **stop**, checks the text, **Send** (or types it). *(Fallback: A opens **phrases ▸** → "妈妈做的饭让我有家的感觉。" → Send.)* | A's side of the subtitle bridge: the original Chinese, `DICTATED` (or `TYPED`). The A ink writes the words on the white half. |
| 15–30 s | **Understand** | **B** reads her side and taps **I follow**. | B's side: the Spanish, labelled **AI TRANSLATION** (or **PHRASEBOOK · PRE-TRANSLATED**). Step tracker moves to *Respond*. Point out the label: *translations can be wrong — check with each other*. |
| 30–45 s | **Respond** | **B** taps **respond ↩**, clicks **mic**: **"A mí también me encantan los jardines de mi abuela."** → stop → **Send** (B's composer language must be Español). *(Fallback: phrases ▸ "Yo también." → Send.)* | A's side now shows Chinese with its source label; B's side shows "↳ responding to A: …". |
| 45–65 s | **Co-Create: Send & Catch** | **B** taps **send these words as a gift → A**. A reaches a hand to it for half a second (or taps **Catch**), taps **+ my texture**, types "谢谢你的分享。" in the gift box → add, then **send back ↩**. B catches and taps **place**. | A token disc with B's words flies across; it gains A's hatching; A's words appear as a caption; it lands in the painting. |
| 65–80 s | **Co-Create: Shared Sanctuary** | Tap **Sanctuary**. Both raise and move hands: A's hand opens the **left** wing, B's the **right**; moving together grows house → halo → rays. | Live captions under the medallion: "A ○ hand height opens this wing · n feathers", "SHARED ◇ roof · 40% · grows faster when you both move". |
| 80–90 s | **Reflect** | **End session** (≈ 3 s end card). | ① **Story Film** ② **Artistic Portrait** ③ **Communication Portrait** with the transcript, responses, self-reports, and **Data → Art: two worked examples** from this session. |

If there's time: **Present** (P) shows the artwork full-screen with the bilingual subtitles and the step tracker; Esc returns.

## What to say (one line each)

- **Opening (10 s, before 0:00):** "The Babel asks one question: can two people who don't share a language create a sense of belonging together? It doesn't ask them to become the same — it invites them to build a place between them."

- "Every translation carries its source: AI, pre-translated phrase, keyword gloss, or edited by a person."
- "'I follow' and 'unclear' are self-reports. The app never claims they understood each other."
- "No camera video or microphone audio is saved. The Story Film is only the canvas and the subtitles."
- "Hands closer than 0.3 frame-heights start a weave → a shared disc, half A's hatching, half B's halftone."

## Fallback ladder (if something fails live)

| Problem | Do this | Still honest because… |
|---|---|---|
| Dictation fails ("network" / no mic button) | Type, or use **phrases ▸**; check you are in Chrome and ticked dictation consent | Labelled TYPED + PHRASEBOOK |
| DeepSeek slow / error | The phrase or keyword gloss stays on screen; wait, or use phrases | Labelled DEMO GLOSS / PHRASEBOOK, error shown in the mode badge |
| No API at all | Restart without key → local demo mode | Mode badge says "Local demo · no AI" |
| Camera fails / dark room | More ▾ → body **mouse sim** | Labelled SIMULATED in UI, film and report |
| Mic denied | Type; More ▾ → sound **off** | Voice features show "off" |
| Gift won't catch by hand | Tap **Catch** | Report counts hand vs button catches |
| Story Film missing | PNG + JSON still export | Result screen says why |

---

## Judges' likely questions — answers grounded in the code

**1. "How do you know they actually understood each other?"**
We don't, and the app never claims it. The reader can tap *I follow* / *unclear*; those are stored and shown as **self-reports** (`selfReports` in the report). Translations are labelled by source, and the end card says "Counts of what happened — not a measure of understanding."

**2. "What is the data science here — is it just a pretty animation?"**
The canvas is a deterministic function of measured signals. For example: MediaPipe Pose wrists → One Euro filter → A/B by nearest body centre → `d` = closest A–B hand distance in frame heights → `weave = smoothstep((0.30 − d)/(0.30 − 0.09))` → at weave > 0.55 a `weave_start` event and a shared disc at the hands' midpoint. Words → a 4-language lexicon → concept → category (HOME → house, HOPE → halo …) → geometry, and a concept in both people's words within 180 s → shared topic (Jaccard overlap). The result screen shows both chains with this session's actual timestamps and values.

**3. "What happens without internet / an API key?"**
Everything except cloud translation and cloud transcription works locally: pose tracking, the art, Send & Catch, the Sanctuary, all three outputs. Text gets a human-written phrasebook translation (12 phrases × 4 languages) or a clearly labelled keyword gloss. The mode badge says which mode is on.

**4. "What about privacy? You're filming students."**
Pose runs in the browser; no video frame is saved or uploaded. The camera, microphone, cloud AI and voice clips each need consent from both people. Voice clips are uploaded once for transcription and are kept only in memory. The Story Film has no camera image and no audio track. There's a **counts-only** report export with no words, and *New session* clears everything from memory.

**5. "How does it know who is speaking with one microphone?"**
It doesn't pretend to. Whoever holds *hold to speak* is the speaker, which is an explicit turn. Otherwise the microphone is labelled "shared". Separating two simultaneous voices is listed as future work (two microphones).

---

## GitHub / Devpost submission checklist

- [ ] `npm run build` passes on the submission machine; `npm run test:qa` passes.
- [ ] `.env` / `.env.local` **not** committed (`git status` before push; `.gitignore` covers them). No key in screenshots or video.
- [ ] `public/mediapipe` is generated by `npm install` (git-ignored); `public/models/pose_landmarker_lite.task` committed **or** README says `npm run fetch-model`.
- [ ] README: one-paragraph pitch, run steps, AI optional, **Responsible design** and **Limits** sections, Data → Art evidence.
- [ ] Demo video (≤ the track's limit): the 90-second path above, real camera, with one Story Film clip and the result screen. Say on camera which mode (AI or fallback) was used.
- [ ] Screenshots: subtitle bridge (zh ↔ es), Sanctuary with wing captions, Present mode, result screen evidence cards.
- [ ] Devpost "How we built it": Vite + React + TypeScript, MediaPipe Pose (in-browser), Web Audio features, Canvas 2D, MediaRecorder, optional OpenAI-compatible proxy (OpenAI / DeepSeek) with server-side keys.
- [ ] Devpost "Challenges / limits": honest list from README (no speaker separation, phrasebook-only offline translation, real-API path tested only with a fake provider unless you test it yourself).
- [ ] Credit: MediaPipe (Apache 2.0), fonts are system fonts, no third-party artwork.
- [ ] Team names, track (**Art & Design**), and the repo link is public.
