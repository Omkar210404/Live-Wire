const CAP = 800
const K = 16       // gravity scale so default orbits look good on screen
const MASS = 400   // total mass, shared by all particles (count-independent)
const EPS2 = 2.25  // softening, avoids infinite forces at close range

export default {
  id: 'gravity',
  name: 'Gravity (n-body)',
  summary: 'Every particle pulls on every other with Newtonian gravity (softened). A spinning cloud collapses into clumps, arms and orbiting clusters.',
  setting: 'particles in empty space',
  keywords: ['gravity', 'galaxy', 'galaxies', 'planet', 'planets', 'star', 'stars', 'orbit', 'orbits', 'n-body', 'nbody', 'space', 'universe', 'cosmic', 'solar', 'nebula', 'cluster', 'particles', 'particle', 'physics', 'attraction', 'black hole', 'asteroid', 'dust', 'accretion'],
  view: '3d',
  params: {
    count: { label: 'Particle count', min: 50, max: CAP, step: 10, default: 400, heavy: true },
    gravity: { label: 'Gravity strength', min: 0, max: 5, step: 0.05, default: 1 },
    damping: { label: 'Damping', min: 0, max: 1, step: 0.01, default: 0.02, help: 'Friction that bleeds energy away' },
    spread: { label: 'Initial spread', min: 10, max: 80, step: 1, default: 45, restart: true, help: 'Radius of the starting cloud' },
    spin: { label: 'Initial spin', min: 0, max: 1.5, step: 0.05, default: 0.85, restart: true, help: '1 = circular orbits, 0 = straight collapse' },
  },
  labels: { energy: 'Kinetic energy', radius: 'Mean radius' },
  series: [
    { key: 'energy', color: 'accent' },
    { key: 'radius', color: 'cool1' },
  ],
  render3d: { shape: 'sphere', size: 0.5, palette: ['cool3', 'cool1', 'accent'], bounds: 38 },
  examples: ['how a spinning gas cloud becomes a galaxy', 'dust collapsing under its own gravity'],

  init(p, rand) {
    const s = {
      n: 0, rand, time: 0, energy: 0, radius: 0, spread: p.spread, spin: p.spin,
      pos: new Float32Array(CAP * 3), vel: new Float32Array(CAP * 3), kind: new Uint8Array(CAP),
      acc: new Float32Array(CAP * 3),
    }
    resize(s, p.count, p.gravity)
    return s
  },

  step(s, p, dt) {
    resize(s, p.count, p.gravity)
    const { pos, vel, acc, n, kind } = s
    const gm = K * p.gravity * (MASS / Math.max(n, 1))
    acc.fill(0, 0, n * 3)
    for (let i = 0; i < n; i++) {
      const xi = pos[i * 3], yi = pos[i * 3 + 1], zi = pos[i * 3 + 2]
      let ax = 0, ay = 0, az = 0
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j * 3] - xi, dy = pos[j * 3 + 1] - yi, dz = pos[j * 3 + 2] - zi
        const d2 = dx * dx + dy * dy + dz * dz + EPS2
        const f = gm / (d2 * Math.sqrt(d2))
        ax += dx * f; ay += dy * f; az += dz * f
        acc[j * 3] -= dx * f; acc[j * 3 + 1] -= dy * f; acc[j * 3 + 2] -= dz * f
      }
      acc[i * 3] += ax; acc[i * 3 + 1] += ay; acc[i * 3 + 2] += az
    }
    const keep = Math.max(0, 1 - p.damping * dt)
    let ke = 0, rad = 0
    for (let i = 0; i < n; i++) {
      let sp = 0
      for (let a = 0; a < 3; a++) {
        const v = (vel[i * 3 + a] + acc[i * 3 + a] * dt) * keep
        vel[i * 3 + a] = v
        pos[i * 3 + a] += v * dt
        sp += v * v
      }
      ke += sp * 0.5
      rad += Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      kind[i] = sp < 60 ? 0 : sp < 260 ? 1 : 2
    }
    s.energy = n ? ke / n : 0
    s.radius = n ? rad / n : 0
    s.time += dt
  },

  stats(s) {
    return { energy: Math.round(s.energy), radius: Math.round(s.radius * 10) / 10 }
  },
}

/** Add particles on a spinning disk (or drop extras) without restarting. */
function resize(s, target, gravity) {
  const n = Math.max(0, Math.min(CAP, Math.round(target)))
  for (let i = s.n; i < n; i++) {
    const { rand, spread } = s
    const r = spread * Math.sqrt(rand()) + 0.5
    const th = rand() * Math.PI * 2
    s.pos[i * 3] = Math.cos(th) * r
    s.pos[i * 3 + 1] = (rand() - 0.5) * spread * 0.12
    s.pos[i * 3 + 2] = Math.sin(th) * r
    const enclosed = MASS * Math.min(1, (r / spread) ** 2)
    const v = s.spin * Math.sqrt((K * Math.max(gravity, 0.05) * enclosed) / r)
    s.vel[i * 3] = -Math.sin(th) * v
    s.vel[i * 3 + 1] = 0
    s.vel[i * 3 + 2] = Math.cos(th) * v
  }
  s.n = n
}
