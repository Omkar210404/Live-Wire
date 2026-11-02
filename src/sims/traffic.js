import { fit } from './util.js'

// Intelligent Driver Model (Treiber et al.) constants.
const A = 0.7, B = 2, S0 = 2, T = 1.5, LEN = 4.5
const BINS = 160, ROWS = 60, ROW_EVERY = 0.45, STOPPED = 3 // m/s

export default {
  id: 'traffic',
  name: 'Traffic flow & phantom jams',
  summary: 'Cars on a ring road follow the Intelligent Driver Model. With no accident and no bottleneck, small random braking grows into stop-and-go waves that travel backward.',
  keywords: ['traffic', 'jam', 'jams', 'car', 'cars', 'road', 'highway', 'freeway', 'motorway', 'commute', 'congestion', 'rush hour', 'driving', 'drivers', 'stop-and-go', 'phantom', 'lane', 'vehicles', 'gridlock'],
  view: '2d',
  timeScale: 3,
  params: {
    cars: { label: 'Number of cars', min: 5, max: 200, step: 1, default: 70, restart: true },
    roadLength: { label: 'Road length', min: 300, max: 3000, step: 50, default: 1100, unit: 'm', restart: true },
    maxSpeed: { label: 'Max speed', min: 5, max: 40, step: 0.5, default: 28, unit: 'm/s', help: 'Desired speed (28 m/s ≈ 100 km/h)' },
    braking: { label: 'Braking sensitivity', min: 0, max: 1, step: 0.01, default: 0.5, help: 'How often and how hard drivers tap the brakes for no reason' },
  },
  actions: [{ id: 'slowdown', label: 'Trigger a slowdown' }],
  labels: { avgSpeed: 'Avg. speed (km/h)', jammed: 'Cars in a jam' },
  series: [
    { key: 'avgSpeed', color: 'cool1' },
    { key: 'jammed', color: 'accent' },
  ],
  examples: ['show me how traffic jams form', 'why rush hour traffic stops for no reason'],

  init(p, rand) {
    const n = Math.max(1, Math.min(Math.round(p.cars), Math.floor(p.roadLength / (LEN + S0))))
    const L = p.roadLength
    const s = {
      n, L, rand, time: 0, brakeTimer: 0, brakeCar: 0,
      x: new Float64Array(n), v: new Float64Array(n),
      hist: [], rowAcc: 0,
    }
    for (let i = 0; i < n; i++) {
      s.x[i] = (i / n) * L + (rand() - 0.5) * 0.4 * (L / n - LEN - S0 > 0 ? 1 : 0)
      s.v[i] = Math.min(p.maxSpeed, 10)
    }
    return s
  },

  step(s, p, dt) {
    const { n, L, x, v, rand } = s
    const v0 = Math.max(1, p.maxSpeed)
    const sq = 2 * Math.sqrt(A * B)
    const acc = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const gap = n === 1 ? L - LEN : ((x[j] - x[i] + L) % L) - LEN
      const sStar = S0 + Math.max(0, v[i] * T + (v[i] * (v[i] - v[j])) / sq)
      acc[i] = A * (1 - Math.pow(v[i] / v0, 4) - Math.pow(sStar / Math.max(gap, 0.1), 2))
    }
    for (let i = 0; i < n; i++) {
      let vi = Math.max(0, v[i] + Math.max(acc[i], -9) * dt)
      if (rand() < p.braking * 0.04 * dt) vi *= 1 - 0.8 * p.braking // a random tap on the brakes
      if (s.brakeTimer > 0 && i === s.brakeCar) vi = Math.max(0, vi - 7 * dt)
      v[i] = vi
    }
    if (s.brakeTimer > 0) s.brakeTimer -= dt
    for (let i = 0; i < n; i++) {
      // Never drive into the car ahead.
      const j = (i + 1) % n
      const gap = n === 1 ? L : ((x[j] - x[i] + L) % L) - LEN
      const move = Math.min(v[i] * dt, Math.max(0, gap - 0.3))
      if (move < v[i] * dt) v[i] = move / dt
      x[i] = (x[i] + move) % L
    }
    s.time += dt
    s.rowAcc += dt
    if (s.rowAcc >= ROW_EVERY) {
      s.rowAcc = 0
      const sum = new Float32Array(BINS), cnt = new Uint16Array(BINS)
      for (let i = 0; i < n; i++) {
        const b = Math.floor((x[i] / L) * BINS) % BINS
        sum[b] += v[i]
        cnt[b]++
      }
      const row = new Float32Array(BINS).fill(-1)
      for (let b = 0; b < BINS; b++) if (cnt[b]) row[b] = sum[b] / cnt[b]
      s.hist.unshift(row)
      if (s.hist.length > ROWS) s.hist.pop()
    }
  },

  act(s, id) {
    if (id === 'slowdown') {
      s.brakeCar = Math.floor(s.rand() * s.n)
      s.brakeTimer = 2.5
    }
  },

  stats(s) {
    let sum = 0, jam = 0
    for (let i = 0; i < s.n; i++) { sum += s.v[i]; if (s.v[i] < STOPPED) jam++ }
    return { avgSpeed: Math.round((sum / s.n) * 3.6), jammed: jam }
  },

  render(ctx, s, p, theme, cw, ch) {
    const size = Math.min(cw, ch)
    const { s: k, ox, oy } = fit(1, 1, cw, ch, Math.max(18, size * 0.06))
    const cx = ox + k / 2, cy = oy + k / 2, R = k / 2
    const lane = Math.max(10, R * 0.07)
    // Space-time trail: each inner ring is an older snapshot. Stopped cars
    // glow, so a jam leaves a streak that drifts backward against the traffic.
    const dr = (R - lane * 1.6) * 0.8 / ROWS
    const da = (Math.PI * 2) / BINS
    ctx.lineWidth = Math.max(1, dr * 0.8)
    ctx.strokeStyle = theme.accent
    s.hist.forEach((row, r) => {
      const rr = R - lane * 1.6 - r * dr
      ctx.globalAlpha = 0.85 * (1 - r / ROWS)
      ctx.beginPath()
      for (let b = 0; b < BINS; b++) {
        const q = row[b]
        if (q < 0 || q >= STOPPED) continue
        const a0 = b * da - Math.PI / 2
        ctx.moveTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr)
        ctx.arc(cx, cy, rr, a0, a0 + da * 1.05)
      }
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    // Road.
    ctx.strokeStyle = theme.track
    ctx.lineWidth = lane * 1.5
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = theme.muted
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 1
    ctx.setLineDash([6, 10])
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    // Cars, coloured from warm (stopped) to cool (free flow).
    const carLen = Math.max(5, Math.min(lane * 0.9, ((Math.PI * 2 * R) / s.L) * LEN * 1.4))
    const v0 = Math.max(1, p.maxSpeed)
    for (let i = 0; i < s.n; i++) {
      const a = (s.x[i] / s.L) * Math.PI * 2 - Math.PI / 2
      const q = s.v[i] / v0
      ctx.save()
      ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      ctx.rotate(a + Math.PI / 2)
      ctx.fillStyle = s.v[i] < STOPPED ? theme.accent : q < 0.5 ? theme.cool2 : theme.cool1
      if (s.brakeTimer > 0 && i === s.brakeCar) { ctx.shadowColor = theme.accent; ctx.shadowBlur = 16 }
      ctx.fillRect(-carLen / 2, -lane * 0.28, carLen, lane * 0.56)
      ctx.restore()
    }
  },
}
