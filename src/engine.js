// Runs one template: fixed-timestep stepping, speed, pause, live params and
// a short stats history for the chart. Pure JS so the self-test can drive it.
import { makeRng, clamp } from './sims/util.js'

const HISTORY = 240
const SAMPLE_EVERY = 0.25 // sim seconds between chart samples

/** 1 on a decent desktop, less on phones / low-core machines. */
export function deviceScale() {
  if (typeof navigator === 'undefined') return 1
  const cores = navigator.hardwareConcurrency || 4
  const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')
  if (mobile || small) return cores >= 8 ? 0.5 : 0.35
  return cores <= 4 ? 0.6 : 1
}

/** Param schema with 'heavy' maxima scaled for this device. */
export function schemaFor(template, scale = 1) {
  const out = {}
  for (const [k, p] of Object.entries(template.params)) {
    if (!p.heavy || scale >= 1) { out[k] = p; continue }
    const max = Math.max(p.min, Math.round((p.max * scale) / p.step) * p.step)
    out[k] = { ...p, max, default: Math.min(p.default, max) }
  }
  return out
}

/** Clamp + snap a value to a param's range and step. */
export function snap(p, v) {
  const n = clamp(Number(v), p.min, p.max)
  const q = Math.round((n - p.min) / p.step) * p.step + p.min
  return +clamp(q, p.min, p.max).toFixed(6)
}

export class Engine {
  constructor(template, params, { world = { w: 1000, h: 640 }, seed, schema } = {}) {
    this.t = template
    this.schema = schema || template.params
    this.params = { ...params }
    this.world = world
    this.seed = seed ?? (Date.now() & 0xffffff)
    this.speed = 1
    this.playing = true
    this.reset()
  }

  reset() {
    this.rand = makeRng(this.seed++)
    this.state = this.t.init(this.params, this.rand, this.world)
    this.acc = 0
    this.simTime = 0
    this.sampleAcc = SAMPLE_EVERY
    this.history = Object.fromEntries(this.t.series.map((s) => [s.key, []]))
    this.latest = this.t.stats(this.state)
    this.sample()
  }

  /** Returns true when the change needed a restart. */
  setParam(key, value) {
    const p = this.schema[key]
    if (!p) return false
    this.params[key] = snap(p, value)
    if (p.restart) { this.reset(); return true }
    return false
  }

  setWorld(w, h) {
    const changed = Math.abs(h - this.world.h) > 1
    this.world = { w, h }
    if (!('w' in this.state)) return
    // First measurement of the stage: start over in the right shape (invisible this early).
    if (changed && this.simTime < 0.5) return this.reset()
    this.state.w = w; this.state.h = h // later resizes: agents wrap into the new bounds
  }

  act(id) {
    this.t.act?.(this.state, id)
  }

  /** Advance by a real-time delta (seconds). Safe to call every frame. */
  tick(realDt) {
    if (!this.playing) return 0
    const fixed = this.t.fixedDt || 1 / 60
    const dt = Math.min(realDt, 0.1) * this.speed * (this.t.timeScale || 1)
    this.acc += dt
    let steps = 0
    while (this.acc >= fixed && steps < 12) {
      this.t.step(this.state, this.params, fixed)
      this.acc -= fixed
      this.simTime += fixed
      this.sampleAcc += fixed
      steps++
    }
    if (steps === 12) this.acc = 0 // too slow to keep up: drop time instead of spiralling
    if (this.sampleAcc >= SAMPLE_EVERY) this.sample()
    return steps
  }

  sample() {
    this.sampleAcc = 0
    this.latest = this.t.stats(this.state)
    for (const s of this.t.series) {
      const h = this.history[s.key]
      h.push(this.latest[s.key])
      if (h.length > HISTORY) h.shift()
    }
  }
}
