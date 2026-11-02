import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'

export default function View3D({ engine, template, pal, theme }) {
  const { bounds } = template.render3d
  return (
    <Canvas
      className="sim-canvas"
      dpr={[1, 2]}
      camera={{ position: [bounds * 1.5, bounds * 0.9, bounds * 1.5], fov: 50, near: 0.5, far: 2000 }}
      gl={{ antialias: true, alpha: true }}
    >
      <fog attach="fog" args={[pal.bg, bounds * 1.6, bounds * 5]} />
      <ambientLight intensity={theme === 'dark' ? 0.5 : 0.9} />
      <directionalLight position={[50, 80, 40]} intensity={1.4} />
      <pointLight position={[-60, -20, -40]} intensity={600} color={pal.accent} distance={250} />
      {template.id === 'gravity' && theme === 'dark' && <Stars radius={300} depth={80} count={2500} factor={5} fade speed={0.6} />}
      {template.id === 'boids' && <BoundsBox size={bounds * 2} color={pal.muted} />}
      <Swarm engine={engine} template={template} pal={pal} />
      <OrbitControls autoRotate autoRotateSpeed={0.35} enableDamping makeDefault maxDistance={bounds * 6} minDistance={bounds * 0.4} />
    </Canvas>
  )
}

function BoundsBox({ size, color }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)), [size])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={0.18} />
    </lineSegments>
  )
}

const UP = new THREE.Vector3(0, 1, 0)

/** One InstancedMesh for every agent; matrices updated in place each frame. */
function Swarm({ engine, template, pal }) {
  const mesh = useRef()
  const { shape, size, palette } = template.render3d
  const cap = Object.values(template.params).find((p) => p.heavy)?.max || 2000
  const geometry = useMemo(
    () => (shape === 'cone' ? new THREE.ConeGeometry(size * 0.35, size * 1.6, 5).rotateX(0) : new THREE.IcosahedronGeometry(size, 1)),
    [shape, size],
  )
  const colors = useMemo(() => palette.map((c) => new THREE.Color(pal[c])), [palette, pal])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), v: new THREE.Vector3() }), [])

  useFrame((_, delta) => {
    if (document.hidden) return
    engine.tick(delta)
    const m = mesh.current
    const { n, pos, vel, kind } = engine.state
    const { o, v } = tmp
    for (let i = 0; i < n; i++) {
      o.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      if (shape === 'cone') {
        v.set(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]).normalize()
        o.quaternion.setFromUnitVectors(UP, v)
      }
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, colors[kind[i]] || colors[0])
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, cap]} frustumCulled={false}>
      {shape === 'cone'
        ? <meshStandardMaterial roughness={0.45} metalness={0.1} />
        : <meshBasicMaterial toneMapped={false} />}
    </instancedMesh>
  )
}
