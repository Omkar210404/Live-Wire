// Small helpers shared by the simulation templates. No browser APIs here,
// so the self-test can import every template in plain Node.

/** Seeded PRNG (mulberry32) so runs and tests are reproducible. */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const wrap = (v, size) => ((v % size) + size) % size

/**
 * Uniform-grid spatial hash for 2D neighbour queries.
 * build() is O(n); query() visits only the 3x3 cells around a point.
 */
export class Grid2D {
  constructor(cell = 10) {
    this.cell = cell
    this.map = new Map()
  }
  build(n, xs, ys, cell = this.cell) {
    this.cell = cell
    this.map.clear()
    for (let i = 0; i < n; i++) {
      const k = this.key(Math.floor(xs[i] / cell), Math.floor(ys[i] / cell))
      let b = this.map.get(k)
      if (!b) this.map.set(k, (b = []))
      b.push(i)
    }
  }
  key(cx, cy) {
    return cx * 73856093 ^ cy * 19349663
  }
  forNear(x, y, fn) {
    const c = this.cell
    const cx = Math.floor(x / c)
    const cy = Math.floor(y / c)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const b = this.map.get(this.key(cx + dx, cy + dy))
        if (b) for (let j = 0; j < b.length; j++) fn(b[j])
      }
  }
}

/** Fit a w x h world inside a cw x ch canvas, centred ("contain"). */
export function fit(w, h, cw, ch, pad = 0) {
  const s = Math.min((cw - pad * 2) / w, (ch - pad * 2) / h)
  return { s, ox: (cw - w * s) / 2, oy: (ch - h * s) / 2 }
}
