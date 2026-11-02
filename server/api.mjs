// The only server code: holds the AI key and exposes two endpoints.
//   GET  /api/status -> { provider, model, ready, message }
//   POST /api/map    -> mapPrompt() result for { prompt }
// No dependencies: Node 18+ (global fetch). Used as Vite middleware in dev
// and by server/index.mjs in production.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { keywordRank, mapPrompt, responseSchema } from '../src/ai/mapper.js'
import { TEMPLATES } from '../src/sims/manifest.js'
import { CODE_SYSTEM, codeUserPrompt } from '../src/ai/customSim.js'

/** Minimal .env loader; real environment variables win. */
export function loadEnv(path = fileURLToPath(new URL('../.env', import.meta.url))) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}

// ---------- providers: { name, model, status(), complete(system, user) } ----------
export function ollamaProvider(env = process.env) {
  const host = (env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const model = env.OLLAMA_MODEL || 'llama3.2:3b'
  return {
    name: 'ollama', model,
    async status() {
      try {
        const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3000) })
        const names = ((await r.json()).models || []).map((m) => m.name)
        if (!names.includes(model) && !names.includes(`${model}:latest`))
          return { ready: false, message: `Ollama is running but "${model}" is not pulled. Run: ollama pull ${model}` }
        return { ready: true, message: `Local Ollama · ${model}` }
      } catch {
        return { ready: false, message: `Ollama not reachable at ${host}. Start Ollama, or use the template picker.` }
      }
    },
    async complete(system, user) {
      const r = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model, stream: false, format: responseSchema(), options: { temperature: 0, seed: 7, num_ctx: 8192 }, // same num_ctx as code writing, so the model never reloads
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      })
      if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`)
      return (await r.json()).message?.content || ''
    },
    /** Free-form streaming (used to write simulation code). */
    async *stream(system, user) {
      const r = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(300000),
        body: JSON.stringify({
          model: env.CODE_MODEL || model, stream: true,
          options: { temperature: 0.2, num_predict: 2500, num_ctx: 8192 },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      })
      if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`)
      yield* ndjsonText(r.body, (j) => j.message?.content)
    },
  }
}

/** Yield text pieces from a streamed response, one JSON object per line (Ollama) or SSE "data:" lines (Gemini). */
async function* ndjsonText(body, pick) {
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/^data:\s*/, '').trim()
      buf = buf.slice(i + 1)
      if (!line || line === '[DONE]') continue
      try { const piece = pick(JSON.parse(line)); if (piece) yield piece } catch { /* partial or keep-alive line */ }
    }
  }
}

export function geminiProvider(env = process.env) {
  const key = env.GEMINI_API_KEY || ''
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'
  return {
    name: 'gemini', model,
    async status() {
      return key
        ? { ready: true, message: `Gemini free tier · ${model}` }
        : { ready: false, message: 'GEMINI_API_KEY is empty in .env' }
    },
    async complete(system, user) {
      if (!key) throw new Error('GEMINI_API_KEY is empty')
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      })
      if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`) // body may echo request details; keep it out
      const data = await r.json()
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
    },
    async *stream(system, user) {
      if (!key) throw new Error('GEMINI_API_KEY is empty')
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.CODE_MODEL || model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.3 },
        }),
      })
      if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`)
      yield* ndjsonText(r.body, (j) => j.candidates?.[0]?.content?.parts?.map((p) => p.text).join(''))
    },
  }
}

/**
 * Offline stand-in for the self-test. It reads the template catalogue from
 * the system prompt it is given (so a broken prompt breaks routing), picks a
 * template by keyword, nudges intensity params from words like "fast" or
 * "strong", and answers in a ```json fence like a chatty model would.
 */
export function mockProvider({ reply, code } = {}) {
  return {
    name: 'mock', model: 'mock',
    async status() { return { ready: true, message: 'Mock provider (offline)' } },
    async *stream() {
      const text = code ?? MOCK_SIM
      for (let i = 0; i < text.length; i += 40) yield text.slice(i, i + 40)
    },
    async complete(system, user) {
      if (reply) return typeof reply === 'function' ? reply(system, user) : reply
      const ids = [...system.matchAll(/^- id: (\S+)/gm)].map((m) => m[1])
      const ranked = keywordRank(user).filter((r) => ids.includes(r.id))
      const id = ranked[0]?.score ? ranked[0].id : ids[0]
      const t = TEMPLATES.find((x) => x.id === id)
      const params = {}
      const strong = /\b(fast|strong|very|highly|extremely|huge|dense|crowded)\b/i.test(user)
      for (const [k, p] of Object.entries(t.params))
        if (strong && !p.restart && !p.heavy) params[k] = +(p.default + (p.max - p.default) * 0.5).toFixed(3)
      const words = user.split(/\s+/).slice(0, 6).join(' ')
      return '```json\n' + JSON.stringify({
        template_id: id, params,
        title: words.charAt(0).toUpperCase() + words.slice(1),
        description: `A simplified ${t.name.toLowerCase()} model of: ${user}.`,
        label_overrides: /zombie/i.test(user) && id === 'epidemic' ? { I: 'Zombies', S: 'Humans' } : {},
      }) + '\n```'
    },
  }
}

/** A known-good generated simulation, returned by the mock provider. */
export const MOCK_SIM = `Here you go:
` + '```js' + `
const sim = {
  title: 'Cars at a level crossing',
  description: 'Cars wait while a train passes.',
  params: { cars: { label: 'Cars', min: 1, max: 50, step: 1, default: 12 }, speed: { label: 'Speed', min: 10, max: 200, step: 5, default: 80 } },
  restart: ['cars'],
  init(p, w, h) { return { cars: Array.from({ length: p.cars }, (_, i) => ({ x: i * 40, waiting: false })) } },
  step(s, p, dt, w, h) { for (const c of s.cars) { c.x = (c.x + p.speed * dt) % w; c.waiting = c.x > w / 2 - 30 && c.x < w / 2 } },
  draw(ctx, s, p, w, h) { ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#3e8ef7'; for (const c of s.cars) ctx.fillRect(c.x, h / 2, 24, 12) },
  stats(s) { return { 'Cars waiting': s.cars.filter((c) => c.waiting).length } },
}
` + '```'

export function providerFromEnv(env = process.env) {
  const which = (env.AI_PROVIDER || '').trim().toLowerCase()
  if (which === 'ollama') return ollamaProvider(env)
  if (which === 'gemini') return geminiProvider(env)
  if (which === 'mock') return mockProvider()
  return null
}

// ---------- HTTP handler ----------
export function createApi(env = process.env) {
  const provider = providerFromEnv(env)
  const send = (res, code, body) => {
    res.statusCode = code
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }
  return async function api(req, res, next) {
    const url = (req.originalUrl || req.url || '').split('?')[0]
    try {
      if (req.method === 'GET' && url === '/api/status') {
        if (!provider) return send(res, 200, { provider: 'none', ready: false, message: 'AI not configured: set AI_PROVIDER in .env. The template picker and sliders still work.' })
        const s = await provider.status()
        return send(res, 200, { provider: provider.name, model: provider.model, ...s })
      }
      if (req.method === 'POST' && url === '/api/map') {
        let body = ''
        for await (const chunk of req) {
          body += chunk
          if (body.length > 10000) return send(res, 413, { error: 'prompt too long' })
        }
        let prompt = ''
        try { prompt = JSON.parse(body || '{}').prompt } catch { return send(res, 400, { error: 'invalid JSON body' }) }
        const ready = provider ? (await provider.status()).ready : false
        const result = await mapPrompt(prompt, ready ? provider : null)
        if (provider && !ready && result.source === 'keyword') { result.source = 'fallback'; result.reason = `${provider.name} not ready` }
        return send(res, 200, { ...result, provider: provider?.name || 'none' })
      }
      if (req.method === 'POST' && url === '/api/generate') {
        // Experimental: stream AI-written simulation code as plain text.
        let body = ''
        for await (const chunk of req) {
          body += chunk
          if (body.length > 20000) return send(res, 413, { error: 'request too large' })
        }
        let q
        try { q = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'invalid JSON body' }) }
        const prompt = String(q.prompt || '').trim().slice(0, 500)
        if (!prompt) return send(res, 400, { error: 'empty prompt' })
        if (!provider?.stream || !(await provider.status()).ready) return send(res, 503, { error: 'AI not available' })
        const previous = q.previous && typeof q.previous.code === 'string' ? { code: q.previous.code, error: String(q.previous.error || '').slice(0, 500) } : null
        res.statusCode = 200
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.setHeader('cache-control', 'no-cache')
        try {
          for await (const piece of provider.stream(CODE_SYSTEM, codeUserPrompt(prompt, previous))) res.write(piece)
        } catch (e) {
          res.write(`
/* LIVEWIRE_ERROR: ${String(e.message).replace(/\*\//g, '')} */`)
        }
        return res.end()
      }
    } catch (e) {
      return send(res, 500, { error: 'server error' })
    }
    if (next) return next()
    send(res, 404, { error: 'not found' })
  }
}

