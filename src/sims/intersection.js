import { fit } from './util.js'

// A 4-way crossroads with traffic lights. Cars arrive on each road, follow the
// Intelligent Driver Model, stop for red, and drive straight across on green.
const L = 120, BOX = 9, LANE = 3.5, LEN = 4.5
const A = 1.4, B = 2.5, S0 = 2, T = 1.3
const YELLOW = 3, ALL_RED = 1.5
// dir: unit vector of travel in screen coords (y down). Right-hand traffic.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] // E-bound, W-bound, S-bound, N-bound
const MAIN = (d) => d < 2 // E/W is the main road

export default {
  id: 'intersection',
  name: 'Traffic-light intersection',
  summary: 'A 4-way crossroads with traffic lights. Cars queue at red and drive straight across on green. Signal timing decides whether queues clear or grow.',
  setting: 'a 4-way crossroads with traffic lights (cars go straight across)',
  keywords: ['intersection', 'crossroad', 'crossroads', 'junction', 'traffic light', 'traffic lights', 'signal', 'signals', 'stoplight', 'red light', 'four-way', '4-way', 'crossing', 'queue', 'queues', 'gridlock', 'stuck'],
  view: '2d',
  timeScale: 2,
  params: {
    volume: { label: 'Traffic volume', min: 2, max: 40, step: 1, default: 26, unit: 'cars/min', help: 'Cars arriving per minute, all roads together' },
    mainShare: { label: 'Main-road share', min: 0.1, max: 0.9, step: 0.05, default: 0.6, help: 'Fraction of traffic on the east–west main road' },
    greenMain: { label: 'Green time: main road', min: 4, max: 45, step: 1, default: 16, unit: 's' },
    greenSide: { label: 'Green time: side road', min: 4, max: 45, step: 1, default: 10, unit: 's' },
    maxSpeed: { label: 'Speed limit', min: 5, max: 20, step: 0.5, default: 13, unit: 'm/s', help: '13 m/s ≈ 47 km/h' },
  },
  actions: [{ id: 'breakdown', label: 'Break down a car' }],
  labels: { waiting: 'Cars waiting', throughput: 'Cars through / min' },
  series: [
    { key: 'waiting', color: 'accent' },
    { key: 'throughput', color: 'cool1' },
  ],
  examples: ['a car stuck in a traffic jam at a four-way intersection', 'how traffic light timing causes queues'],

  init(p, rand) {
    return { rand, time: 0, phase: 0, phaseT: 0, lanes: [[], [], [], []], passed: [], nextId: 0, spawnAcc: [0, 0, 0, 0] }
  },

  step(s, p, dt) {
    s.time += dt
    // Signal cycle: main green -> yellow -> all red -> side green -> yellow -> all red
    const durations = [p.greenMain, YELLOW, ALL_RED, p.greenSide, YELLOW, ALL_RED]
    s.phaseT += dt
    if (s.phaseT >= durations[s.phase]) { s.phaseT = 0; s.phase = (s.phase + 1) % 6 }
    const v0 = p.maxSpeed
    for (let d = 0; d < 4; d++) {
      const lane = s.lanes[d]
      const light = lightFor(s.phase, d)
      // arrivals (Poisson), split between main and side road
      const rate = (p.volume / 60) * (MAIN(d) ? p.mainShare : 1 - p.mainShare) / 2
      if (s.rand() < rate * dt) {
        const last = lane[lane.length - 1]
        if (!last || last.s > -L + LEN + S0 + 4) lane.push({ id: s.nextId++, s: -L, v: Math.min(v0, 9), wait: 0, broken: 0 })
      }
      for (let i = 0; i < lane.length; i++) {
        const c = lane[i]
        let gap = Infinity, vLead = 0
        if (i > 0) { gap = lane[i - 1].s - c.s - LEN; vLead = lane[i - 1].v }
        // red/yellow light = a stopped car at the stop line (unless already too close to stop)
        const toLine = -BOX - c.s
        if (light !== 'green' && toLine > 0) {
          const canStop = toLine > (c.v * c.v) / (2 * B) || light === 'red'
          if (canStop && toLine < gap) { gap = toLine; vLead = 0 }
        }
        const sStar = S0 + Math.max(0, c.v * T + (c.v * (c.v - vLead)) / (2 * Math.sqrt(A * B)))
        let acc = A * (1 - Math.pow(c.v / v0, 4) - Math.pow(sStar / Math.max(gap, 0.1), 2))
        if (c.broken > 0) { c.broken -= dt; acc = -9 }
        c.v = Math.max(0, c.v + Math.max(acc, -9) * dt)
        const move = Math.min(c.v * dt, Math.max(0, gap - 0.2))
        if (move < c.v * dt) c.v = move / dt
        c.s += move
        if (c.v < 1 && c.s < -BOX) c.wait += dt
      }
      while (lane.length && lane[0].s > L) { s.passed.push(s.time); lane.shift() }
    }
    while (s.passed.length && s.passed[0] < s.time - 60) s.passed.shift()
  },

  act(s, id) {
    if (id !== 'breakdown') return
    const near = s.lanes.flat().filter((c) => c.s < -BOX - 6 && c.s > -70)
    const c = near[Math.floor(s.rand() * near.length)]
    if (c) c.broken = 10
  },

  stats(s) {
    let waiting = 0
    for (const lane of s.lanes) for (const c of lane) if (c.v < 1 && c.s < -BOX) waiting++
    return { waiting, throughput: Math.round((s.passed.length * 60) / Math.min(60, Math.max(s.time, 10))) }
  },

  render(ctx, s, p, theme, cw, ch) {
    const { s: k, ox, oy } = fit(L * 2, L * 2, cw, ch, 12)
    const X = (x) => ox + (x + L) * k, Y = (y) => oy + (y + L) * k
    ctx.fillStyle = theme.track
    ctx.fillRect(X(-L), Y(-LANE * 2), L * 2 * k, LANE * 4 * k)
    ctx.fillRect(X(-LANE * 2), Y(-L), LANE * 4 * k, L * 2 * k)
    ctx.strokeStyle = theme.muted
    ctx.globalAlpha = 0.5
    ctx.setLineDash([6, 8])
    ctx.beginPath()
    ctx.moveTo(X(-L), Y(0)); ctx.lineTo(X(-BOX), Y(0)); ctx.moveTo(X(BOX), Y(0)); ctx.lineTo(X(L), Y(0))
    ctx.moveTo(X(0), Y(-L)); ctx.lineTo(X(0), Y(-BOX)); ctx.moveTo(X(0), Y(BOX)); ctx.lineTo(X(0), Y(L))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    for (let d = 0; d < 4; d++) {
      const light = lightFor(s.phase, d)
      const [lx, ly] = posOf(d, -BOX - 3)
      const [nx, ny] = [-DIRS[d][1], DIRS[d][0]]
      ctx.fillStyle = light === 'green' ? '#3ddc84' : light === 'yellow' ? '#ffd23f' : '#ff4040'
      ctx.beginPath(); ctx.arc(X(lx + nx * 6), Y(ly + ny * 6), Math.max(3, 1.4 * k), 0, Math.PI * 2); ctx.fill()
      for (const c of s.lanes[d]) {
        const [x, y] = posOf(d, c.s)
        ctx.save()
        ctx.translate(X(x), Y(y))
        ctx.rotate(Math.atan2(DIRS[d][1], DIRS[d][0]))
        ctx.fillStyle = c.broken > 0 ? theme.accent : c.v < 1 ? theme.cool2 : theme.cool1
        ctx.fillRect((-LEN / 2) * k, -0.9 * k, LEN * k, 1.8 * k)
        ctx.restore()
      }
    }
  },
}

/** Light colour for a lane in a given phase. */
export function lightFor(phase, d) {
  const main = MAIN(d)
  if (phase === 0) return main ? 'green' : 'red'
  if (phase === 1) return main ? 'yellow' : 'red'
  if (phase === 3) return main ? 'red' : 'green'
  if (phase === 4) return main ? 'red' : 'yellow'
  return 'red'
}

/** World position (metres, centre = 0,0) of a point s metres along lane d. */
export function posOf(d, s) {
  const [dx, dy] = DIRS[d]
  return [dx * s - dy * (LANE / 2), dy * s + dx * (LANE / 2)]
}

export const GEOM = { L, BOX, LANE, LEN, DIRS }
