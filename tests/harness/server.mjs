// Test server: static files + the project's real AI proxy middleware (like `vite preview`),
// plus a fake OpenAI-compatible provider so the AI path can be exercised without a real key.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createAiHandler } from '../../server/aiProxy.mjs';

const root = path.resolve(process.argv[2]);
const log = [];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };

// ---- fake provider
let tcount = 0;
const TRANSCRIPTS = [
  { text: '我想念家乡的味道', language: 'chinese' },
  { text: 'Mi casa es donde está mi familia y la libertad', language: 'spanish' },
  { text: 'つながりが私の家です', languages: [{ language: 'ja' }] },
  { text: 'Hope is a light at the window' },
];
http.createServer((req, res) => {
  if (req.url.includes('/audio/transcriptions')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const txt = raw.toString('latin1');
      log.push({ transcribe: true, auth: req.headers.authorization, ctype: req.headers['content-type'].split(';')[0], bytes: raw.length,
        hasFile: /name="file"; filename="clip\.\w+"/.test(txt), model: (txt.match(/name="model"\r\n\r\n([^\r]+)/) || [])[1],
        format: (txt.match(/name="response_format"\r\n\r\n([^\r]+)/) || [])[1] });
      fs.writeFileSync(path.join(root, '..', 'provider-log.json'), JSON.stringify(log, null, 1));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(TRANSCRIPTS[tcount++ % TRANSCRIPTS.length]));
    });
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body);
    log.push({ auth: req.headers.authorization, model: j.model, jsonMode: !!j.response_format });
    fs.writeFileSync(path.join(root, '..', 'provider-log.json'), JSON.stringify(log, null, 1));
    const sys = j.messages[0].content;
    const user = JSON.parse(j.messages[1].content);
    let content;
    if (sys.includes('Translate the newest message')) {
      const m = user.messages.find((x) => x.id === user.newestMessageId);
      const both = new Set(user.messages.map((x) => x.participant)).size === 2;
      content = {
        translation: { id: m.id, to: user.translateTo, text: `[fake ${user.translateTo}] ${m.text}` },
        keywords: Object.fromEntries(user.messages.map((x) => [x.id, ['hometown', 'longing']])),
        sharedTopics: both ? [{ label_en: 'homesickness', label_zh: '思乡', messageIds: user.messages.map((x) => x.id), similarity: 0.8 }] : [],
        similarity: both ? 0.8 : 0,
      };
    } else {
      content = { zh: `【测试摘要】会话时长 ${user.stats.durationSec} 秒。`, en: `[test summary] Session lasted ${user.stats.durationSec} s.` };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify(content) + '\n```' } }] }));
  });
}).listen(8772);

const mk = (port, env) => {
  const ai = createAiHandler(env);
  http.createServer((req, res) => {
    ai(req, res, () => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', types[path.extname(p)] ?? 'application/octet-stream');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(p).pipe(res);
    });
  }).listen(port);
};
mk(8770, {});                                                                 // no key → local demo mode
mk(8771, { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-SECRET-123', AI_MODEL: 'fake-model', AI_BASE_URL: 'http://127.0.0.1:8772/v1', TRANSCRIBE_BASE_URL: 'http://127.0.0.1:8772/v1' });
console.log('servers up');
