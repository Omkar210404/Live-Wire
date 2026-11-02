// Forest fire: a grid of low-poly trees. Burning trees get flames and smoke
// that drifts with the wind; burnt ones become charred stumps.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, model, hash, treeModel, glowTexture, groundGeometry } from './kit.jsx'

const SIZE = 90, FLAME_CAP = 6000, SMOKE = 900
const EMPTY = 0, TREE = 1, FIRE = 2, ASH = 3

export default function ForestScene({ engine, theme }) {
  const N = engine.state.N
  return (
    <Shell engine={engine} theme={theme} camera={[0, 50, 78]} fog={[110, 300]} autoRotate={false}>
      <Ground theme={theme} />
      <Forest key={N} engine={engine} N={N} theme={theme} />
      <WindArrow engine={engine} />
    </Shell>
  )
}

function Forest({ engine, N, theme }) {
  const trees = useRef(), flames = useRef(), smoke = useRef(), glow = useRef()
  const c = SIZE / N
  const geo = useMemo(() => ({
    tree: treeModel(),
    flame: model([
      [new THREE.ConeGeometry(0.42, 1.3, 5), '#ffffff', { p: [0, 0.65, 0] }],
      [new THREE.ConeGeometry(0.25, 0.9, 5), '#ffffff', { p: [0.15, 0.5, 0.1], r: [0.2, 0, 0.3] }],
    ]),
  }), [])
  const data = useMemo(() => {
    const pos = new Float32Array(N * N * 2)
    for (let i = 0; i < N * N; i++) {
      pos[i * 2] = ((i % N) - N / 2 + 0.5 + (hash(i) - 0.5) * 0.5) * c
      pos[i * 2 + 1] = (Math.floor(i / N) - N / 2 + 0.5 + (hash(i + 7) - 0.5) * 0.5) * c
    }
    return {
      pos, prev: new Uint8Array(N * N).fill(255),
      smoke: new Float32Array(SMOKE * 3).fill(-999), life: new Float32Array(SMOKE), next: 0,
      o: new THREE.Object3D(), col: new THREE.Color(),
      greens: ['#3d8a4a', '#4a9a50', '#357c45', '#56994a'].map((x) => new THREE.Color(x)),
      fire: new THREE.Color('#ff7a1a'), ash: new THREE.Color('#2b2622'),
      flameCols: ['#fff1a8', '#ffb347', '#ff5a1f'].map((x) => new THREE.Color(x)),
    }
  }, [N, c])
  const smokeTex = useMemo(() => glowTexture('rgba(255,255,255,1)'), [])
  const night = theme === 'dark'

  useFrame(({ clock }, delta) => {
    const s = engine.state, p = engine.params, d = data
    if (s.N !== N) return
    const { o, col } = d
    const t = clock.elapsedTime
    // 1) trees: only touch cells whose state changed
    let changed = false
    for (let i = 0; i < N * N; i++) {
      const st = s.cells[i]
      if (st === d.prev[i]) continue
      d.prev[i] = st
      changed = true
      const sc = c * (1 + hash(i + 3) * 0.35)
      o.position.set(d.pos[i * 2], 0, d.pos[i * 2 + 1])
      o.rotation.set(0, hash(i) * 6, 0)
      if (st === EMPTY) o.scale.setScalar(0)
      else if (st === ASH) o.scale.set(sc, sc * 0.4, sc)
      else o.scale.set(sc, sc * 1.5, sc)
      o.updateMatrix()
      trees.current.setMatrixAt(i, o.matrix)
      trees.current.setColorAt(i, st === FIRE ? d.fire : st === ASH ? d.ash : d.greens[Math.floor(hash(i + 1) * 4)])
    }
    if (changed) {
      trees.current.instanceMatrix.needsUpdate = true
      trees.current.instanceColor.needsUpdate = true
    }
    // 2) flames on burning cells, flickering
    let k = 0, sx = 0, sz = 0
    for (let i = 0; i < N * N && k < FLAME_CAP; i++) {
      if (s.cells[i] !== FIRE) continue
      const x = d.pos[i * 2], z = d.pos[i * 2 + 1]
      sx += x; sz += z
      const f = 0.75 + Math.sin(t * 18 + i) * 0.2 + hash(i + Math.floor(t * 10)) * 0.2
      o.position.set(x, c * 0.6, z)
      o.rotation.set(0, t * 2 + i, 0)
      o.scale.set(c * 1.2 * f, c * 2.2 * f, c * 1.2 * f)
      o.updateMatrix()
      flames.current.setMatrixAt(k, o.matrix)
      flames.current.setColorAt(k, d.flameCols[Math.min(2, s.age[i])])
      k++
    }
    flames.current.count = k
    flames.current.instanceMatrix.needsUpdate = true
    if (flames.current.instanceColor) flames.current.instanceColor.needsUpdate = true
    // fire light follows the blaze
    glow.current.intensity = Math.min(1, k / 300) * (night ? 900 : 300)
    if (k) glow.current.position.set(sx / k, 8, sz / k)
    // 3) smoke rises and drifts downwind
    const dt = engine.playing ? Math.min(delta, 0.05) * engine.speed : 0
    const wr = (p.windDir * Math.PI) / 180
    const wx = Math.sin(wr) * p.windStrength * 5, wz = -Math.cos(wr) * p.windStrength * 5
    const spawn = engine.playing ? Math.min(25, Math.ceil(k / 20)) : 0
    for (let j = 0; j < spawn; j++) {
      const i = Math.floor(Math.random() * N * N)
      if (s.cells[i] !== FIRE) continue
      const q = d.next = (d.next + 1) % SMOKE
      d.smoke[q * 3] = d.pos[i * 2]; d.smoke[q * 3 + 1] = c * 2; d.smoke[q * 3 + 2] = d.pos[i * 2 + 1]
      d.life[q] = 4 + Math.random() * 2
    }
    for (let q = 0; q < SMOKE; q++) {
      if (d.life[q] <= 0) continue
      d.life[q] -= dt
      if (d.life[q] <= 0) { d.smoke[q * 3 + 1] = -999; continue }
      d.smoke[q * 3] += wx * dt
      d.smoke[q * 3 + 1] += 3 * dt
      d.smoke[q * 3 + 2] += wz * dt
    }
    smoke.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={trees} args={[geo.tree, undefined, N * N]} frustumCulled={false} onUpdate={(m) => m.setColorAt(0, data.greens[0])}>
        <meshStandardMaterial vertexColors flatShading roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={flames} args={[geo.flame, undefined, FLAME_CAP]} frustumCulled={false} onUpdate={(m) => m.setColorAt(0, data.flameCols[0])}>
        <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.92} />
      </instancedMesh>
      <points ref={smoke} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.smoke, 3]} />
        </bufferGeometry>
        <pointsMaterial map={smokeTex} size={5} sizeAttenuation color={night ? '#6b6f78' : '#7d7a76'} transparent opacity={0.28} depthWrite={false} />
      </points>
      <pointLight ref={glow} color="#ff8a3a" distance={70} decay={1.6} intensity={0} />
    </group>
  )
}

function Ground({ theme }) {
  const night = theme === 'dark'
  const g = useMemo(() => groundGeometry(SIZE + 200, SIZE + 200, night ? ['#2a3a26', '#2d3f29', '#263522'] : ['#7d8f5a', '#86985f', '#748654'], 50), [night])
  return (
    <mesh geometry={g} position-y={-0.02}>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  )
}

/** Floating arrow in a corner that points where the wind blows. */
function WindArrow({ engine }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    const p = engine.params
    const wr = (p.windDir * Math.PI) / 180
    ref.current.rotation.y = Math.atan2(Math.sin(wr), -Math.cos(wr))
    ref.current.position.y = 9 + Math.sin(clock.elapsedTime * 2) * 0.4
    ref.current.scale.setScalar(0.6 + p.windStrength)
  })
  return (
    <group ref={ref} position={[SIZE / 2 + 6, 9, -SIZE / 2 - 6]}>
      <mesh rotation-x={Math.PI / 2} position-z={-1}>
        <cylinderGeometry args={[0.25, 0.25, 4, 8]} />
        <meshBasicMaterial color="#e8ecf4" toneMapped={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-z={1.6}>
        <coneGeometry args={[0.7, 1.4, 8]} />
        <meshBasicMaterial color="#ffb35c" toneMapped={false} />
      </mesh>
    </group>
  )
}
