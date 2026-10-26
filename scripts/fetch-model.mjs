// Downloads the pose model into public/models so the demo works offline.
// Usage: npm run fetch-model            (lite, fastest)
//        npm run fetch-model -- full    (more accurate, slower)
import { mkdirSync, writeFileSync } from 'node:fs';
const variant = process.argv[2] === 'full' ? 'full' : 'lite';
const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/1/pose_landmarker_${variant}.task`;
mkdirSync('public/models', { recursive: true });
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(`public/models/pose_landmarker_${variant}.task`, buf);
console.log(`[between-us] Saved public/models/pose_landmarker_${variant}.task (${(buf.length / 1e6).toFixed(1)} MB)`);
