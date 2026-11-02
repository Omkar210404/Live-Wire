import { fit } from './util.js'

const EMPTY = 0, TREE = 1, FIRE = 2, ASH = 3
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

export default {
  id: 'forestfire',
  name: 'Forest fire spread',
  summary: 'A cellular automaton: each burning cell can ignite its eight neighbours, pushed by the wind. Tree density decides whether a fire fizzles out or sweeps the whole forest.',
  keywords: ['fire', 'forest', 'wildfire', 'bushfire', 'burn', 'burning', 'flames', 'blaze', 'trees', 'wind', 'cellular automaton', 'automata', 'grid', 'percolation', 'drought', 'wildland', 'smoke'],
  view: '2d',
  sharedScale: true,
  fixedDt: 1 / 9,
  params: {
    gridSize: { label: 'Grid size', min: 40, max: 300, step: 10, default: 160, restart: true, heavy: true },
    density: { label: 'Tree density', min: 0.1, max: 1, step: 0.01, default: 0.62, restart: true },
    ignition: { label: 'Ignition points', min: 1, max: 20, step: 1, default: 3, restart: true },
    spread: { label: 'Spread probability', min: 0, max: 1, step: 0.01, default: 0.55, help: 'Chance a burning neighbour lights a tree each step' },
    windDir: { label: 'Wind direction', min: 0, max: 359, step: 1, default: 90, unit: '°', help: 'Where the wind blows toward (0 = up, 90 = right)' },
    windStrength: { label: 'Wind strength', min: 0, max: 1, step: 0.01, default: 0.5 },
    regrowth: { label: 'Regrowth', min: 0, max: 0.05, step: 0.001, default: 0.004, help: 'Chance per second that bare ground grows a tree' },
  },
  actions: [{ id: 'lightning', label: 'Strike lightning' }],
  labels: { trees: 'Trees', burning: 'Burning', burnt: 'Burnt' },
  series: [
    { key: 'trees', color: 'tree' },
    { key: 'burning', color: 'accent' },
    { key: 'burnt', color: 'muted' },
  ],
  examples: ['a wildfire spreading through a dry forest with strong wind', 'how tree density decides if a fire spreads'],

  init(p, rand) {
    const N = Math.round(p.gridSize)
    const s = { N, rand, time: 0, calm: 0, cells: new Uint8Array(N * N), age: new Uint8Array(N * N), next: new Uint8Array(N * N) }
    for (let i = 0; i < N * N; i++) s.cells[i] = rand() < p.density ? TREE : EMPTY
    for (let k = 0; k < p.ignition; k++) ignite(s)
    return s
  },

  step(s, p, dt) {
    const { N, cells, next, age, rand } = s
    const wr = (p.windDir * Math.PI) / 180
    const wx = Math.sin(wr), wy = -Math.cos(wr) // screen coords: y grows downward
    // Probability that a fire at offset (dx,dy) from a tree lights it.
    const prob = DIRS.map(([dx, dy]) => {
      const d = Math.hypot(dx, dy)
      const along = (-dx * wx + -dy * wy) / d // fire->tree direction vs wind
      const q = p.spread * (1 + p.windStrength * 1.6 * along) * (d > 1 ? 0.7 : 1)
      return Math.max(0, Math.min(1, q))
    })
    const regrow = p.regrowth * dt
    let burning = 0
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, c = cells[i]
      if (c === FIRE) {
        if (++age[i] >= 3) { next[i] = ASH; age[i] = 0 } else { next[i] = FIRE; burning++ }
      } else if (c === TREE) {
        let keep = 1
        for (let d = 0; d < 8; d++) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
          if (nx >= 0 && ny >= 0 && nx < N && ny < N && cells[ny * N + nx] === FIRE) keep *= 1 - prob[d]
        }
        if (keep < 1 && rand() > keep) { next[i] = FIRE; age[i] = 0; burning++ } else next[i] = TREE
      } else next[i] = regrow > 0 && rand() < regrow ? TREE : c
    }
    s.cells = next
    s.next = cells
    s.time += dt
    // Keep the forest alive: with regrowth on, lightning strikes after a calm spell.
    s.calm = burning ? 0 : s.calm + dt
    if (p.regrowth > 0 && s.calm > 2.5) { ignite(s); s.calm = 0 }
  },

  act(s, id) {
    if (id === 'lightning') ignite(s)
  },

  stats(s) {
    const c = [0, 0, 0, 0]
    for (let i = 0; i < s.cells.length; i++) c[s.cells[i]]++
    return { trees: c[TREE], burning: c[FIRE], burnt: c[ASH] }
  },

  render(ctx, s, p, theme, cw, ch) {
    const { N, cells, age } = s
    if (!s.img || s.img.length !== N * N * 4) s.img = new Uint8ClampedArray(N * N * 4)
    const pal = [rgb(theme.bg), rgb(theme.tree), rgb(theme.accent), rgb(theme.ash)]
    const hot = rgb(theme.accent2)
    const flicker = s.time * 20
    for (let i = 0; i < N * N; i++) {
      const c = cells[i]
      const col = c === FIRE && (age[i] === 0 || (i + flicker) % 3 < 1) ? hot : pal[c]
      const o = i * 4
      s.img[o] = col[0]; s.img[o + 1] = col[1]; s.img[o + 2] = col[2]
      s.img[o + 3] = c === EMPTY ? 0 : 255
    }
    if (typeof document === 'undefined') return // self-test: buffer only
    if (!s.canvas || s.canvas.width !== N) {
      s.canvas = document.createElement('canvas')
      s.canvas.width = s.canvas.height = N
    }
    s.canvas.getContext('2d').putImageData(new ImageData(s.img, N, N), 0, 0)
    const { s: k, ox, oy } = fit(N, N, cw, ch, 16)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(s.canvas, ox, oy, N * k, N * k)
    // Wind arrow.
    const wr = (p.windDir * Math.PI) / 180, L = 18 + 26 * p.windStrength
    const ax = ox + N * k - 34, ay = oy + 34
    ctx.strokeStyle = theme.fg
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ax - Math.sin(wr) * L / 2, ay + Math.cos(wr) * L / 2)
    ctx.lineTo(ax + Math.sin(wr) * L / 2, ay - Math.cos(wr) * L / 2)
    ctx.lineTo(ax + Math.sin(wr - 0.5) * (L / 2 - 8), ay - Math.cos(wr - 0.5) * (L / 2 - 8))
    ctx.moveTo(ax + Math.sin(wr) * L / 2, ay - Math.cos(wr) * L / 2)
    ctx.lineTo(ax + Math.sin(wr + 0.5) * (L / 2 - 8), ay - Math.cos(wr + 0.5) * (L / 2 - 8))
    ctx.stroke()
    ctx.globalAlpha = 1
  },
}

function ignite(s) {
  const { N, cells, rand } = s
  for (let tries = 0; tries < 200; tries++) {
    const i = Math.floor(rand() * N * N)
    if (cells[i] === TREE) { cells[i] = FIRE; s.age[i] = 0; return }
  }
}

const cache = new Map()
function rgb(hex) {
  let v = cache.get(hex)
  if (!v) {
    const h = hex.replace('#', '')
    v = [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16))
    cache.set(hex, v)
  }
  return v
}
