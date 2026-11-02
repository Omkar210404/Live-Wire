// Flocking: low-poly birds with flapping wings over distant hills.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, model, hash } from './kit.jsx'

const CAP = 1500

export default function BoidsScene({ engine, theme, pal }) {
  return (
    <Shell engine={engine} theme={theme} camera={[78, 18, 78]} fog={[120, 420]} maxDistance={260}>
      <Hills theme={theme} />
      <Birds engine={engine} theme={theme} pal={pal} />
    </Shell>
  )
}

function Birds({ engine, theme, pal }) {
  const body = useRef(), left = useRef(), right = useRef()
  const geo = useMemo(() => {
    const wing = (dir) => {
      const g = new THREE.BufferGeometry()
      // root at the body, tip out to the side; forward is +Z
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, dir * 1.5, 0.05, -0.1, 0, 0, -0.35], 3))
      g.computeVertexNormals()
      return g
    }
    return {
      body: model([
        [new THREE.ConeGeometry(0.22, 1.3, 6).rotateX(Math.PI / 2), '#ffffff'],
        [new THREE.ConeGeometry(0.2, 0.5, 4).rotateX(-Math.PI / 2), '#ffffff', { p: [0, 0, -0.75], s: [1.4, 0.3, 1] }],
      ]),
      left: wing(1),
      right: wing(-1),
    }
  }, [])
  const night = theme === 'dark'
  const tints = useMemo(() => {
    const base = night ? '#a9bddb' : '#2c323d'
    return [base, base, pal.accent].map((c) => new THREE.Color(c))
  }, [night, pal])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), t: new THREE.Vector3(), r: new THREE.Matrix4(), m: new THREE.Matrix4() }), [])

  useFrame(({ clock }) => {
    const { n, pos, vel, kind } = engine.state
    const time = clock.elapsedTime
    const { o, t, r, m } = tmp
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
      o.position.set(x, y, z)
      t.set(x + vel[i * 3], y + vel[i * 3 + 1], z + vel[i * 3 + 2])
      o.lookAt(t) // +Z of the model points along the velocity
      o.updateMatrix()
      body.current.setMatrixAt(i, o.matrix)
      body.current.setColorAt(i, tints[kind[i]])
      const flap = Math.sin(time * 11 + hash(i) * 20) * 0.7 * (engine.playing ? 1 : 0.15)
      left.current.setMatrixAt(i, m.copy(o.matrix).multiply(r.makeRotationZ(flap)))
      right.current.setMatrixAt(i, m.copy(o.matrix).multiply(r.makeRotationZ(-flap)))
    }
    for (const mesh of [body.current, left.current, right.current]) {
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }
    body.current.instanceColor.needsUpdate = true
  })

  const wingColor = night ? '#8ea3c4' : '#3a414e'
  return (
    <group>
      <instancedMesh ref={body} args={[geo.body, undefined, CAP]} frustumCulled={false} onUpdate={(mm) => mm.setColorAt(0, tints[0])}>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={left} args={[geo.left, undefined, CAP]} frustumCulled={false}>
        <meshStandardMaterial color={wingColor} side={THREE.DoubleSide} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={right} args={[geo.right, undefined, CAP]} frustumCulled={false}>
        <meshStandardMaterial color={wingColor} side={THREE.DoubleSide} roughness={0.6} />
      </instancedMesh>
    </group>
  )
}

/** A ring of low-poly hills and a lake far below the flock. */
function Hills({ theme }) {
  const night = theme === 'dark'
  const hills = useMemo(() => {
    const parts = []
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash(i) * 0.2
      const d = 190 + hash(i + 9) * 90, hgt = 30 + hash(i + 3) * 55
      parts.push([new THREE.ConeGeometry(28 + hash(i + 5) * 30, hgt, 5), '#ffffff', { p: [Math.cos(a) * d, -70 + hgt / 2, Math.sin(a) * d], r: [0, hash(i) * 3, 0] }])
    }
    return model(parts)
  }, [])
  return (
    <group>
      <mesh geometry={hills}>
        <meshStandardMaterial vertexColors color={night ? '#1d2b45' : '#7d9a8a'} flatShading roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-70}>
        <circleGeometry args={[600, 48]} />
        <meshStandardMaterial color={night ? '#0d1730' : '#6f9fbf'} roughness={0.35} metalness={0.2} />
      </mesh>
    </group>
  )
}
