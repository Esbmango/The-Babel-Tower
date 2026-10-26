// Copies MediaPipe's WASM runtime into public/ so pose tracking works without a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/mediapipe/wasm';
if (!existsSync(src)) {
  console.warn('[between-us] MediaPipe wasm not found, skipping copy');
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log('[between-us] Copied MediaPipe wasm ->', dest);
}
