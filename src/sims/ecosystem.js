import { Grid2D, fit, wrap } from './util.js'

const K = 1400 // prey carrying capacity (grass is finite)
const MAX_PRED = 600
const CATCH = 7, SENSE = 70
const PREY_SPEED = 22, PRED_SPEED = 45
const MEAL = 1, BREED_AT = 2, HANDLING = 0.6 // predator energy model

export default {
  id: 'ecosystem',
  name: 'Predator–prey ecosystem',
  summary: 'Agent-based Lotka–Volterra: prey breed toward a carrying capacity, predators hunt them, breed when well fed and starve when prey runs short. Populations chase each other in cycles.',
  keywords: ['predator', 'prey', 'ecosystem', 'ecology', 'wolves', 'wolf', 'sheep', 'rabbits', 'rabbit', 'foxes', 'fox', 'lynx', 'hare', 'hunt', 'food chain', 'lotka', 'volterra', 'population', 'wildlife', 'animals', 'sharks', 'nature', 'balance'],
  view: '2d',
  sharedScale: true,
  params: {
    preyBirth: { label: 'Prey birth rate', min: 0, max: 1.5, step: 0.01, default: 0.3, help: 'Chance per second a prey animal breeds (slows near capacity)' },
    predation: { label: 'Predation rate', min: 0, max: 1, step: 0.01, default: 0.6, help: 'Chance per second a predator in reach catches its prey' },
    predatorDeath: { label: 'Predator death rate', min: 0, max: 0.6, step: 0.005, default: 0.3, help: 'Energy a predator burns per second; at zero it starves' },
    startPrey: { label: 'Starting prey', min: 10, max: 1000, step: 10, default: 350, restart: true, heavy: true },
    startPredators: { label: 'Starting predators', min: 2, max: 200, step: 1, default: 25, restart: true },
  },
  labels: { prey: 'Prey', predators: 'Predators' },
  series: [
    { key: 'prey', color: 'cool1' },
    { key: 'predators', color: 'accent' },
  ],
  examples: ['wolves and sheep in a meadow', 'show me the boom-and-bust cycle of foxes and rabbits'],

  init(p, rand, world) {
    const s = { w: world.w, h: world.h, rand, prey: [], pred: [], grid: new Grid2D(SENSE / 2), time: 0 }
    for (let i = 0; i < p.startPrey; i++) s.prey.push(agent(s))
    for (let i = 0; i < p.startPredators; i++) s.pred.push(agent(s))
    return s
  },

  step(s, p, dt) {
    const { rand, w, h } = s
    s.time += dt
    // Prey: random walk + logistic breeding.
    const born = []
    const room = Math.max(0, 1 - s.prey.length / K)
    for (const a of s.prey) {
      wander(a, rand, dt, PREY_SPEED, w, h)
      if (rand() < p.preyBirth * room * dt) born.push(agent(s, a.x, a.y))
    }
    for (const b of born) s.prey.push(b)

    // Predators: chase the nearest prey they can sense.
    const xs = s.prey.map((a) => a.x), ys = s.prey.map((a) => a.y)
    s.grid.build(xs.length, xs, ys)
    const eaten = new Set()
    const kids = []
    const catchP = 1 - Math.pow(1 - p.predation, dt * 3)
    s.pred = s.pred.filter((a) => {
      a.e -= p.predatorDeath * dt
      if (a.e <= 0) return false
      a.cool = Math.max(0, a.cool - dt)
      let best = -1, bd = SENSE * SENSE
      s.grid.forNear(a.x, a.y, (j) => {
        if (eaten.has(j)) return
        const dx = xs[j] - a.x, dy = ys[j] - a.y, d = dx * dx + dy * dy
        if (d < bd) { bd = d; best = j }
      })
      if (best >= 0) {
        a.a = Math.atan2(ys[best] - a.y, xs[best] - a.x)
        a.x = wrap(a.x + Math.cos(a.a) * PRED_SPEED * dt, w)
        a.y = wrap(a.y + Math.sin(a.a) * PRED_SPEED * dt, h)
        if (a.cool === 0 && bd < CATCH * CATCH && rand() < catchP) {
          eaten.add(best)
          a.flash = 1
          a.cool = HANDLING
          a.e += MEAL
          if (a.e >= BREED_AT && s.pred.length + kids.length < MAX_PRED) {
            a.e /= 2
            const kid = agent(s, a.x, a.y)
            kid.e = a.e
            kids.push(kid)
          }
        }
      } else wander(a, rand, dt, PRED_SPEED * 0.6, w, h)
      a.flash = Math.max(0, (a.flash || 0) - dt * 2)
      return true
    })
    for (const k of kids) s.pred.push(k)
    if (eaten.size) s.prey = s.prey.filter((_, i) => !eaten.has(i))
  },

  stats(s) {
    return { prey: s.prey.length, predators: s.pred.length }
  },

  render(ctx, s, p, theme, cw, ch) {
    const { s: k, ox, oy } = fit(s.w, s.h, cw, ch)
    const r = Math.max(1.8, 2.4 * k)
    ctx.fillStyle = theme.cool1
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    for (const a of s.prey) { ctx.moveTo(ox + a.x * k + r, oy + a.y * k); ctx.arc(ox + a.x * k, oy + a.y * k, r, 0, Math.PI * 2) }
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = theme.accent
    for (const a of s.pred) {
      // Little arrowheads pointing where the predator is going.
      const x = ox + a.x * k, y = oy + a.y * k, L = r * 2.8
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a.a) * L, y + Math.sin(a.a) * L)
      ctx.lineTo(x + Math.cos(a.a + 2.5) * L * 0.7, y + Math.sin(a.a + 2.5) * L * 0.7)
      ctx.lineTo(x + Math.cos(a.a - 2.5) * L * 0.7, y + Math.sin(a.a - 2.5) * L * 0.7)
      ctx.fill()
      if (a.flash > 0) {
        ctx.globalAlpha = a.flash * 0.35
        ctx.beginPath(); ctx.arc(x, y, L * 2.2, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      }
    }
  },
}

function agent(s, x, y) {
  const j = 6
  return {
    x: x == null ? s.rand() * s.w : wrap(x + (s.rand() - 0.5) * j, s.w),
    y: y == null ? s.rand() * s.h : wrap(y + (s.rand() - 0.5) * j, s.h),
    a: s.rand() * Math.PI * 2,
    e: 0.6 + s.rand() * 0.8, cool: 0,
  }
}

function wander(a, rand, dt, speed, w, h) {
  a.a += (rand() - 0.5) * 4 * dt
  a.x = wrap(a.x + Math.cos(a.a) * speed * dt, w)
  a.y = wrap(a.y + Math.sin(a.a) * speed * dt, h)
}
