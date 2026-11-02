// Intersection: a city crossroads with working traffic lights, zebra
// crossings and corner buildings. Cars queue at red with brake lights on.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, model, hash, carGeometries, CAR_COLORS } from './kit.jsx'
import { lightFor, posOf, GEOM } from '../sims/intersection.js'

const K = 0.35 // scene units per metre
const { L, BOX, LANE, DIRS } = GEOM
const CAP = 160
const LIGHT = { red: new THREE.Color('#ff3b30'), yellow: new THREE.Color('#ffcc33'), green: new THREE.Color('#34e07a'), off: new THREE.Color('#1a1d24') }

export default function IntersectionScene({ engine, theme }) {
  return (
    <Shell engine={engine} theme={theme} camera={[13, 11, 17]} fog={[60, 180]} maxDistance={120} autoRotate={false}>
      <Streets theme={theme} />
      <Signals engine={engine} />
      <Cars engine={engine} theme={theme} />
    </Shell>
  )
}

function Cars({ engine, theme }) {
  const cars = useRef(), brakes = useRef(), heads = useRef(), warn = useRef()
  const geo = useMemo(() => carGeometries(), [])
  const palette = useMemo(() => CAR_COLORS.map((c) => new THREE.Color(c)), [])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), hidden: new THREE.Matrix4().makeScale(0, 0, 0) }), [])

  useFrame(({ clock }) => {
    const s = engine.state
    const { o, hidden } = tmp
    let n = 0, w = 0
    for (let d = 0; d < 4; d++) {
      for (const c of s.lanes[d]) {
        if (n >= CAP) break
        const [x, y] = posOf(d, c.s)
        o.position.set(x * K, 0, y * K)
        o.rotation.set(0, Math.atan2(DIRS[d][0], DIRS[d][1]), 0)
        o.scale.setScalar(K)
        o.updateMatrix()
        cars.current.setMatrixAt(n, o.matrix)
        cars.current.setColorAt(n, palette[c.id % palette.length])
        heads.current.setMatrixAt(n, o.matrix)
        brakes.current.setMatrixAt(n, c.v < 2 || c.broken > 0 ? o.matrix : hidden)
        if (c.broken > 0 && w < 8) {
          o.position.y = 2.2 + Math.sin(clock.elapsedTime * 8) * 0.25
          o.scale.setScalar(1)
          o.updateMatrix()
          warn.current.setMatrixAt(w++, o.matrix)
        }
        n++
      }
    }
    for (const m of [cars.current, brakes.current, heads.current]) { m.count = n; m.instanceMatrix.needsUpdate = true }
    cars.current.instanceColor.needsUpdate = true
    warn.current.count = w
    warn.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={cars} args={[geo.car, undefined, CAP]} frustumCulled={false} onUpdate={(m) => m.setColorAt(0, palette[0])}>
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={brakes} args={[geo.brake, undefined, CAP]} frustumCulled={false}>
        <meshBasicMaterial color="#ff2a2a" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[geo.head, undefined, CAP]} frustumCulled={false} visible={theme === 'dark'}>
        <meshBasicMaterial color="#fff6d8" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={warn} args={[new THREE.OctahedronGeometry(0.45, 0), undefined, 8]} frustumCulled={false}>
        <meshBasicMaterial color="#ffb35c" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/** One traffic-light pole per approach; the lit lamp follows the signal phase. */
function Signals({ engine }) {
  const lamps = useRef()
  const poles = useMemo(() => [0, 1, 2, 3].map((d) => {
    const [dx, dy] = DIRS[d]
    // right side of the road, just before the stop line
    const [x, y] = posOf(d, -BOX - 1.5)
    return { d, x: (x - dy * (LANE + 1.2)) * K, z: (y + dx * (LANE + 1.2)) * K, rot: Math.atan2(-dx, -dy) }
  }), [])
  const poleGeo = useMemo(() => model([
    [new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), '#3a3f4b', { p: [0, 1.3, 0] }],
    [new THREE.BoxGeometry(0.42, 1.15, 0.3), '#22252d', { p: [0, 2.85, 0] }],
  ]), [])
  const lampGeo = useMemo(() => new THREE.SphereGeometry(0.13, 10, 8), [])
  const o = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const phase = engine.state.phase
    poles.forEach((p, i) => {
      const lit = lightFor(phase, p.d)
      ;['red', 'yellow', 'green'].forEach((c, j) => {
        o.position.set(p.x, 3.2 - j * 0.35, p.z)
        o.rotation.set(0, p.rot, 0)
        o.translateZ(0.16)
        o.updateMatrix()
        lamps.current.setMatrixAt(i * 3 + j, o.matrix)
        lamps.current.setColorAt(i * 3 + j, lit === c ? LIGHT[c] : LIGHT.off)
      })
    })
    lamps.current.instanceMatrix.needsUpdate = true
    lamps.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      {poles.map((p) => (
        <mesh key={p.d} geometry={poleGeo} position={[p.x, 0, p.z]} rotation-y={p.rot}>
          <meshStandardMaterial vertexColors roughness={0.6} />
        </mesh>
      ))}
      <instancedMesh ref={lamps} args={[lampGeo, undefined, 12]} onUpdate={(m) => m.setColorAt(0, LIGHT.off)}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function Streets({ theme }) {
  const night = theme === 'dark'
  const R = L * K, W = LANE * 2 * K, B = BOX * K
  const blocks = useMemo(() => {
    const out = []
    let id = 0
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let i = 0; i < 6; i++, id++) {
        const bw = 3 + hash(id) * 3, bd = 3 + hash(id + 9) * 3, bh = 2.5 + hash(id + 3) * 6
        const along = W + 4 + (i % 3) * 7 + hash(id + 5) * 1.5
        const away = W + 4 + Math.floor(i / 3) * 8 + hash(id + 6) * 1.5
        out.push([sx * along + sx * bw / 2, sz * away + sz * bd / 2, bw, bh, bd, hash(id + 1)])
      }
    }
    return out
  }, [W])
  const stripes = useMemo(() => {
    const out = []
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d]
      for (let k = -3; k <= 3; k++) {
        const off = k * 0.42
        const at = (BOX - 2.5) * K
        out.push(dx !== 0 ? [Math.sign(dx) * -at, off, 0] : [off, Math.sign(dy) * -at, 1])
      }
    }
    return out
  }, [])
  const fill = (items, fn) => (m) => {
    const o = new THREE.Object3D()
    items.forEach((it, i) => { o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); fn(o, it, i, m); o.updateMatrix(); m.setMatrixAt(i, o.matrix) })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }
  const road = night ? '#262a33' : '#4b5059'
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
        <planeGeometry args={[R * 4, R * 4]} />
        <meshStandardMaterial color={night ? '#1a2030' : '#b9bfc8'} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[R * 2, W * 1.4]} />
        <meshStandardMaterial color={road} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <planeGeometry args={[W * 1.4, R * 2]} />
        <meshStandardMaterial color={road} roughness={0.9} />
      </mesh>
      {/* centre lines, stopping short of the junction */}
      {[[(R + B) / 2, 0, R - B, 0.12], [-(R + B) / 2, 0, R - B, 0.12], [0, (R + B) / 2, 0.12, R - B], [0, -(R + B) / 2, 0.12, R - B]].map(([x, z, w, h], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.02, z]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color="#e8c547" />
        </mesh>
      ))}
      <instancedMesh args={[new THREE.PlaneGeometry(1.1, 0.24).rotateX(-Math.PI / 2), undefined, stripes.length]} onUpdate={fill(stripes, (o, [x, z, vert]) => {
        o.position.set(x, 0.02, z)
        if (vert) o.rotation.y = Math.PI / 2
      })}>
        <meshBasicMaterial color={night ? '#9aa0aa' : '#f2f2f2'} />
      </instancedMesh>
      <instancedMesh args={[new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), undefined, blocks.length]} onUpdate={fill(blocks, (o, [x, z, bw, bh, bd, tone], i, m) => {
        o.position.set(x, 0, z); o.scale.set(bw, bh, bd)
        m.setColorAt(i, new THREE.Color(night ? '#2a3448' : '#e6dfd4').lerp(new THREE.Color(night ? '#1b2232' : '#c5baad'), tone))
      })}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <Windows blocks={blocks} night={night} />
    </group>
  )
}

/** Lit windows on the street-facing walls of the corner buildings. */
function Windows({ blocks, night }) {
  const list = useMemo(() => {
    const out = []
    blocks.forEach(([x, z, bw, bh, bd], b) => {
      const fx = -Math.sign(x), fz = -Math.sign(z) // walls facing the crossroads
      for (let y = 1.4; y < bh - 0.8; y += 1.6) {
        for (let u = -bw / 2 + 0.9; u < bw / 2 - 0.5; u += 1.3) if (hash(b * 97 + u * 7 + y * 3) < (night ? 0.55 : 0.85)) out.push([x + u, y, z + fz * (bd / 2 + 0.02), 0])
        for (let u = -bd / 2 + 0.9; u < bd / 2 - 0.5; u += 1.3) if (hash(b * 61 + u * 5 + y * 11) < (night ? 0.55 : 0.85)) out.push([x + fx * (bw / 2 + 0.02), y, z + u, Math.PI / 2])
      }
    })
    return out
  }, [blocks, night])
  return (
    <instancedMesh key={list.length} args={[new THREE.PlaneGeometry(0.6, 0.8), undefined, list.length]} onUpdate={(m) => {
      const o = new THREE.Object3D()
      list.forEach(([x, y, z, r], i) => { o.position.set(x, y, z); o.rotation.set(0, r, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix) })
      m.instanceMatrix.needsUpdate = true
    }}>
      <meshBasicMaterial color={night ? '#ffc977' : '#8fb3d6'} toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}
