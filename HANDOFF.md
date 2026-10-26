# The Babel — BU Final QA & Presentation Handoff

2026-10-24 · version 0.4.0 · existing folder `/Users/ethanshan/Desktop/between-us` · Vite 5 / React 18 / TypeScript 5.6. No new runtime dependencies. This handoff targets Boston University DS+X Hackathon 2026 — Art & Design Track.

**Different Expressions. One Shared Creation.** Two people express, check the basic meaning, respond, co-create, and reflect. The exchange becomes the artwork.

## Judging optimization sprint (latest — after the Mac QA below)

Started from the Codex version on the Mac (its 18 changed files were merged unchanged: voice/recorder/mic resource safety, stale-AI guards, presentation bridge, larger subtitles, `deepseek-flash` default, `tests/final-qa.mjs`). Then, without new feature systems:

| Area | Change | Files |
|---|---|---|
| Art clarity | **Ink saturation**: pen / ribbon ink gets lighter where a 40 px cell is already dense (half strength after ~160 passes, floor 22 %, relaxes over ~45 s) — no tangles, nothing erased | `engine/weavingEngine.ts` |
| Art clarity | Sanctuary **live captions**: "A ○ hand height opens this wing · n feathers", "SHARED ◇ stage · % · grows faster when you both move" (not sealed or exported) | `engine/sanctuary.ts` |
| UX | **Flow tracker** Express → Understand → Respond → Co-Create → Reflect with one plain next action; also in Present mode | `ui/ConversationBar.tsx`, `App.tsx` |
| UX | **Mode badge**: "AI translation · provider" or "Local demo · no AI — phrasebook = real translation · other text = keyword gloss" (replaces the technical note) | same |
| Evidence | Report `evidence` + result-screen cards: **hands → shared shapes** and **words → concepts → geometry**, built from this session's events and the code's real constants | `report/report.ts`, `ui/ResultScreen.tsx` |
| Ethics | **Counts-only JSON** (no words) export; privacy strip; *New session · clear this one* | `App.tsx`, `ui/ResultScreen.tsx` |
| Fix | Lexicon false positives: 夏天 ≠ sky, 有空 ≠ sky (cross-language CJK forms need ≥ 2 chars) | `lang/lexicon.ts` |
| Fix | `engine.start()` idempotent (no double animation loop after Back to canvas) | `engine/weavingEngine.ts` |
| Tests | +2 QA tests (lexicon, zh↔es report/evidence); `tests/harness/demo_path.py` | `tests/` |
| Docs | **DEMO.md** (90 s script, fallback ladder, judge Q&A, submission checklist); README *Data → Art* and *Responsible design* | |

| Story | Title "The Babel — A Place Between Us", tagline "Two Languages. Two Stories. One Shared Place." in README, start screen, page title, Story Film title/end card; **DEVPOST.md** draft | |

**Verified:** `tsc` + `vite build` (Linux copy of the repo with fresh `npm ci`), `npm run test:qa` 10/10, `demo_path.py` in no-key and fake-AI modes.
**Not verified (needs people / keys):** real camera with two people, real microphone + hold-to-speak, real OpenAI transcription of Chinese and Spanish speech, real DeepSeek/OpenAI translation quality.

## Start on this Mac

```bash
cd ~/Desktop/between-us
npm run build
npm run dev
```

Open http://localhost:5173/. If dependencies are missing, run `npm install`. If the local model is missing, run `npm run fetch-model`. Both dependencies and `public/models/pose_landmarker_lite.task` were already present. Do not move or recreate the project.

For the built app, `npm run preview` serves `dist/` with the same AI proxy. Static hosting alone does not provide `/api/ai/*`. Model/runtime files are local; the optional full model can fall back to a remote download if it has not been fetched.

## What was actually verified

| Check | Current result |
|---|---|
| Mac `npm run build` (TypeScript + Vite production) | PASS |
| `npm run test:qa` | PASS — 8 synthetic regression checks at Mac QA; 10 after the judging sprint |
| Production app in the Codex in-app browser | PASS for the flows below; no console warnings/errors observed |
| 中文 / English / 日本語 / Español typed input | PASS; phrasebook translations in both directions |
| Translation provenance | PASS: PHRASEBOOK, DEMO GLOSS, EDITED BY A PERSON; fake-provider AI path separately checked |
| Linked reply and reader feedback | PASS; report has 2 responses, including 1 on a gift; feedback clearly self-reported |
| Send & Catch | PASS: simulated-hand catch, button catch, words, texture, return, place |
| Shared Sanctuary | PASS with simulated motion; reached 100% in that test |
| Presentation | PASS: large two-sided subtitles, source labels, A / B / Shared legend, exit button |
| Pause → End session | PASS; results appeared in about 3 seconds in this run |
| Three actual downloads | PASS: film, PNG, JSON; details below |
| Back to canvas → End → New session | PASS; no observed browser errors |
| Two real people, camera, actual microphone, real speech and paid cloud providers | NOT TESTED in this run |

The prior handoff described older headless tests with fake MediaPipe, fake microphones and fake AI. Those reports are historical context; they are not evidence of a real two-person device test today.

## Download evidence from the no-key test

- **Story Film:** WebM, 18,216,181 bytes, VP9, 1600×900, one video track, **zero audio tracks**; final encoded frame timestamp about 68.5 seconds. WebM container/track structure was checked. Full external-player compatibility is still a manual check.
- **Artistic Portrait:** PNG, 2400×1350, 3,336,989 bytes. Pure art export; it retains typography that is part of the artwork, with no UI/subtitle overlay.
- **Communication Portrait:** valid JSON; 137 events, 6 messages, 2 linked responses (1 via gift); self-reports clear 1 / unclear 1; final translation sources phrasebook 4 / demo_gloss 1 / manual 1. The counts describe this test only.

These samples used mouse and audio simulation. They must not be presented as real-camera, real-voice, or live-AI evidence.

## Final QA changes

- `src/App.tsx`: camera/microphone/pointer effects stop during finish/results; cancel conversation and transcription requests; stop rendering completed artwork; guard double finish, disable controls while finishing; resume correctly on Back; reset view state on New; revoke output URLs; prevent late AI summaries from changing another session; synchronize corrected film language; avoid keyboard shortcuts double-firing on buttons.
- `src/ai/client.ts`: abort signals for conversation analysis and transcription.
- `src/lang/conversation.ts`: cancel pending work on reset/end; ignore stale and out-of-order AI replies; preserve phrasebook/manual translations; reset pending/error state.
- `src/lang/voiceClip.ts`: handle release before microphone permission resolves; release tracks on recorder-start failure; make stopping idempotent.
- `src/audio/micAnalyzer.ts`: release a late microphone grant after the input is turned off; avoid creating an AudioContext after cancellation.
- `src/lang/speech.ts` and `src/ui/ConversationBar.tsx`: stop browser dictation on teardown/presentation; cancel voice auto-send when editing/picking phrases; handle lost pointer capture/blur; typed edits are labelled typed; show microphone-starting state.
- `src/export/recorder.ts`: idempotent stop, bounded shutdown fallback, start failure cleanup, release recorder chunks/tracks.
- `src/ui/SubtitleBridge.tsx`, `src/styles.css`, `src/export/film.ts`: larger live/film subtitles, judge view retains bilingual text and source, simpler canvas legend, scrollable long text and busy composers. Existing blue/white art engine retained.
- `src/ui/ConsentScreen.tsx`: project tagline and accurate distinction between local sound analysis, optional audio uploads, art-only film and reader self-reports.
- `server/aiProxy.mjs`, `.env.example`: documented DeepSeek `deepseek-flash` default; generic `AI_API_KEY` option documented. OpenAI `gpt-transcribe` speech default retained after checking official docs. Explicit model overrides remain available.
- `tests/final-qa.mjs`, `package.json`: repeatable `npm run test:qa`; no new dependencies.
- `README.md`, `HANDOFF.md`: startup, current evidence, architecture, demo, limits.

## AI configuration and honesty

Only `.env.example` existed during QA. No real provider credentials were configured or tested. Copy it to `.env.local` only when ready to use your own credentials; never put keys in frontend files, `VITE_*` variables or Git.

| Setting | Behavior |
|---|---|
| `AI_PROVIDER` | `openai` or `deepseek`; choose explicitly if both keys exist |
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | server-only text provider keys |
| `AI_API_KEY` | optional generic key override |
| `AI_MODEL` | required for OpenAI chat; DeepSeek defaults to `deepseek-flash` |
| `AI_BASE_URL` | optional OpenAI-compatible text endpoint |
| `TRANSCRIBE_API_KEY` | optional speech key; otherwise `OPENAI_API_KEY` (or OpenAI generic key) |
| `TRANSCRIBE_BASE_URL` | speech endpoint, default OpenAI `/v1` |
| `AI_TRANSCRIBE_MODEL` | default `gpt-transcribe` |

Restart dev/preview after changing config. `/api/ai/status` reveals availability/model names, never keys. If text AI fails, local phrasebook/gloss remains labelled. Without keys, 12 pre-translated phrases work in four languages; other text gets **keywords only**, not real translation. The fake-provider test uses `[fake ...]` outputs and is not a language-quality test.

References checked 2026-10-24: [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [DeepSeek models/config](https://api-docs.deepseek.com/quick_start/agent_integrations/). DeepSeek still accepts the older `deepseek-v4-flash` alias, but documents `deepseek-flash` as its current alias.

## 90-second presentation

See **DEMO.md** (A = 中文, B = Español; AI mode and labelled fallback mode; fallback ladder; judge Q&A; submission checklist). For the no-key fallback: **Free canvas**, **Mouse / touch**, phrases, and say that it uses pre-translated demo phrases and simulated motion. If voice or cloud AI is unstable, switch to the labelled typing demo; do not describe canned phrases as live AI translation.

## Architecture retained

`src/App.tsx` owns session wiring. `tracking/` supplies MediaPipe poses; `input/` mouse targets; `audio/` shared-sound features; `analysis/` measured interaction events. `lang/` handles input, language heuristics, phrasebook, keyword gloss, replies and self-reports. `engine/` renders A’s cobalt pen, B’s white ribbon, gifts and shared sanctuary. `export/` records art + film overlays and exports PNG; `report/` computes the communication portrait. `ui/` provides consent, composers, subtitle bridge, controls, data view and results. `src/ai/` talks only to the server proxy in `server/`.

## Open issues / remaining real-world acceptance

1. **Two-person rehearsal is still required:** Chrome on the presentation Mac; both people visible with hands; check A/B assignment, crossing/occlusion, real mic level and actual voice transcription. Test both with and without API configuration. Synthetic track-release tests cannot certify hardware behavior.
2. Test downloaded film playback on the actual presentation computer. Chrome WebM may lack a duration header; the app compensates for its own player, external players vary. MP4 conversion is outside this sprint.
3. One shared mic cannot separate speakers; voice identity is an explicit A/B manual turn. Browser dictation and cloud transcription depend on provider/browser permissions and connectivity.
4. Language heuristics can confuse kanji-only Japanese and Chinese; use the correction control. Short text may be ambiguous. Cloud models may be unavailable for a particular account.
5. Event history is bounded (2000 events; 900 one-second summaries). Feedback is self-reported; no emotion, identity, or measured-understanding claims.
6. The desktop project currently has no `.git` metadata. No commit, push or GitHub publication was performed. Keep the directory as-is and decide repository setup separately if needed.

Run `npm run test:qa` and `npm run build` after any final edits. No Kiro or alternate-competition features were added.
