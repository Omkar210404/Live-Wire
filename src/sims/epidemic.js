import { Grid2D, fit, wrap } from './util.js'

const S = 0, I = 1, R = 2
const CAP = 3000

export default {
  id: 'epidemic',
  name: 'Epidemic spread',
  summary: 'Agent-based SIR model: people wander, infection jumps between people who come close, then they recover with immunity.',
  setting: 'people wandering around an open city square',
  keywords: ['disease', 'epidemic', 'pandemic', 'virus', 'infection', 'infect', 'outbreak', 'flu', 'covid', 'zombie', 'contagion', 'sir', 'rumor', 'rumour', 'gossip', 'meme', 'viral', 'vaccine', 'quarantine', 'plague', 'immunity'],
  view: '2d',
  sharedScale: true,
  params: {
    population: { label: 'Population', min: 50, max: CAP, step: 10, default: 800, heavy: true, help: 'Number of people' },
    radius: { label: 'Infection radius', min: 2, max: 30, step: 0.5, default: 12, help: 'How close counts as contact' },
    chance: { label: 'Infection chance', min: 0, max: 1, step: 0.01, default: 0.6, help: 'Chance per second of contact' },
    recovery: { label: 'Recovery time', min: 1, max: 30, step: 0.5, default: 7, unit: 's', help: 'Seconds until an infected person recovers' },
    initialInfected: { label: 'Initial infected', min: 1, max: 50, step: 1, default: 4, restart: true },
    speed: { label: 'Movement speed', min: 0, max: 120, step: 1, default: 45, help: 'How fast people move' },
  },
  labels: { S: 'Susceptible', I: 'Infected', R: 'Recovered' },
  series: [
    { key: 'S', color: 'cool1' },
    { key: 'I', color: 'accent' },
    { key: 'R', color: 'cool3' },
  ],
  examples: ['simulate how a disease spreads through a city', 'a zombie outbreak in a crowded mall'],

  init(p, rand, world) {
    const s = {
      w: world.w, h: world.h, n: 0, time: 0,
      x: new Float32Array(CAP), y: new Float32Array(CAP),
      a: new Float32Array(CAP), // heading
      st: new Uint8Array(CAP), t: new Float32Array(CAP),
      grid: new Grid2D(), rand,
    }
    resize(s, p.population)
    const k = Math.min(p.initialInfected, s.n)
    for (let i = 0; i < k; i++) s.st[i] = I
    return s
  },

  step(s, p, dt) {
    resize(s, p.population)
    const { x, y, a, st, t, rand, n, w, h } = s
    s.time += dt
    for (let i = 0; i < n; i++) {
      a[i] += (rand() - 0.5) * 3 * dt
      x[i] = wrap(x[i] + Math.cos(a[i]) * p.speed * dt, w)
      y[i] = wrap(y[i] + Math.sin(a[i]) * p.speed * dt, h)
    }
    // Hash only infected agents, then let each susceptible look around.
    const ix = [], iy = []
    for (let i = 0; i < n; i++) if (st[i] === I) { ix.push(x[i]); iy.push(y[i]) }
    s.grid.build(ix.length, ix, iy, Math.max(p.radius, 4))
    const r2 = p.radius * p.radius
    const keep = 1 - p.chance
    for (let i = 0; i < n; i++) {
      if (st[i] === I) {
        t[i] += dt
        if (t[i] >= p.recovery) st[i] = R
      } else if (st[i] === S && ix.length) {
        let contacts = 0
        s.grid.forNear(x[i], y[i], (j) => {
          const dx = ix[j] - x[i], dy = iy[j] - y[i]
          if (dx * dx + dy * dy < r2) contacts++
        })
        if (contacts && rand() < 1 - Math.pow(keep, contacts * dt)) { st[i] = I; t[i] = 0 }
      }
    }
  },

  stats(s) {
    const c = [0, 0, 0]
    for (let i = 0; i < s.n; i++) c[s.st[i]]++
    return { S: c[S], I: c[I], R: c[R] }
  },

  render(ctx, s, p, theme, cw, ch) {
    const { s: k, ox, oy } = fit(s.w, s.h, cw, ch)
    const dot = Math.max(1.6, Math.min(3.2, 2600 / (s.n + 400))) * Math.max(0.8, k)
    const groups = [[theme.cool1, S], [theme.cool3, R]]
    for (const [color, state] of groups) {
      ctx.fillStyle = color
      ctx.globalAlpha = state === R ? 0.55 : 0.85
      ctx.beginPath()
      for (let i = 0; i < s.n; i++) if (s.st[i] === state) {
        ctx.moveTo(ox + s.x[i] * k + dot, oy + s.y[i] * k)
        ctx.arc(ox + s.x[i] * k, oy + s.y[i] * k, dot, 0, Math.PI * 2)
      }
      ctx.fill()
    }
    // Infected: faint contact radius + bright core.
    ctx.globalAlpha = 0.09
    ctx.fillStyle = theme.accent
    ctx.beginPath()
    const rr = p.radius * k
    for (let i = 0; i < s.n; i++) if (s.st[i] === I) {
      ctx.moveTo(ox + s.x[i] * k + rr, oy + s.y[i] * k)
      ctx.arc(ox + s.x[i] * k, oy + s.y[i] * k, rr, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    for (let i = 0; i < s.n; i++) if (s.st[i] === I) {
      ctx.moveTo(ox + s.x[i] * k + dot * 1.3, oy + s.y[i] * k)
      ctx.arc(ox + s.x[i] * k, oy + s.y[i] * k, dot * 1.3, 0, Math.PI * 2)
    }
    ctx.fill()
  },
}

/** Grow or shrink the live population without restarting. */
function resize(s, target) {
  const n = Math.max(0, Math.min(CAP, Math.round(target)))
  for (let i = s.n; i < n; i++) {
    s.x[i] = s.rand() * s.w
    s.y[i] = s.rand() * s.h
    s.a[i] = s.rand() * Math.PI * 2
    s.st[i] = S
    s.t[i] = 0
  }
  s.n = n
}
