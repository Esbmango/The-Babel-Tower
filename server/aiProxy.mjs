// The Babel — server-side AI proxy.
// Runs inside the Vite dev / preview server (no extra backend, no new dependencies).
// API keys are read from environment variables / .env on the server and never sent to the browser.
// Supports any OpenAI-compatible Chat Completions API: OpenAI or DeepSeek.

// Default model names change over time; AI_MODEL always overrides.
// DeepSeek documents `deepseek-flash` as the current Flash alias (verified 2026-10-24).
// OpenAI has no built-in default here: set AI_MODEL to a current model id from your OpenAI dashboard.
const PROVIDERS = {
  openai: { base: 'https://api.openai.com/v1', model: '', keyVar: 'OPENAI_API_KEY' },
  deepseek: { base: 'https://api.deepseek.com', model: 'deepseek-flash', keyVar: 'DEEPSEEK_API_KEY' },
};

const LANG_NAMES = { zh: 'Chinese (Simplified)', en: 'English', ja: 'Japanese', es: 'Spanish' };
const MAX_BODY = 100_000;
const MAX_AUDIO_BODY = 12_000_000; // ~8 MB of audio after base64 — a few tens of seconds of speech

/**
 * Speech-to-text with automatic language identification. Uses OpenAI's /audio/transcriptions
 * (DeepSeek has no speech endpoint), so it needs an OpenAI-compatible key even when text AI uses DeepSeek.
 * Default model gpt-transcribe; AI_TRANSCRIBE_MODEL can select whisper-1, gpt-4o-transcribe, etc.
 */
export function resolveTranscribeConfig(env) {
  const text = resolveAiConfig(env);
  return {
    key: env.TRANSCRIBE_API_KEY || env.OPENAI_API_KEY || (text.provider === 'openai' ? env.AI_API_KEY || '' : ''),
    base: (env.TRANSCRIBE_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: env.AI_TRANSCRIBE_MODEL || 'gpt-transcribe',
  };
}

const LANG_ALIASES = {
  zh: 'zh', chinese: 'zh', mandarin: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh', cantonese: 'zh', yue: 'zh',
  en: 'en', english: 'en', ja: 'ja', japanese: 'ja', es: 'es', spanish: 'es', castilian: 'es',
};
function mapLanguage(v) {
  if (!v) return null;
  const s = String(typeof v === 'object' ? v.language ?? v.code ?? v.lang ?? '' : v).toLowerCase().trim();
  return LANG_ALIASES[s] ?? LANG_ALIASES[s.split(/[-_]/)[0]] ?? null;
}

const TIMEOUT_MS = 25_000;

export function resolveAiConfig(env) {
  const explicit = (env.AI_PROVIDER || '').toLowerCase();
  const provider = PROVIDERS[explicit] ? explicit : env.DEEPSEEK_API_KEY && !env.OPENAI_API_KEY ? 'deepseek' : 'openai';
  const p = PROVIDERS[provider];
  return {
    provider,
    key: env.AI_API_KEY || env[p.keyVar] || '',
    base: (env.AI_BASE_URL || p.base).replace(/\/$/, ''),
    model: env.AI_MODEL || p.model,
  };
}

const GUARDRAILS = [
  'Never infer or state emotions, moods, mental states, personality, intelligence, sincerity or how well the people understand each other.',
  'Never infer culture, religion, nationality or identity from language or names.',
  'Base everything only on the text and numbers provided. If something is not in the input, do not mention it.',
  'Return only one JSON object, no prose outside it.',
].join(' ');

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function chatJSON(cfg, fetchImpl, system, user) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const call = (jsonMode) =>
    fetchImpl(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(user) },
        ],
      }),
      signal: ctrl.signal,
    });
  try {
    let r = await call(true);
    if (!r.ok && r.status === 400) {
      const detail = await r.text();
      // Some OpenAI-compatible providers/models reject JSON mode — retry once without it.
      if (/response_format|json/i.test(detail)) r = await call(false);
      else throw Object.assign(new Error('AI provider returned 400'), { status: 502, detail: detail.slice(0, 300) });
    }
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      throw Object.assign(new Error(`AI provider returned ${r.status}`), { status: 502, detail });
    }
    const data = await r.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '')
      .replace(/^\s*```(?:json)?/i, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      return JSON.parse(content);
    } catch {
      throw Object.assign(new Error('AI provider returned non-JSON content'), { status: 502 });
    }
  } finally {
    clearTimeout(timer);
  }
}

const str = (v, n = 400) => (typeof v === 'string' ? v.slice(0, n) : '');
const clamp01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

function cleanMessages(list) {
  return (Array.isArray(list) ? list : [])
    .slice(-12)
    .filter((m) => m && (m.participantId === 'A' || m.participantId === 'B') && LANG_NAMES[m.lang])
    .map((m) => ({ id: str(m.id, 40), participant: m.participantId, lang: m.lang, text: str(m.text, 500) }));
}

async function analyze(cfg, fetchImpl, body) {
  const messages = cleanMessages(body.messages);
  const target = body.targets || {};
  const newest = messages.find((m) => m.id === body.newMessageId) ?? messages[messages.length - 1];
  if (!newest) throw Object.assign(new Error('No messages'), { status: 400 });
  const to = newest.participant === 'A' ? target.B : target.A;
  const toLang = LANG_NAMES[to] ? to : 'en';

  const system = [
    'You support a two-person interactive art installation where people may write in different languages (Chinese, English, Japanese, Spanish).',
    `Translate the newest message (id ${newest.id}) faithfully into ${LANG_NAMES[toLang]}.`,
    'Extract 1-5 short keywords per message, in English, lowercase nouns or short noun phrases.',
    'Detect shared topics: only themes that BOTH participant A and participant B have explicitly written about. Give each a short English label and a Chinese label.',
    'similarity: 0..1 topical overlap between what A and B wrote. It measures shared subject matter only, not agreement or understanding.',
    'JSON schema: {"translation":{"id":string,"to":string,"text":string},"keywords":{"<messageId>":[string]},"sharedTopics":[{"label_en":string,"label_zh":string,"messageIds":[string],"similarity":number}],"similarity":number}',
    GUARDRAILS,
  ].join('\n');

  const out = await chatJSON(cfg, fetchImpl, system, { messages, newestMessageId: newest.id, translateTo: toLang });
  const keywords = {};
  if (out && typeof out.keywords === 'object') {
    for (const [k, v] of Object.entries(out.keywords)) {
      if (Array.isArray(v)) keywords[str(k, 40)] = v.filter((x) => typeof x === 'string').slice(0, 5).map((x) => x.slice(0, 40));
    }
  }
  return {
    translation: { id: newest.id, to: toLang, text: str(out?.translation?.text, 800) },
    keywords,
    sharedTopics: (Array.isArray(out?.sharedTopics) ? out.sharedTopics : []).slice(0, 5).map((t) => ({
      label_en: str(t?.label_en, 60),
      label_zh: str(t?.label_zh, 30),
      messageIds: Array.isArray(t?.messageIds) ? t.messageIds.map((x) => str(x, 40)).slice(0, 12) : [],
      similarity: clamp01(t?.similarity),
    })).filter((t) => t.label_en),
    similarity: clamp01(out?.similarity),
  };
}

async function summarize(cfg, fetchImpl, body) {
  const stats = body.stats && typeof body.stats === 'object' ? body.stats : {};
  const messages = body.includeText ? cleanMessages(body.messages) : [];
  const system = [
    'Write a short narrative summary of one session of a two-person interactive artwork, in two versions: Chinese ("zh") and English ("en"), each 90-150 words.',
    'Cover only: which ways of communicating were used (body movement, shared voice, written or spoken text, symbols), which shared topics appeared, which movements or sounds changed the artwork (use the provided mapping), and how the final artwork took shape.',
    'Use ONLY the numbers and facts in the input. Do not invent statistics. Round sensibly. If a modality was not used, say so or omit it.',
    'Describe the artwork and the measured interaction, not the people\'s inner states. The shared microphone cannot tell speakers apart unless a manual turn mode was used.',
    'JSON schema: {"zh":string,"en":string}',
    GUARDRAILS,
  ].join('\n');
  const out = await chatJSON(cfg, fetchImpl, system, { stats, messages });
  return { zh: str(out?.zh, 2000), en: str(out?.en, 2000) };
}


async function transcribe(tcfg, fetchImpl, body) {
  const b64 = typeof body.audio === 'string' ? body.audio : '';
  if (!b64) throw Object.assign(new Error('No audio'), { status: 400 });
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 800) throw Object.assign(new Error('Clip too short'), { status: 400 });
  const mime = typeof body.mime === 'string' && /^audio\/[\w.+-]+/.test(body.mime) ? body.mime.split(';')[0] : 'audio/webm';
  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
  const call = (format) => {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mime }), `clip.${ext}`);
    fd.append('model', tcfg.model);
    fd.append('response_format', format);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetchImpl(`${tcfg.base}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${tcfg.key}` }, body: fd, signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
  };
  let r = await call(tcfg.model === 'whisper-1' ? 'verbose_json' : 'json');
  if (!r.ok && r.status === 400) {
    const detail = await r.text();
    if (/response_format/i.test(detail)) r = await call('json');
    else throw Object.assign(new Error('Transcription provider returned 400'), { status: 502, detail: detail.slice(0, 300) });
  }
  if (!r.ok) throw Object.assign(new Error(`Transcription provider returned ${r.status}`), { status: 502, detail: (await r.text()).slice(0, 300) });
  const data = await r.json();
  const raw = data.language ?? (Array.isArray(data.languages) ? data.languages[0] : null);
  const lang = mapLanguage(raw);
  // The audio buffer is discarded when this function returns; nothing is written to disk.
  return {
    text: str(data.text, 2000).trim(),
    language: lang,
    rawLanguage: raw ? String(typeof raw === 'object' ? raw.language ?? raw.code ?? '' : raw) : null,
    detectedBy: lang ? 'speech_model' : 'none',
    durationSec: typeof data.duration === 'number' ? data.duration : null,
    model: tcfg.model,
  };
}

/** Connect-style middleware handling /api/ai/*. */
export function createAiHandler(env, fetchImpl = globalThis.fetch) {
  const cfg = resolveAiConfig(env);
  const tcfg = resolveTranscribeConfig(env);
  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/api/ai/')) return next();

    // Same-origin only: the page served by this server may call the proxy, other sites may not.
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Cross-origin requests are not allowed' });
      } catch {
        return send(res, 403, { error: 'Bad origin' });
      }
    }

    try {
      if (url === '/api/ai/status' && req.method === 'GET') {
        return send(res, 200, {
          available: !!cfg.key && !!cfg.model,
          provider: cfg.provider,
          model: cfg.model,
          reason: !cfg.key ? 'no_key' : !cfg.model ? 'no_model' : undefined,
          transcribe: { available: !!tcfg.key, model: tcfg.model },
        });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
      if (url === '/api/ai/transcribe') {
        if (!tcfg.key) return send(res, 503, { error: 'No transcription key configured on the server' });
        const body = await readBody(req, MAX_AUDIO_BODY);
        return send(res, 200, await transcribe(tcfg, fetchImpl, body));
      }
      if (!cfg.key) return send(res, 503, { error: 'No AI API key configured on the server' });
      if (!cfg.model) return send(res, 503, { error: 'Set AI_MODEL on the server' });
      const body = await readBody(req);
      if (url === '/api/ai/analyze') return send(res, 200, { provider: cfg.provider, model: cfg.model, ...(await analyze(cfg, fetchImpl, body)) });
      if (url === '/api/ai/summary') return send(res, 200, { provider: cfg.provider, model: cfg.model, ...(await summarize(cfg, fetchImpl, body)) });
      return send(res, 404, { error: 'Unknown endpoint' });
    } catch (err) {
      const status = err?.status || (err?.name === 'AbortError' ? 504 : 500);
      console.error('[the-babel ai]', err?.message, err?.detail ?? '');
      return send(res, status, { error: err?.message || 'AI request failed' });
    }
  };
}

/** Vite plugin: mounts the proxy on both `vite` (dev) and `vite preview`. */
export function aiProxyPlugin(env) {
  const handler = createAiHandler(env);
  const cfg = resolveAiConfig(env);
  return {
    name: 'the-babel-ai-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
      console.log(
        `[the-babel ai] ${
          !cfg.key ? 'no API key — app runs in local demo mode'
            : !cfg.model ? `${cfg.provider} key found but AI_MODEL is not set — local demo mode`
              : `${cfg.provider} · ${cfg.model} (key loaded from server env)`
        }`,
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
