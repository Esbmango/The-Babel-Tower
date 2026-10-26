#!/usr/bin/env bash
# Bundle the app with a fake MediaPipe (two synthetic people) into tests/harness/dist, for headless tests.
set -e
cd "$(dirname "$0")/../.."
mkdir -p tests/harness/dist tests/harness/out
npx esbuild src/main.tsx --bundle --format=esm --outfile=tests/harness/dist/fake.js \
  --alias:@mediapipe/tasks-vision=./tests/harness/fake-mediapipe.ts --jsx=automatic --loader:.css=css \
  --define:process.env.NODE_ENV='"production"' --define:import.meta.env.DEV=false
cat > tests/harness/dist/fake.html <<'HTML'
<!doctype html><html lang=en><head><meta charset=UTF-8><meta name=viewport content='width=device-width, initial-scale=1.0'><title>The Babel (test)</title><link rel=stylesheet href=fake.css></head><body><div id=root></div><script type=module src=fake.js></script></body></html>
HTML
echo "built → tests/harness/dist. Run: node tests/harness/server.mjs tests/harness/dist"
