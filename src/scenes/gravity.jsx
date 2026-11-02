// Gravity: glowing stars with motion trails. Colour shows speed:
// slow = deep blue, fast = hot white-gold.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, glowTexture } from './kit.jsx'

const CAP = 800, TRAIL = 14

export default function GravityScene({ engine, theme }) {
  return (
    <Shell engine={engine} theme={theme} camera={[0, 48, 82]} space maxDistance={400}>
      <Nebula />
      <Galaxy engine={engine} />
    </Shell>
  )
}

const SLOW = new THREE.Color('#3d5bd9'), MID = new THREE.Color('#9ec9ff'), FAST = new THREE.Color('#ffd27a')

function Galaxy({ engine }) {
  const points = useRef(), lines = useRef()
  const data = useMemo(() => ({
    pos: new Float32Array(CAP * 3),
    col: new Float32Array(CAP * 3),
    hist: new Float32Array(CAP * TRAIL * 3),
    seg: new Float32Array(CAP * (TRAIL - 1) * 6),
    segCol: new Float32Array(CAP * (TRAIL - 1) * 6),
    head: 0, filled: 0, frame: 0, c: new THREE.Color(),
  }), [])
  const sprite = useMemo(() => glowTexture(), [])

  useFrame(() => {
    const s = engine.state, d = data
    const n = s.n
    // count changed or sim reset: restart trails so nothing streaks across the screen
    if (n !== d.lastN || engine.simTime < d.lastT) d.filled = 0
    d.lastN = n
    d.lastT = engine.simTime
    // star colours from speed
    for (let i = 0; i < n; i++) {
      const vx = s.vel[i * 3], vy = s.vel[i * 3 + 1], vz = s.vel[i * 3 + 2]
      const q = Math.min(1, Math.hypot(vx, vy, vz) / 22)
      if (q < 0.5) d.c.copy(SLOW).lerp(MID, q * 2)
      else d.c.copy(MID).lerp(FAST, (q - 0.5) * 2)
      d.col[i * 3] = d.c.r; d.col[i * 3 + 1] = d.c.g; d.col[i * 3 + 2] = d.c.b
    }
    d.pos.set(s.pos.subarray(0, n * 3))
    // trail history: one sample every other frame while running
    if (engine.playing && d.frame++ % 2 === 0) {
      d.head = (d.head + 1) % TRAIL
      d.hist.set(s.pos.subarray(0, CAP * 3), d.head * CAP * 3)
      d.filled = Math.min(TRAIL, d.filled + 1)
    }
    let k = 0
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < d.filled - 1; a++) {
        const i0 = ((d.head - a + TRAIL) % TRAIL) * CAP * 3 + i * 3
        const i1 = ((d.head - a - 1 + TRAIL) % TRAIL) * CAP * 3 + i * 3
        const fade0 = 0.5 * (1 - a / TRAIL), fade1 = 0.5 * (1 - (a + 1) / TRAIL)
        for (let j = 0; j < 3; j++) {
          d.seg[k * 6 + j] = d.hist[i0 + j]
          d.seg[k * 6 + 3 + j] = d.hist[i1 + j]
          d.segCol[k * 6 + j] = d.col[i * 3 + j] * fade0
          d.segCol[k * 6 + 3 + j] = d.col[i * 3 + j] * fade1
        }
        k++
      }
    }
    const pg = points.current.geometry
    pg.attributes.position.needsUpdate = true
    pg.attributes.color.needsUpdate = true
    pg.setDrawRange(0, n)
    const lg = lines.current.geometry
    lg.attributes.position.needsUpdate = true
    lg.attributes.color.needsUpdate = true
    lg.setDrawRange(0, k * 2)
  })

  return (
    <group>
      <lineSegments ref={lines} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.seg, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.segCol, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </lineSegments>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.col, 3]} />
        </bufferGeometry>
        <pointsMaterial map={sprite} size={2.4} sizeAttenuation vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </group>
  )
}

/** A few huge, faint coloured glows behind the galaxy. */
function Nebula() {
  const tex = useMemo(() => glowTexture(), [])
  const clouds = [
    [-120, 20, -220, 260, '#3b2a7a'], [140, -30, -260, 300, '#173f6b'], [20, 60, -320, 220, '#5a2a4f'],
  ]
  return clouds.map(([x, y, z, sc, c]) => (
    <sprite key={c} position={[x, y, z]} scale={[sc, sc, 1]}>
      <spriteMaterial map={tex} color={c} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  ))
}
