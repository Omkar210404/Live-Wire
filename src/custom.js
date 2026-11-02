// Browser side of experimental mode: stream code from /api/generate, test it
// in a hidden sandbox, then drive the visible sandbox through an object with
// the same shape as Engine, so the panel, sliders, chart and HUD just work.
import { extractCode, sandboxHtml } from './ai/customSim.js'

const SERIES_COLORS = ['accent', 'cool1', 'cool2']
let html // built once
export const SANDBOX_HTML = () => (html ??= sandboxHtml())

/** Stream generated code; onText(fullTextSoFar) is called as it arrives. */
export async function generateCode(prompt, previous, onText) {
  const r = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, previous }),
  })
  if (!r.ok) throw new Error(r.status === 503 ? 'AI is not available' : `server error ${r.status}`)
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += dec.decode(value, { stream: true })
    onText(text)
  }
  const err = text.match(/LIVEWIRE_ERROR: (.*) \*\//)
  if (err) throw new Error(err[1])
  return extractCode(text)
}

/**
 * Load code into a hidden sandbox: resolves {ok, info} once it has run for
 * ~1.5 s without errors, or {ok:false, error}.
 */
export function testInSandbox(code) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe')
    f.setAttribute('sandbox', 'allow-scripts')
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:500px;border:0'
    let info = null, done = false
    const finish = (res) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMsg)
      clearTimeout(timer)
      f.remove()
      resolve(res)
    }
    const onMsg = (e) => {
      if (e.source !== f.contentWindow || !e.data?.lw) return
      const m = e.data
      if (m.type === 'boot') f.contentWindow.postMessage({ type: 'load', code }, '*')
      if (m.type === 'ready') { info = m; setTimeout(() => finish({ ok: true, info }), 1500) }
      if (m.type === 'error') finish({ ok: false, error: m.message })
    }
    const timer = setTimeout(() => finish(info ? { ok: true, info } : { ok: false, error: 'the simulation did not start (it may be stuck in a loop)' }), 8000)
    window.addEventListener('message', onMsg)
    f.srcdoc = SANDBOX_HTML()
    document.body.appendChild(f)
  })
}

/** Template-like description of a generated sim, for Panel/Stage. */
export function customTemplate(info) {
  const keys = Object.keys(info.stats || {})
  return {
    id: 'custom', view: 'custom', name: 'AI-generated simulation',
    summary: info.description, params: info.params,
    labels: Object.fromEntries(keys.map((k) => [k, k])),
    series: keys.map((k, i) => ({ key: k, color: SERIES_COLORS[i % 3] })),
  }
}

/** Engine-shaped controller for the visible sandbox iframe. */
export class SandboxEngine {
  constructor(code, info) {
    this.code = code
    this.schema = info.params
    this.params = Object.fromEntries(Object.entries(info.params).map(([k, p]) => [k, p.default]))
    this.keys = Object.keys(info.stats || {})
    this.latest = { ...info.stats }
    this.history = Object.fromEntries(this.keys.map((k) => [k, []]))
    this.simTime = 0
    this._playing = true
    this._speed = 1
    this.win = null
    this.onError = null
    this.lastBeat = 0
  }
  attach(win) {
    this.win = win
    this.post({ type: 'load', code: this.code, params: this.params })
    this.post({ type: 'play', on: this._playing })
    this.post({ type: 'speed', x: this._speed })
  }
  post(m) { this.win?.postMessage(m, '*') }
  get playing() { return this._playing }
  set playing(v) { this._playing = v; this.post({ type: 'play', on: v }) }
  get speed() { return this._speed }
  set speed(v) { this._speed = v; this.post({ type: 'speed', x: v }) }
  setParam(k, v) {
    const p = this.schema[k]
    if (!p) return false
    this.params[k] = Math.min(p.max, Math.max(p.min, Number(v)))
    this.post({ type: 'param', k, v: this.params[k] })
    return !!p.restart
  }
  reset() {
    this.post({ type: 'reset' })
    for (const k of this.keys) this.history[k] = []
    this.simTime = 0
  }
  act() {}
  tick() {}
  setWorld() {}
  receive(m) {
    this.lastBeat = performance.now()
    if (m.type === 'stats') {
      this.simTime = m.t
      this.latest = m.stats
      for (const k of this.keys) {
        const h = this.history[k]
        h.push(m.stats[k] ?? h.at(-1) ?? 0)
        if (h.length > 240) h.shift()
      }
    }
    if (m.type === 'error') this.onError?.(m.message)
  }
}
