# Headless two-person test harness

- `build.sh` bundles the app with `fake-mediapipe.ts` (two synthetic people) — no camera needed.
- `server.mjs <dist>` serves it like `vite preview`, with the project's real AI proxy:
  - **:8770** — no key → local demo mode (phrasebook + demo gloss)
  - **:8771** — AI mode against a **fake** OpenAI-compatible provider on :8772 (translations come back as `[fake zh] …`; transcriptions cycle through 4 canned clips in zh / es / ja / en)
- `demo_path.py <port>` — the DEMO.md path: A 中文 → B Español → reply → gift with words → Sanctuary → Present → three outputs, report evidence and the counts-only export (asserts no words leak), then New session.
- `two_person.py <port>` (Python Playwright, `--use-fake-device-for-media-stream`) plays a full session:
  phrase answer → PHRASEBOOK translation → reader "I follow" → respond (linked reply) → new message → "unclear" →
  send these words as a gift → catch → answer on the gift → texture → send back → catch → place →
  (AI mode) hold-to-speak voice clip → Sanctuary + motion → End session → checks the three outputs,
  downloads the report JSON and the Story Film into `out/`.

```bash
bash tests/harness/build.sh
node tests/harness/server.mjs tests/harness/dist &
cd tests/harness && python3 demo_path.py 8770 && python3 demo_path.py 8771
```
Uses `npx esbuild` (installed with Vite). Needs `pip install playwright && playwright install chromium`.
