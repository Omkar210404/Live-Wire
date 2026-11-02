const CAP = 1500
const B = 50 // half-size of the cube the flock lives in

export default {
  id: 'boids',
  name: 'Flocking (boids)',
  summary: 'Reynolds boids in 3D: each agent only follows three local rules (separation, alignment, cohesion), yet a coordinated flock emerges.',
  keywords: ['flock', 'flocking', 'bird', 'birds', 'boids', 'starling', 'murmuration', 'fish', 'school', 'swarm', 'herd', 'drone', 'drones', 'crowd', 'bees', 'insects', 'collective', 'emergent', 'emergence'],
  view: '3d',
  params: {
    count: { label: 'Number of agents', min: 50, max: CAP, step: 10, default: 600, heavy: true },
    separation: { label: 'Separation', min: 0, max: 3, step: 0.05, default: 1.5, help: 'Urge to avoid crowding neighbours' },
    alignment: { label: 'Alignment', min: 0, max: 3, step: 0.05, default: 1.0, help: 'Urge to match neighbours’ heading' },
    cohesion: { label: 'Cohesion', min: 0, max: 3, step: 0.05, default: 0.9, help: 'Urge to move toward the group centre' },
    speed: { label: 'Speed', min: 5, max: 60, step: 1, default: 22 },
    vision: { label: 'Vision radius', min: 2, max: 30, step: 0.5, default: 9, help: 'How far each agent can see' },
  },
  labels: { order: 'Alignment order', neighbours: 'Avg. neighbours' },
  series: [
    { key: 'order', color: 'accent', max: 1 },
    { key: 'neighbours', color: 'cool1' },
  ],
  render3d: { shape: 'cone', size: 1.1, palette: ['cool3', 'cool1', 'accent'], bounds: B },
  examples: ['a murmuration of starlings at dusk', 'how a school of fish avoids crowding'],

  init(p, rand) {
    const s = {
      n: 0, rand, time: 0, order: 0, neighbours: 0,
      pos: new Float32Array(CAP * 3), vel: new Float32Array(CAP * 3), kind: new Uint8Array(CAP),
      cells: new Map(), acc: new Float32Array(CAP * 3),
    }
    resize(s, p.count, p.speed)
    return s
  },

  step(s, p, dt) {
    resize(s, p.count, p.speed)
    const { pos, vel, kind, n, cells } = s
    const vr = p.vision, vr2 = vr * vr, sepR2 = vr2 * 0.25
    const maxForce = p.speed * 1.5
    cells.clear()
    const key = (x, y, z) => ((x * 92837111) ^ (y * 689287499) ^ (z * 283923481)) | 0
    for (let i = 0; i < n; i++) {
      const k = key(Math.floor(pos[i * 3] / vr), Math.floor(pos[i * 3 + 1] / vr), Math.floor(pos[i * 3 + 2] / vr))
      let b = cells.get(k)
      if (!b) cells.set(k, (b = []))
      b.push(i)
    }
    const acc = s.acc
    let sumN = 0
    for (let i = 0; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2]
      const cx0 = Math.floor(px / vr), cy0 = Math.floor(py / vr), cz0 = Math.floor(pz / vr)
      let cnt = 0, ax = 0, ay = 0, az = 0, mx = 0, my = 0, mz = 0, sx = 0, sy = 0, sz = 0
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const b = cells.get(key(cx0 + dx, cy0 + dy, cz0 + dz))
        if (!b) continue
        for (const j of b) {
          if (j === i) continue
          const ex = pos[j * 3] - px, ey = pos[j * 3 + 1] - py, ez = pos[j * 3 + 2] - pz
          const d2 = ex * ex + ey * ey + ez * ez
          if (d2 > vr2) continue
          cnt++
          ax += vel[j * 3]; ay += vel[j * 3 + 1]; az += vel[j * 3 + 2]
          mx += ex; my += ey; mz += ez
          if (d2 < sepR2 && d2 > 1e-6) { sx -= ex / d2; sy -= ey / d2; sz -= ez / d2 }
        }
      }
      sumN += cnt
      kind[i] = cnt < 3 ? 0 : cnt < 12 ? 1 : 2
      let fx = 0, fy = 0, fz = 0
      const vx = vel[i * 3], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2]
      const steer = (x, y, z, w) => {
        const m = Math.hypot(x, y, z)
        if (m < 1e-6 || w === 0) return
        let tx = (x / m) * p.speed - vx, ty = (y / m) * p.speed - vy, tz = (z / m) * p.speed - vz
        const tm = Math.hypot(tx, ty, tz)
        if (tm > maxForce) { tx *= maxForce / tm; ty *= maxForce / tm; tz *= maxForce / tm }
        fx += tx * w; fy += ty * w; fz += tz * w
      }
      if (cnt) {
        steer(sx, sy, sz, p.separation)
        steer(ax, ay, az, p.alignment)
        steer(mx, my, mz, p.cohesion)
      }
      // Soft walls keep the flock inside the cube.
      const edge = B - 12
      const wall = (c) => (c > edge ? -(c - edge) : c < -edge ? -edge - c : 0) * 0.8 * p.speed / 10
      fx += wall(px); fy += wall(py); fz += wall(pz)
      acc[i * 3] = fx; acc[i * 3 + 1] = fy; acc[i * 3 + 2] = fz
    }
    let ox = 0, oy = 0, oz = 0
    const lo = p.speed * 0.45
    for (let i = 0; i < n; i++) {
      let vx = vel[i * 3] + acc[i * 3] * dt, vy = vel[i * 3 + 1] + acc[i * 3 + 1] * dt, vz = vel[i * 3 + 2] + acc[i * 3 + 2] * dt
      const m = Math.hypot(vx, vy, vz) || 1
      const c = m > p.speed ? p.speed / m : m < lo ? lo / m : 1
      vx *= c; vy *= c; vz *= c
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz
      for (let a = 0; a < 3; a++) {
        const q = pos[i * 3 + a] + vel[i * 3 + a] * dt
        pos[i * 3 + a] = q > B ? B : q < -B ? -B : q
      }
      const mm = Math.hypot(vx, vy, vz) || 1
      ox += vx / mm; oy += vy / mm; oz += vz / mm
    }
    s.order = n ? Math.hypot(ox, oy, oz) / n : 0
    s.neighbours = n ? sumN / n : 0
    s.time += dt
  },

  stats(s) {
    return { order: +s.order.toFixed(3), neighbours: +s.neighbours.toFixed(1) }
  },
}

function resize(s, target, speed) {
  const n = Math.max(0, Math.min(CAP, Math.round(target)))
  for (let i = s.n; i < n; i++) {
    const { rand } = s
    for (let a = 0; a < 3; a++) s.pos[i * 3 + a] = (rand() - 0.5) * B * 1.6
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1)
    s.vel[i * 3] = Math.sin(ph) * Math.cos(th) * speed
    s.vel[i * 3 + 1] = Math.cos(ph) * speed * 0.4
    s.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * speed
  }
  s.n = n
}
