// Traffic: low-poly cars on a ring highway. Brake lights glow red when a car
// slows hard or sits in a jam; the car hit by "Trigger a slowdown" gets a beacon.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, model, hash, groundGeometry, treeModel, carGeometries, CAR_COLORS } from './kit.jsx'

const K = 0.3 // scene units per metre

export default function TrafficScene({ engine, theme }) {
  const R = (engine.state.L * K) / (Math.PI * 2)
  return (
    <Shell engine={engine} theme={theme} camera={[0, R * 0.32 + 10, R + 30]} target={[0, 0, R * 0.45]} fog={[R * 1.6, R * 5 + 200]} maxDistance={R * 4 + 80}>
      <Road R={R} theme={theme} />
      <Cars engine={engine} R={R} theme={theme} />
    </Shell>
  )
}

function Cars({ engine, R, theme }) {
  const cars = useRef(), brakes = useRef(), heads = useRef(), beacon = useRef()
  const n0 = engine.state.n
  const geo = useMemo(() => carGeometries(), [])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), prev: new Float64Array(n0), hidden: new THREE.Matrix4().makeScale(0, 0, 0) }), [n0])

  useFrame(({ clock }, delta) => {
    const s = engine.state
    const { o, prev, hidden } = tmp
    const dt = Math.max(delta, 1e-3) * engine.speed * 3
    for (let i = 0; i < s.n; i++) {
      const th = (s.x[i] / s.L) * Math.PI * 2
      o.position.set(Math.cos(th) * R, 0, Math.sin(th) * R)
      o.rotation.set(0, Math.atan2(-Math.sin(th), Math.cos(th)), 0)
      o.scale.setScalar(K * 1.7) // drawn larger than life so cars read at this zoom
      o.updateMatrix()
      cars.current.setMatrixAt(i, o.matrix)
      heads.current.setMatrixAt(i, o.matrix)
      const decel = (prev[i] - s.v[i]) / dt
      const braking = engine.playing ? decel > 0.8 || s.v[i] < 3 : s.v[i] < 3
      brakes.current.setMatrixAt(i, braking ? o.matrix : hidden)
      prev[i] = s.v[i]
      if (s.brakeTimer > 0 && i === s.brakeCar) {
        beacon.current.visible = true
        beacon.current.position.set(o.position.x, 3 + Math.sin(clock.elapsedTime * 8) * 0.4, o.position.z)
      }
    }
    if (!(s.brakeTimer > 0)) beacon.current.visible = false
    for (const m of [cars.current, brakes.current, heads.current]) {
      m.count = s.n
      m.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={cars} args={[geo.car, undefined, n0]} frustumCulled={false} onUpdate={(m) => {
        for (let i = 0; i < n0; i++) m.setColorAt(i, new THREE.Color(CAR_COLORS[Math.floor(hash(i + 11) * CAR_COLORS.length)]))
        m.instanceColor.needsUpdate = true
      }}>
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={brakes} args={[geo.brake, undefined, n0]} frustumCulled={false}>
        <meshBasicMaterial color="#ff2a2a" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[geo.head, undefined, n0]} frustumCulled={false} visible={theme === 'dark'}>
        <meshBasicMaterial color="#fff6d8" toneMapped={false} />
      </instancedMesh>
      <mesh ref={beacon} visible={false}>
        <octahedronGeometry args={[0.7, 0]} />
        <meshBasicMaterial color="#ffb35c" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Road({ R, theme }) {
  const night = theme === 'dark'
  const half = 4.2
  const ground = useMemo(() => groundGeometry(R * 8 + 200, R * 8 + 200, night ? ['#23392b', '#264030', '#203627'] : ['#79a660', '#83b06a', '#719c58'], 40), [R, night])
  const deco = useMemo(() => {
    const trees = [], lamps = [], houses = []
    for (let i = 0; i < 140; i++) {
      const a = hash(i) * Math.PI * 2
      const inner = i % 3 === 0
      const d = inner ? R * (0.15 + hash(i + 50) * 0.6) : R + 8 + hash(i + 50) * R * 1.2
      trees.push([Math.cos(a) * d, Math.sin(a) * d, 2 + hash(i + 3) * 2.5])
    }
    const nl = Math.max(12, Math.round((R * Math.PI * 2) / 14))
    for (let i = 0; i < nl; i++) { const a = (i / nl) * Math.PI * 2; lamps.push([Math.cos(a) * (R + half + 1.2), Math.sin(a) * (R + half + 1.2), a]) }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + hash(i) * 0.2, d = R + 14 + hash(i + 20) * 10
      houses.push([Math.cos(a) * d, Math.sin(a) * d, a, 4 + hash(i + 30) * 4, 3 + hash(i + 40) * 5])
    }
    return { trees, lamps, houses }
  }, [R])
  const geo = useMemo(() => ({
    tree: treeModel(),
    pole: model([
      [new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), '#4a5263', { p: [0, 2.25, 0] }],
      [new THREE.BoxGeometry(1.4, 0.1, 0.12), '#4a5263', { p: [-0.6, 4.45, 0] }],
    ]),
    bulb: new THREE.SphereGeometry(0.22, 8, 6),
    house: model([
      [new THREE.BoxGeometry(1, 1, 1), '#ffffff', { p: [0, 0.5, 0] }],
      [new THREE.ConeGeometry(0.8, 0.6, 4), '#9c4f3d', { p: [0, 1.3, 0], r: [0, Math.PI / 4, 0] }],
    ]),
  }), [])
  const fill = (items, fn) => (m) => {
    const o = new THREE.Object3D()
    items.forEach((it, i) => { o.rotation.set(0, 0, 0); o.scale.setScalar(1); fn(o, it, i, m); o.updateMatrix(); m.setMatrixAt(i, o.matrix) })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }
  return (
    <group>
      <mesh geometry={ground} position-y={-0.05}>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[R - half, R + half, 160]} />
        <meshStandardMaterial color={night ? '#22262e' : '#4a4f58'} roughness={0.9} />
      </mesh>
      {[-half + 0.3, half - 0.3].map((off) => (
        <mesh key={off} rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[R + off - 0.1, R + off + 0.1, 160]} />
          <meshBasicMaterial color={night ? '#8a8f99' : '#e8e8e8'} />
        </mesh>
      ))}
      <instancedMesh args={[geo.tree, undefined, deco.trees.length]} onUpdate={fill(deco.trees, (o, [x, z, sc], i, m) => {
        o.position.set(x, 0, z); o.scale.setScalar(sc); o.rotation.y = hash(i) * 6
        m.setColorAt(i, new THREE.Color(night ? '#244d36' : '#3d7a3a'))
      })}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh args={[geo.house, undefined, deco.houses.length]} onUpdate={fill(deco.houses, (o, [x, z, a, wd, ht], i, m) => {
        o.position.set(x, 0, z); o.rotation.y = -a; o.scale.set(wd, ht, wd)
        m.setColorAt(i, new THREE.Color(night ? '#3a4458' : '#e9e2d6'))
      })}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh args={[geo.pole, undefined, deco.lamps.length]} onUpdate={fill(deco.lamps, (o, [x, z, a]) => { o.position.set(x, 0, z); o.rotation.y = -a })}>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </instancedMesh>
      <instancedMesh args={[geo.bulb, undefined, deco.lamps.length]} visible={night} onUpdate={fill(deco.lamps, (o, [x, z, a]) => {
        o.position.set(x - Math.cos(a) * 1.2, 4.35, z - Math.sin(a) * 1.2)
      })}>
        <meshBasicMaterial color="#ffd89a" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
