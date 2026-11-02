// Prompt -> simulation config. The AI never writes physics: it only picks a
// template from the library and fills in its parameters, and everything it
// returns is validated against that template's schema. Shared by the server
// (real AI calls), the browser (offline keyword fallback) and the self-test.
import { TEMPLATES, byId, defaults } from '../sims/manifest.js'
import { snap } from '../engine.js'

export const TITLE_MAX = 60, DESC_MAX = 420, LABEL_MAX = 28

export function buildSystemPrompt(templates = TEMPLATES) {
  const lines = templates.map((t) => {
    const params = Object.entries(t.params)
      .map(([k, p]) => `    ${k} (${p.min}-${p.max}, default ${p.default}${p.unit ? ' ' + p.unit : ''}): ${p.help || p.label}`)
      .join('\n')
    const labels = Object.entries(t.labels).map(([k, v]) => `${k}="${v}"`).join(', ')
    return `- id: ${t.id}\n  what: ${t.summary}\n  keywords: ${t.keywords.join(', ')}\n  params:\n${params}\n  labels: ${labels}`
  })
  return [
    'You configure simulations for Livewire. You do NOT invent physics.',
    'Pick the ONE template below that best matches the user\'s request, then set its parameters so the simulation reflects the request (e.g. "very contagious" -> high infection chance, "strong wind" -> high wind strength). Stay inside each min-max range. Omit a param to keep its default.',
    'TEMPLATES:',
    ...lines,
    '',
    'Reply with JSON only, no prose, exactly this shape:',
    '{"fit": "direct|analogy|none", "template_id": "<id>", "params": {"<param>": <number>}, "title": "<max 6 words>", "description": "<2-3 plain sentences: what is being simulated, what to watch for, and that it is a simplified model>", "label_overrides": {"<label key>": "<new name>"}}',
    'Use label_overrides only to rename stats into the user\'s domain (e.g. zombies: {"I": "Zombies"}). Use only the label keys listed for the chosen template.',
  ].join('\n')
}

/** JSON schema for providers that support constrained output (Ollama). */
export function responseSchema(templates = TEMPLATES) {
  return {
    type: 'object',
    properties: {
      fit: { type: 'string', enum: ['direct', 'analogy', 'none'] },
      template_id: { type: 'string', enum: [...templates.map((t) => t.id), 'none'] },
      params: { type: 'object' },
      title: { type: 'string' },
      description: { type: 'string' },
      label_overrides: { type: 'object' },
    },
    required: ['fit', 'template_id', 'params', 'title', 'description'],
  }
}

/** Pull the first JSON object out of model text (handles ```json fences / chatter). */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('empty response')
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON object in response')
  return JSON.parse(text.slice(start, end + 1))
}

/**
 * Validate raw AI output against the chosen template's schema.
 * Hard errors (bad JSON shape, unknown template) => ok:false, caller falls back.
 * Soft problems (out-of-range or junk param) are fixed and listed as warnings.
 */
export function validate(raw) {
  const warnings = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'response is not a JSON object' }
  const t = byId(raw.template_id)
  if (!t) return { ok: false, error: `unknown template_id "${raw.template_id}"` }
  if (raw.params != null && (typeof raw.params !== 'object' || Array.isArray(raw.params)))
    return { ok: false, error: 'params is not an object' }

  const params = defaults(t)
  for (const [k, v] of Object.entries(raw.params || {})) {
    const p = t.params[k]
    if (!p) { warnings.push(`ignored unknown param "${k}"`); continue }
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    if (!Number.isFinite(n)) { warnings.push(`${k}: "${v}" is not a number, kept default`); continue }
    params[k] = snap(p, n)
    if (n < p.min || n > p.max) warnings.push(`${k}: ${n} out of range, clamped to ${params[k]}`)
  }

  const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  let title = str(raw.title, TITLE_MAX)
  if (!title) { title = t.name; warnings.push('missing title') }
  let description = str(raw.description, DESC_MAX)
  if (!description) { description = t.summary; warnings.push('missing description') }

  const label_overrides = {}
  const lo = raw.label_overrides
  if (lo && typeof lo === 'object' && !Array.isArray(lo)) {
    for (const [k, v] of Object.entries(lo)) {
      const name = str(v, LABEL_MAX)
      if (k in t.labels && name) label_overrides[k] = name
      else warnings.push(`ignored label override "${k}"`)
    }
  }
  return { ok: true, value: { template_id: t.id, params, title, description, label_overrides }, warnings }
}

/** Rank templates by keyword hits. Whole-word matches; phrases count double. */
export function keywordRank(prompt) {
  const text = ` ${String(prompt).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `
  return TEMPLATES.map((t) => {
    let score = 0
    for (const kw of t.keywords) {
      const re = new RegExp(`[\\s-]${kw.replace(/[-]/g, '\\-')}s?[\\s-]`)
      if (re.test(text)) score += kw.includes(' ') ? 2 : 1
    }
    return { id: t.id, score }
  }).sort((a, b) => b.score - a.score)
}

/** Offline config: nearest template by keywords, defaults, honest copy. */
export function keywordConfig(prompt) {
  const best = keywordRank(prompt)[0]
  if (!best || best.score === 0) return null
  const t = byId(best.id)
  return { template_id: t.id, params: defaults(t), title: t.name, description: t.summary, label_overrides: {} }
}

/**
 * Full pipeline. provider: { name, complete(system, user) -> Promise<string> } or null.
 * Always resolves; never throws. `source` says where the config came from:
 *   'ai'       - valid AI output
 *   'fallback' - AI failed/invalid, keyword match used (reason says why)
 *   'keyword'  - no AI configured, keyword match used
 *   'none'     - nothing matched; the UI shows the manual picker
 */
export async function mapPrompt(prompt, provider) {
  const text = String(prompt || '').trim().slice(0, 500)
  if (!text) return { source: 'none', config: null, reason: 'empty prompt', warnings: [] }
  const viaKeywords = (source, reason) => {
    const config = keywordConfig(text)
    return { source: config ? source : 'none', config, reason, warnings: [] }
  }
  if (!provider) return viaKeywords('keyword', 'AI not configured')
  let raw
  try {
    raw = await provider.complete(buildSystemPrompt(), text)
  } catch (e) {
    return viaKeywords('fallback', `AI call failed: ${e.message}`)
  }
  let parsed
  try {
    parsed = extractJson(raw)
  } catch (e) {
    return viaKeywords('fallback', `AI returned invalid JSON (${e.message})`)
  }
  if (parsed?.template_id === 'none' || parsed?.fit === 'none') return viaKeywords('fallback', 'AI found no template that fits')
  const v = validate(parsed)
  if (!v.ok) return viaKeywords('fallback', `AI output rejected: ${v.error}`)
  return { source: 'ai', config: v.value, reason: null, warnings: v.warnings }
}
