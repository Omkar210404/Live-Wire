// Experimental mode: the AI writes a brand-new simulation as JavaScript.
// The code never runs in the app itself. It runs inside a sandboxed iframe
// (opaque origin, no network via CSP), after a quick self-check.
// makeArt/compileSim/checkSim are self-contained so they can be injected into
// that iframe as source text, and also unit-tested in Node by the self-test.

export const CODE_SYSTEM = `You write small, self-contained 2D simulations in plain JavaScript for an HTML canvas.
Reply with ONLY one \`\`\`js code block that defines \`const sim = {...}\` in exactly this shape:

const sim = {
  title: 'Short title',
  description: 'One or two plain sentences: what is simulated and what to watch for.',
  params: {                      // 2 to 5 sliders the user can drag while it runs
    count: { label: 'Number of ants', min: 5, max: 300, step: 1, default: 60 },
    speed: { label: 'Speed', min: 10, max: 200, step: 5, default: 60 },
  },
  restart: ['count'],            // param keys that need init() to run again
  init(p, w, h) { return { /* the whole state */ } },   // w, h = canvas size in pixels
  step(s, p, dt, w, h) { /* advance the state by dt seconds (about 0.016) */ },
  draw(ctx, s, p, w, h) { /* draw the whole frame */ },
  stats(s) { return { 'Food in nest': 3 } },             // 1 to 3 live numbers
}

A drawing kit called \`art\` is available. USE IT for everything you draw, so objects look real:
  art.background(ctx, w, h, kind)   kind: 'grass' | 'road' | 'water' | 'sand' | 'floor' | 'sky' | 'space' | 'dirt' | 'snow'
  art.car(ctx, x, y, angle, color)          art.person(ctx, x, y, color)
  art.ant(ctx, x, y, angle, carrying)       art.animal(ctx, x, y, angle, color, size)
  art.bird(ctx, x, y, angle, color)         art.fish(ctx, x, y, angle, color)
  art.tree(ctx, x, y, size)                 art.house(ctx, x, y, size, color)
  art.road(ctx, x1, y1, x2, y2, width)      art.water(ctx, x, y, w, h)
  art.drop(ctx, x, y)                       art.fire(ctx, x, y, size)
  art.food(ctx, x, y, size)                 art.nest(ctx, x, y, size)
  art.light(ctx, x, y, 'red'|'yellow'|'green')   art.ball(ctx, x, y, r, color)
  art.box(ctx, x, y, w, h, color)           art.label(ctx, text, x, y)
  art.line(ctx, x1, y1, x2, y2, color, width)
Angles are in radians (0 = pointing right). Colours are CSS strings like '#ffb35c'.

Rules:
- Plain JavaScript only. No imports, no fetch, no document/window, no timers.
- Keep ALL state in the object returned by init(); step/draw/stats receive it as s.
- Start draw() with art.background(...). Things must keep moving and visibly react when the sliders change.
- Under 100 lines. Make sure every variable you use is defined.

Example (ants carrying food home):
\`\`\`js
const sim = {
  title: 'Ants bringing food home',
  description: 'Ants wander until they find food, then carry it straight back to the nest. More ants fill the nest faster.',
  params: {
    count: { label: 'Number of ants', min: 5, max: 200, step: 1, default: 50 },
    speed: { label: 'Ant speed', min: 10, max: 150, step: 5, default: 60 },
  },
  restart: ['count'],
  init(p, w, h) {
    const nest = { x: w / 2, y: h / 2 }
    const food = Array.from({ length: 12 }, () => ({ x: Math.random() * w, y: Math.random() * h, left: 5 }))
    const ants = Array.from({ length: p.count }, () => ({ x: nest.x, y: nest.y, a: Math.random() * 6.28, carrying: false }))
    return { nest, food, ants, stored: 0 }
  },
  step(s, p, dt, w, h) {
    for (const ant of s.ants) {
      if (ant.carrying) ant.a = Math.atan2(s.nest.y - ant.y, s.nest.x - ant.x)
      else ant.a += (Math.random() - 0.5) * 3 * dt
      ant.x = Math.min(w, Math.max(0, ant.x + Math.cos(ant.a) * p.speed * dt))
      ant.y = Math.min(h, Math.max(0, ant.y + Math.sin(ant.a) * p.speed * dt))
      if (!ant.carrying) for (const f of s.food) if (f.left > 0 && Math.hypot(f.x - ant.x, f.y - ant.y) < 12) { f.left--; ant.carrying = true }
      if (ant.carrying && Math.hypot(s.nest.x - ant.x, s.nest.y - ant.y) < 14) { ant.carrying = false; s.stored++; ant.a += Math.PI }
    }
  },
  draw(ctx, s, p, w, h) {
    art.background(ctx, w, h, 'dirt')
    art.nest(ctx, s.nest.x, s.nest.y, 30)
    for (const f of s.food) if (f.left > 0) art.food(ctx, f.x, f.y, 4 + f.left)
    for (const ant of s.ants) art.ant(ctx, ant.x, ant.y, ant.a, ant.carrying)
  },
  stats(s) { return { 'Food in nest': s.stored } },
}
\`\`\``

export function codeUserPrompt(prompt, previous) {
  if (!previous) return `Write the simulation for: ${prompt}`
  return `Write the simulation for: ${prompt}\n\nYour previous code failed with this error:\n${previous.error}\n\nPrevious code:\n\`\`\`js\n${previous.code.slice(0, 6000)}\n\`\`\`\nReturn the complete corrected code in one \`\`\`js block.`
}

/** Pull the code out of a model reply (fenced or not). */
export function extractCode(text) {
  const fence = String(text || '').match(/```(?:js|javascript)?\s*\n([\s\S]*?)(?:```|$)/i)
  const code = (fence ? fence[1] : String(text || '')).trim()
  if (!/\bsim\s*=/.test(code)) throw new Error('reply did not define `const sim = {...}`')
  return code
}

/** The drawing kit the generated code calls. Self-contained (injected into the sandbox). */
export function makeArt() {
  const P = Math.PI * 2
  const circle = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, P); ctx.fill() }
  const turn = (ctx, x, y, a, fn) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0); fn(); ctx.restore() }
  const BG = { grass: ['#2f5d34', '#356b3a'], road: ['#2a2d34', '#30343c'], water: ['#123a5c', '#164670'], sand: ['#c8a96a', '#d2b477'], floor: ['#3b3f4a', '#424754'], sky: ['#1d3557', '#274b74'], space: ['#05070d', '#0a0e1a'], dirt: ['#5a4632', '#634d37'], snow: ['#dfe7ef', '#eef3f8'] }
  const kit = {
    background(ctx, w, h, kind) {
      const [a, b] = BG[kind] || BG.floor
      ctx.fillStyle = a; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = b
      for (let i = 0; i < 160; i++) { const x = (i * 97.3) % w, y = (i * 57.7 + (i % 7) * 31) % h; ctx.fillRect(x, y, 3, 3) }
      if (kind === 'space') for (let i = 0; i < 90; i++) circle(ctx, (i * 131.7) % w, (i * 71.3) % h, i % 5 ? 0.8 : 1.4, '#cfd8ff')
    },
    car(ctx, x, y, a, color = '#3e8ef7', s = 1) {
      turn(ctx, x, y, a, () => {
        ctx.fillStyle = '#111'; for (const [dx, dy] of [[-7, -6], [5, -6], [-7, 4], [5, 4]]) ctx.fillRect(dx * s, dy * s, 4 * s, 2 * s)
        ctx.fillStyle = color; ctx.fillRect(-10 * s, -5 * s, 20 * s, 10 * s)
        ctx.fillStyle = '#1c2230'; ctx.fillRect(-3 * s, -4 * s, 8 * s, 8 * s)
        ctx.fillStyle = '#fff6c8'; ctx.fillRect(9 * s, -4 * s, 1.5 * s, 2 * s); ctx.fillRect(9 * s, 2 * s, 1.5 * s, 2 * s)
      })
    },
    person(ctx, x, y, color = '#6cb6ff', s = 1) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y + 4 * s, 4 * s, 6 * s, 0, 0, P); ctx.fill()
      circle(ctx, x, y - 4 * s, 3 * s, '#e8c4a0')
    },
    ant(ctx, x, y, a, carrying) {
      turn(ctx, x, y, a, () => {
        ctx.strokeStyle = '#1a1310'; ctx.lineWidth = 1
        ctx.beginPath(); for (const k of [-3, 0, 3]) { ctx.moveTo(k, -4); ctx.lineTo(k + 1, 4) } ctx.stroke()
        circle(ctx, -4, 0, 2.6, '#2a1d16'); circle(ctx, 0, 0, 2, '#2a1d16'); circle(ctx, 3.5, 0, 2.2, '#2a1d16')
        if (carrying) circle(ctx, 7, 0, 2.6, '#9be15d')
      })
    },
    animal(ctx, x, y, a, color = '#e8e2d6', size = 1) {
      turn(ctx, x, y, a, () => {
        ctx.fillStyle = '#2b2622'; for (const [dx, dy] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) ctx.fillRect(dx * size, dy * size, 2 * size, 2 * size)
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 8 * size, 5 * size, 0, 0, P); ctx.fill()
        circle(ctx, 9 * size, 0, 3 * size, color)
      })
    },
    bird(ctx, x, y, a, color = '#e8ecf4') {
      turn(ctx, x, y, a, () => {
        const f = Math.sin(Date.now() / 90 + x) * 3
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7 - f); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7 + f); ctx.closePath(); ctx.fill()
      })
    },
    fish(ctx, x, y, a, color = '#ffb35c') {
      turn(ctx, x, y, a, () => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, P); ctx.fill()
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-13, -5); ctx.lineTo(-13, 5); ctx.closePath(); ctx.fill()
        circle(ctx, 4, -1, 1, '#111')
      })
    },
    tree(ctx, x, y, size = 12) {
      ctx.fillStyle = '#6b4a32'; ctx.fillRect(x - size * 0.12, y, size * 0.24, size * 0.6)
      circle(ctx, x, y - size * 0.1, size * 0.65, '#2f7d3c'); circle(ctx, x - size * 0.3, y + size * 0.1, size * 0.4, '#3a8f45')
    },
    house(ctx, x, y, size = 20, color = '#e6dfd4') {
      ctx.fillStyle = color; ctx.fillRect(x - size / 2, y - size / 2, size, size)
      ctx.fillStyle = '#9c4f3d'; ctx.beginPath(); ctx.moveTo(x - size * 0.65, y - size / 2); ctx.lineTo(x, y - size * 1.05); ctx.lineTo(x + size * 0.65, y - size / 2); ctx.fill()
      ctx.fillStyle = '#ffc977'; ctx.fillRect(x - size * 0.3, y - size * 0.2, size * 0.2, size * 0.2); ctx.fillRect(x + size * 0.1, y - size * 0.2, size * 0.2, size * 0.2)
    },
    road(ctx, x1, y1, x2, y2, width = 40) {
      ctx.strokeStyle = '#3a3e47'; ctx.lineWidth = width; ctx.lineCap = 'butt'
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = '#e8c547'; ctx.lineWidth = 2; ctx.setLineDash([12, 12])
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([])
    },
    water(ctx, x, y, w, h) {
      ctx.fillStyle = '#1f6fb2'; ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5
      const t = Date.now() / 600
      ctx.beginPath()
      for (let yy = y + 8; yy < y + h; yy += 14) for (let xx = x + ((yy / 14) % 2) * 10; xx < x + w - 10; xx += 30) { ctx.moveTo(xx, yy + Math.sin(t + xx) * 2); ctx.lineTo(xx + 10, yy + Math.sin(t + xx + 1) * 2) }
      ctx.stroke()
    },
    drop(ctx, x, y) {
      ctx.fillStyle = '#8fd0ff'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.quadraticCurveTo(x + 3, y, x, y + 2); ctx.quadraticCurveTo(x - 3, y, x, y - 5); ctx.fill()
    },
    fire(ctx, x, y, size = 10) {
      const f = 0.8 + Math.random() * 0.4
      circle(ctx, x, y, size * f, 'rgba(255,90,30,0.85)'); circle(ctx, x, y - size * 0.3, size * 0.6 * f, '#ffb347'); circle(ctx, x, y - size * 0.4, size * 0.3 * f, '#fff1a8')
    },
    food(ctx, x, y, size = 6) { circle(ctx, x, y, size, '#9be15d'); circle(ctx, x - size * 0.3, y - size * 0.3, size * 0.35, '#c8f59a') },
    nest(ctx, x, y, size = 24) { circle(ctx, x, y, size, '#7a5a3a'); circle(ctx, x, y, size * 0.6, '#5c4129'); circle(ctx, x, y, size * 0.25, '#20160e') },
    light(ctx, x, y, state) {
      ctx.fillStyle = '#1b1e25'; ctx.fillRect(x - 6, y - 17, 12, 34)
      ;['red', 'yellow', 'green'].forEach((c, i) => circle(ctx, x, y - 10 + i * 10, 4, state === c ? { red: '#ff3b30', yellow: '#ffcc33', green: '#34e07a' }[c] : '#333842'))
    },
    ball(ctx, x, y, r, color = '#ffb35c') { circle(ctx, x, y, r, color) },
    box(ctx, x, y, w, h, color = '#8b8cf5') { ctx.fillStyle = color; ctx.fillRect(x, y, w, h) },
    label(ctx, text, x, y) { ctx.fillStyle = '#e8ecf4'; ctx.font = '13px sans-serif'; ctx.fillText(String(text), x, y) },
    line(ctx, x1, y1, x2, y2, color = '#e8ecf4', width = 2) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() },
  }
  // Names small models tend to guess. Anything else becomes a harmless no-op instead of a crash.
  Object.assign(kit, { rect: kit.box, circle: kit.ball, text: kit.label, river: kit.water, lake: kit.water, rain: kit.drop, flame: kit.fire,
    building: kit.house, vehicle: kit.car, human: kit.person, crowd: kit.person, sheep: kit.animal, wolf: kit.animal, dog: kit.animal, cow: kit.animal })
  return typeof Proxy === 'function' ? new Proxy(kit, { get: (t, k) => (k in t ? t[k] : () => {}) }) : kit
}

/** Evaluate the code and normalise its params. Throws a readable error. Self-contained. */
export function compileSim(code, art) {
  let sim
  try {
    // eslint-disable-next-line no-new-func
    sim = new Function('art', '"use strict";\n' + code + '\n;return typeof sim === "undefined" ? undefined : sim;')(art)
  } catch (e) {
    throw new Error('code does not run: ' + (e && e.message))
  }
  if (!sim || typeof sim !== 'object') throw new Error('code must define `const sim = { ... }`')
  for (const f of ['init', 'step', 'draw']) if (typeof sim[f] !== 'function') throw new Error('sim.' + f + ' must be a function')
  const restart = Array.isArray(sim.restart) ? sim.restart : []
  const params = {}
  for (const [k, raw] of Object.entries(sim.params && typeof sim.params === 'object' ? sim.params : {}).slice(0, 8)) {
    const min = Number(raw && raw.min), max = Number(raw && raw.max)
    if (!isFinite(min) || !isFinite(max) || max <= min) continue
    const step = Number(raw.step) > 0 ? Number(raw.step) : (max - min) / 100
    const d = Number(raw.default)
    params[k] = { label: String(raw.label || k).slice(0, 32), min, max, step, default: Math.min(max, Math.max(min, isFinite(d) ? d : min)), restart: restart.includes(k) }
  }
  sim.params = params
  sim.title = String(sim.title || 'AI-generated simulation').slice(0, 60)
  sim.description = String(sim.description || '').slice(0, 320)
  return sim
}

/** Run init + 60 steps + a draw + stats; returns { p, s, stats }. Throws on any error. Self-contained. */
export function checkSim(sim, ctx, w, h) {
  const p = {}
  for (const k in sim.params) p[k] = sim.params[k].default
  let s
  try { s = sim.init(p, w, h) } catch (e) { throw new Error('init() failed: ' + (e && e.message)) }
  if (s === undefined || s === null) s = {}
  try { for (let i = 0; i < 60; i++) sim.step(s, p, 1 / 60, w, h) } catch (e) { throw new Error('step() failed: ' + (e && e.message)) }
  try { sim.draw(ctx, s, p, w, h) } catch (e) { throw new Error('draw() failed: ' + (e && e.message)) }
  let raw = {}
  try { raw = typeof sim.stats === 'function' ? sim.stats(s) || {} : {} } catch (e) { throw new Error('stats() failed: ' + (e && e.message)) }
  const stats = {}
  for (const [k, v] of Object.entries(raw).slice(0, 3)) if (typeof v === 'number' && isFinite(v)) stats[String(k).slice(0, 28)] = Math.round(v * 100) / 100
  return { p, s, stats }
}

/**
 * The sandbox page. Runs the sim, answers messages from the app:
 *   in:  load {code, params?}, param {k, v}, reset, play {on}, speed {x}
 *   out: boot, ready {title, description, params, stats}, stats {t, stats}, error {message}
 */
export function sandboxHtml() {
  const runner = `
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), art = makeArt()
let sim = null, s = null, p = {}, playing = true, speed = 1, w = 0, h = 0, t = 0, acc = 0, last = performance.now(), lastStats = 0
const send = (m) => parent.postMessage(Object.assign({ lw: 1 }, m), '*')
function size() { const d = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0) }
addEventListener('resize', size); size()
function fail(where, e) { sim = null; send({ type: 'error', message: where + (e && e.message ? e.message : String(e)) }) }
function restart() { try { s = sim.init(p, w, h); if (s == null) s = {}; t = 0 } catch (e) { fail('init() failed: ', e) } }
onmessage = (e) => {
  const m = e.data || {}
  try {
    if (m.type === 'load') {
      sim = compileSim(m.code, art)
      const r = checkSim(sim, ctx, w || 800, h || 500)
      p = r.p; s = r.s; t = 0
      if (m.params) for (const k in m.params) if (k in sim.params) p[k] = m.params[k]
      if (m.params) restart()
      send({ type: 'ready', title: sim.title, description: sim.description, params: sim.params, stats: r.stats })
    }
    if (!sim) return
    if (m.type === 'param') { p[m.k] = m.v; if (sim.params[m.k] && sim.params[m.k].restart) restart() }
    if (m.type === 'reset') restart()
    if (m.type === 'play') playing = !!m.on
    if (m.type === 'speed') speed = m.x
  } catch (err) { fail('', err) }
}
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min((now - last) / 1000, 0.1); last = now
  if (!sim) return
  try {
    if (playing) { acc += dt * speed; let n = 0; while (acc >= 1 / 60 && n++ < 8) { sim.step(s, p, 1 / 60, w, h); acc -= 1 / 60; t += 1 / 60 } if (n >= 8) acc = 0 }
    sim.draw(ctx, s, p, w, h)
    if (now - lastStats > 250) {
      lastStats = now
      const raw = typeof sim.stats === 'function' ? sim.stats(s) || {} : {}
      const stats = {}
      for (const [k, v] of Object.entries(raw).slice(0, 3)) if (typeof v === 'number' && isFinite(v)) stats[String(k).slice(0, 28)] = Math.round(v * 100) / 100
      send({ type: 'stats', t, stats })
    }
  } catch (e) { fail('runtime error: ', e) }
}
requestAnimationFrame(frame)
send({ type: 'boot' })`
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b1020}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="c"></canvas><script>
const makeArt = (${makeArt.toString()});
const compileSim = (${compileSim.toString()});
const checkSim = (${checkSim.toString()});
${runner}
</script></body></html>`
}
