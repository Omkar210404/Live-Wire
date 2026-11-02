// Predator–prey: sheep grazing a meadow, wolves hunting them.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, S, model, hash, groundGeometry, treeModel } from './kit.jsx'

const PREY_CAP = 1600, PRED_CAP = 700

export default function EcosystemScene({ engine, theme, pal }) {
  const { w, h } = engine.state
  return (
    <Shell engine={engine} theme={theme} camera={[0, 36, 56]} fog={[90, 230]}>
      <Meadow W={w * S} H={h * S} theme={theme} />
      <Animals engine={engine} pal={pal} />
    </Shell>
  )
}

function Animals({ engine, pal }) {
  const sheep = useRef(), wolves = useRef()
  const geo = useMemo(() => ({
    sheep: model([
      [new THREE.IcosahedronGeometry(0.5, 0), '#f4f1ea', { p: [0, 0.65, 0], s: [0.95, 0.85, 1.25] }],
      [new THREE.BoxGeometry(0.3, 0.32, 0.38), '#2b2622', { p: [0, 0.82, 0.62] }],
      ...[[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.3], [0.22, 0.3]].map(([x, z]) =>
        [new THREE.CylinderGeometry(0.06, 0.06, 0.4, 4), '#2b2622', { p: [x, 0.2, z] }]),
    ]),
    wolf: model([
      [new THREE.BoxGeometry(0.5, 0.5, 1.3), '#ffffff', { p: [0, 0.75, 0] }],
      [new THREE.BoxGeometry(0.4, 0.38, 0.45), '#ffffff', { p: [0, 0.95, 0.8] }],
      [new THREE.BoxGeometry(0.22, 0.18, 0.3), '#d9d4cc', { p: [0, 0.86, 1.12] }],
      [new THREE.ConeGeometry(0.08, 0.2, 4), '#ffffff', { p: [-0.12, 1.22, 0.75] }],
      [new THREE.ConeGeometry(0.08, 0.2, 4), '#ffffff', { p: [0.12, 1.22, 0.75] }],
      [new THREE.ConeGeometry(0.1, 0.6, 4).rotateX(-Math.PI / 2.6), '#ffffff', { p: [0, 0.85, -0.85] }],
      ...[[-0.18, -0.45], [0.18, -0.45], [-0.18, 0.45], [0.18, 0.45]].map(([x, z]) =>
        [new THREE.CylinderGeometry(0.07, 0.06, 0.5, 4), '#3a3a3e', { p: [x, 0.25, z] }]),
    ]),
  }), [])
  const grey = useMemo(() => new THREE.Color('#8c7b6a'), [])
  const hot = useMemo(() => new THREE.Color(pal.accent), [pal])
  const white = useMemo(() => new THREE.Color('#ffffff'), [])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), [])

  useFrame(({ clock }) => {
    const s = engine.state
    const t = clock.elapsedTime
    const { o, c } = tmp
    const place = (mesh, list, hop, i0, color) => {
      list.forEach((a, i) => {
        const bob = engine.playing ? Math.abs(Math.sin(t * hop + (i0 + i) * 0.7)) * 0.12 : 0
        o.position.set((a.x - s.w / 2) * S, bob, (a.y - s.h / 2) * S)
        o.rotation.set(0, Math.atan2(Math.cos(a.a), Math.sin(a.a)), 0)
        o.scale.setScalar(1.4)
        o.updateMatrix()
        mesh.setMatrixAt(i, o.matrix)
        if (color) mesh.setColorAt(i, color(a, i))
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
    }
    place(sheep.current, s.prey.slice(0, PREY_CAP), 7, 0)
    // wolves flash warm right after a catch
    place(wolves.current, s.pred.slice(0, PRED_CAP), 12, 0, (a) => c.copy(grey).lerp(hot, a.flash || 0))
    wolves.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={sheep} args={[geo.sheep, undefined, PREY_CAP]} frustumCulled={false}>
        <meshStandardMaterial vertexColors roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={wolves} args={[geo.wolf, undefined, PRED_CAP]} frustumCulled={false} onUpdate={(m) => m.setColorAt(0, white)}>
        <meshStandardMaterial vertexColors roughness={0.8} flatShading />
      </instancedMesh>
    </group>
  )
}

function Meadow({ W, H, theme }) {
  const night = theme === 'dark'
  const ground = useMemo(() => groundGeometry(W + 160, H + 160, night ? ['#2c5038', '#30573c', '#284a33'] : ['#6fa35a', '#7bb064', '#689a52']), [W, H, night])
  const tufts = useMemo(() => {
    const parts = []
    for (let i = 0; i < 900; i++) {
      const x = (hash(i) - 0.5) * (W + 30), z = (hash(i + 4000) - 0.5) * (H + 30)
      const flower = hash(i + 9000) < 0.08
      parts.push(flower
        ? [new THREE.IcosahedronGeometry(0.12, 0), hash(i + 1) < 0.5 ? '#f2e27a' : '#f0f0f0', { p: [x, 0.15, z] }]
        : [new THREE.ConeGeometry(0.12, 0.45, 3), night ? '#2c5238' : '#4f8a3e', { p: [x, 0.2, z], r: [0, hash(i) * 3, 0] }])
    }
    return model(parts)
  }, [W, H, night])
  const trees = useMemo(() => {
    const list = []
    for (let i = 0; i < 70; i++) {
      const a = hash(i + 300) * Math.PI * 2
      const r = 1.05 + hash(i + 400) * 0.5
      list.push([Math.cos(a) * (W / 2) * r + (hash(i) - 0.5) * 8, Math.sin(a) * (H / 2) * r + (hash(i + 2) - 0.5) * 8, 2.5 + hash(i + 7) * 2.5])
    }
    return list
  }, [W, H])
  const treeGeo = useMemo(() => treeModel(), [])
  return (
    <group>
      <mesh geometry={ground}>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <mesh geometry={tufts}>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      <instancedMesh args={[treeGeo, undefined, trees.length]} onUpdate={(m) => {
        const o = new THREE.Object3D()
        trees.forEach(([x, z, sc], i) => { o.position.set(x, 0, z); o.scale.setScalar(sc); o.rotation.y = hash(i) * 6; o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, new THREE.Color(night ? '#25503a' : '#3f7d3c')) })
        m.instanceMatrix.needsUpdate = true
      }}>
        <meshStandardMaterial vertexColors roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}
