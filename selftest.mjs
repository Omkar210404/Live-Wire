// Livewire self-test: `node selftest.mjs` (no network, no API key).
import { TEMPLATES, defaults } from './src/sims/manifest.js'
import { Engine, schemaFor } from './src/engine.js'
import { mapPrompt, validate } from './src/ai/mapper.js'
import { mockProvider, createApi } from './server/api.mjs'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'

let failed = 0
async function check(name, fn) {
  try {
    const note = await fn()
    console.log(`PASS  ${name}${note ? `  (${note})` : ''}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${e.message}`)
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

// Canvas stand-in: accepts any draw call so render code paths actually run.
const ctx = new Proxy({}, { get: () => () => {}, set: () => true })
const theme = { bg: '#0b0e14', fg: '#e8ecf4', muted: '#7c8799', track: '#1d2533', accent: '#ffb35c', accent2: '#ffe2b0', cool1: '#6fb7ff', cool2: '#5ad1c7', cool3: '#8a8ff0', tree: '#2f8f7a', ash: '#3a3f4a' }
const WORLD = { w: 1000, h: 625 }

function run(t, params, steps, seed = 1) {
  const e = new Engine(t, params, { world: WORLD, seed })
  for (let i = 0; i < steps; i++) t.step(e.state, e.params, t.fixedDt || 1 / 60)
  return e
}
function assertStats(t, e) {
  const st = t.stats(e.state)
  for (const s of t.series) assert(Number.isFinite(st[s.key]) && st[s.key] >= 0, `${t.id}: stat ${s.key}=${st[s.key]}`)
  for (const k of Object.keys(t.labels)) assert(k in st, `${t.id}: label key ${k} missing from stats`)
  if (t.view === '3d') for (let i = 0; i < e.state.n * 3; i++) assert(Number.isFinite(e.state.pos[i]), `${t.id}: NaN position`)
}

console.log('\n== Simulation templates ==')
const ids = new Set()
for (const t of TEMPLATES) {
  await check(`${t.id}: schema, init, 300 ticks, render`, () => {
    assert(!ids.has(t.id), 'duplicate id'); ids.add(t.id)
    for (const k of ['name', 'summary', 'keywords', 'params', 'labels', 'series', 'init', 'step', 'stats']) assert(t[k], `missing ${k}`)
    assert(t.view === '2d' ? typeof t.render === 'function' : t.render3d?.shape, 'missing render mapping')
    for (const [k, p] of Object.entries(t.params))
      assert(p.min <= p.default && p.default <= p.max && p.step > 0 && p.label, `bad param ${k}`)
    const e = run(t, defaults(t), 300)
    assertStats(t, e)
    if (t.render) t.render(ctx, e.state, e.params, theme, 900, 600)
    return `${Object.keys(t.params).length} params`
  })
  await check(`${t.id}: every param at min and max stays finite`, () => {
    for (const [k, p] of Object.entries(t.params)) for (const v of [p.min, p.max]) {
      const e = run(t, { ...defaults(t), [k]: v }, 40)
      assertStats(t, e)
    }
  })
  await check(`${t.id}: live slider changes + restart params`, () => {
    const e = new Engine(t, defaults(t), { world: WORLD, seed: 3 })
    for (const [k, p] of Object.entries(t.params)) {
      const restarted = e.setParam(k, p.max * 10) // out of range on purpose
      assert(e.params[k] === p.max, `${k} not clamped to max (${e.params[k]})`)
      assert(restarted === !!p.restart, `${k}: restart flag mismatch`)
      for (let i = 0; i < 5; i++) e.tick(1 / 60)
    }
    e.setParam('nope', 1)
    for (const a of t.actions || []) e.act(a.id)
    e.tick(1 / 60)
    assertStats(t, e)
  })
}

await check('every template has a 3D scene file', () => {
  const missing = TEMPLATES.filter((t) => !existsSync(new URL(`./src/scenes/${t.id}.jsx`, import.meta.url))).map((t) => t.id)
  assert(!missing.length, `no scene for: ${missing.join(', ')}`)
})
await check('device caps shrink heavy params', () => {
  for (const t of TEMPLATES) for (const [k, p] of Object.entries(schemaFor(t, 0.35)))
    if (t.params[k].heavy) assert(p.max < t.params[k].max && p.default <= p.max && p.max >= p.min, `${t.id}.${k}`)
})

console.log('\n== Behaviour (the dynamics really happen) ==')
const sim = (id) => TEMPLATES.find((t) => t.id === id)
await check('epidemic: infection spreads then people recover', () => {
  const e = run(sim('epidemic'), defaults(sim('epidemic')), 60 * 25)
  const s = sim('epidemic').stats(e.state)
  assert(s.R > 50, `only ${s.R} recovered`)
  return `after 25s: S=${s.S} I=${s.I} R=${s.R}`
})
await check('traffic: jams form with no slowdown event', () => {
  const t = sim('traffic'), e = new Engine(t, defaults(t), { seed: 5 })
  let worst = 0
  for (let i = 0; i < 60 * 120; i++) { t.step(e.state, e.params, 1 / 60); if (i % 30 === 0) worst = Math.max(worst, t.stats(e.state).jammed) }
  assert(worst >= 5, `max jammed cars ${worst}`)
  return `up to ${worst} cars stopped in a jam within 120 sim-s`
})
await check('ecosystem: both species still alive after 200s', () => {
  const t = sim('ecosystem'), e = run(t, defaults(t), 60 * 200, 7)
  const s = t.stats(e.state)
  assert(s.prey > 0 && s.predators > 0, JSON.stringify(s))
  return `prey=${s.prey} predators=${s.predators}`
})
await check('forest fire: burns more at high density than low', () => {
  const t = sim('forestfire')
  const burnt = (density) => {
    const e = run(t, { ...defaults(t), density, regrowth: 0, gridSize: 100 }, 400, 2)
    const s = t.stats(e.state)
    return s.burnt / (s.burnt + s.trees + s.burning)
  }
  const lo = burnt(0.3), hi = burnt(0.8)
  assert(hi > lo + 0.3, `burnt share lo=${lo.toFixed(2)} hi=${hi.toFixed(2)}`)
  return `burnt share: density 0.3 -> ${(lo * 100).toFixed(0)}%, 0.8 -> ${(hi * 100).toFixed(0)}%`
})
await check('boids: flock aligns over time', () => {
  const t = sim('boids'), e = new Engine(t, defaults(t), { seed: 4 })
  const start = t.stats(e.state).order
  for (let i = 0; i < 60 * 20; i++) t.step(e.state, e.params, 1 / 60)
  const end = t.stats(e.state).order
  assert(end > start + 0.2, `order ${start} -> ${end}`)
  return `alignment order ${start.toFixed(2)} -> ${end.toFixed(2)}`
})
await check('gravity: cloud stays bound and finite', () => {
  const t = sim('gravity'), e = run(t, defaults(t), 60 * 15)
  const s = t.stats(e.state)
  assert(s.radius < 200, `mean radius ${s.radius}`)
  return `mean radius ${s.radius}`
})

console.log('\n== AI mapper (mock provider, no network) ==')
const mock = mockProvider()
const routes = [
  ['simulate how a disease spreads through a city', 'epidemic'],
  ['a zombie outbreak in a crowded mall', 'epidemic'],
  ['show me how traffic jams form', 'traffic'],
  ['a murmuration of starlings at dusk', 'boids'],
  ['wolves and sheep in a meadow', 'ecosystem'],
  ['a wildfire spreading through a dry forest with strong wind', 'forestfire'],
  ['how a spinning gas cloud becomes a galaxy', 'gravity'],
  ['a school of fish', 'boids'],
  ['why rush hour on the highway stops for no reason', 'traffic'],
]
for (const [prompt, want] of routes) {
  await check(`"${prompt}" -> ${want}`, async () => {
    const r = await mapPrompt(prompt, mock)
    assert(r.source === 'ai', `source=${r.source} (${r.reason})`)
    assert(r.config.template_id === want, `routed to ${r.config.template_id}`)
    const again = validate(r.config) // output must itself be valid JSON for the schema
    assert(again.ok && again.warnings.length === 0, `re-validate: ${again.error || again.warnings}`)
    JSON.parse(JSON.stringify(r))
    const over = Object.keys(r.config.label_overrides)
    return `"${r.config.title}"${over.length ? `, labels ${JSON.stringify(r.config.label_overrides)}` : ''}`
  })
}

console.log('\n== Invalid AI output falls back cleanly ==')
const bad = [
  ['prose instead of JSON', mockProvider({ reply: 'Sure! I think the epidemic one fits.' })],
  ['truncated JSON', mockProvider({ reply: '{"template_id": "traffic", "params": {' })],
  ['unknown template', mockProvider({ reply: '{"template_id":"weather","params":{},"title":"x","description":"y"}' })],
  ['params is an array', mockProvider({ reply: '{"template_id":"traffic","params":[1,2],"title":"x","description":"y"}' })],
  ['provider throws (network down)', { name: 'x', complete: async () => { throw new Error('ECONNREFUSED') } }],
]
for (const [what, provider] of bad) {
  await check(`${what} -> keyword fallback`, async () => {
    const r = await mapPrompt('show me how traffic jams form', provider)
    assert(r.source === 'fallback' && r.config?.template_id === 'traffic' && r.reason, JSON.stringify(r))
    return r.reason
  })
}
await check('out-of-range / junk params are clamped, unknown keys dropped', async () => {
  const reply = JSON.stringify({ template_id: 'epidemic', params: { population: 99999, chance: -4, speed: 'fast', recovery: '12', hack: 1 }, title: 'T', description: 'D', label_overrides: { I: 'Zombies', bogus: 'x' } })
  const r = await mapPrompt('anything', mockProvider({ reply }))
  const p = r.config.params
  assert(r.source === 'ai' && p.population === 3000 && p.chance === 0 && p.speed === defaults(sim('epidemic')).speed && p.recovery === 12 && !('hack' in p), JSON.stringify(p))
  assert(r.config.label_overrides.I === 'Zombies' && !('bogus' in r.config.label_overrides), 'labels')
  return `${r.warnings.length} warnings`
})
await check('AI says "none" -> picker, no forced template', async () => {
  const r = await mapPrompt('bake me a cake', mockProvider({ reply: '{"template_id":"none"}' }))
  assert(r.source === 'none' && r.config === null && /no template/.test(r.reason), JSON.stringify(r))
})
await check('no AI configured -> keyword match, labelled as such', async () => {
  const r = await mapPrompt('flocking birds', null)
  assert(r.source === 'keyword' && r.config.template_id === 'boids' && r.reason === 'AI not configured', JSON.stringify(r))
})
await check('nothing matches -> no config (UI shows template picker)', async () => {
  const r = await mapPrompt('bake me a cake', mockProvider({ reply: 'no idea' }))
  assert(r.source === 'none' && r.config === null, JSON.stringify(r))
})

console.log('\n== HTTP API ==')
await check('/api/status and /api/map over HTTP (mock provider)', async () => {
  const api = createApi({ AI_PROVIDER: 'mock' })
  const srv = createServer((q, s) => api(q, s))
  await new Promise((ok) => srv.listen(0, ok))
  const base = `http://127.0.0.1:${srv.address().port}`
  try {
    const st = await (await fetch(`${base}/api/status`)).json()
    assert(st.ready && st.provider === 'mock', JSON.stringify(st))
    const r = await (await fetch(`${base}/api/map`, { method: 'POST', body: JSON.stringify({ prompt: 'forest fire with wind' }) })).json()
    assert(r.source === 'ai' && r.config.template_id === 'forestfire', JSON.stringify(r))
    return `status: ${st.message}`
  } finally { srv.close() }
})
await check('/api with no provider says "AI not configured"', async () => {
  const api = createApi({})
  let body = ''
  const res = { setHeader() {}, end: (b) => { body = b } }
  await api({ method: 'GET', url: '/api/status' }, res)
  assert(JSON.parse(body).message.startsWith('AI not configured'), body)
})

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
