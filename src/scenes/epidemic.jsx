// Epidemic: people walking around a city plaza. Blue = healthy, glowing
// amber = infected (with their contact radius on the ground), teal = recovered.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Shell, S, model, hash, glowTexture } from './kit.jsx'

const CAP = 3000

export default function EpidemicScene({ engine, theme, pal }) {
  const { w, h } = engine.state
  const W = w * S, H = h * S
  return (
    <Shell engine={engine} theme={theme} camera={[0, 36, 56]} fog={[90, 240]}>
      <Plaza W={W} H={H} theme={theme} />
      <People engine={engine} pal={pal} theme={theme} />
    </Shell>
  )
}

function People({ engine, pal, theme }) {
  const bodies = useRef(), heads = useRef(), halos = useRef()
  const geo = useMemo(() => ({
    body: model([
      [new THREE.CylinderGeometry(0.2, 0.3, 0.85, 7), '#ffffff', { p: [0, 0.62, 0] }],
      [new THREE.CylinderGeometry(0.09, 0.09, 0.4, 5), '#2a3040', { p: [-0.12, 0.2, 0] }],
      [new THREE.CylinderGeometry(0.09, 0.09, 0.4, 5), '#2a3040', { p: [0.12, 0.2, 0] }],
    ]),
    head: new THREE.SphereGeometry(0.2, 10, 8),
    halo: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
  }), [])
  const halo = useMemo(() => glowTexture('rgba(255,180,90,1)'), [])
  const colors = useMemo(() => [pal.cool1, pal.accent, pal.cool2].map((c) => new THREE.Color(c)), [pal])
  const o = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    const s = engine.state, p = engine.params
    const t = clock.elapsedTime
    const moving = p.speed > 0 && engine.playing
    let k = 0
    for (let i = 0; i < s.n; i++) {
      const x = (s.x[i] - s.w / 2) * S, z = (s.y[i] - s.h / 2) * S
      const bob = moving ? Math.abs(Math.sin(t * 9 + i * 1.3)) * 0.07 : 0
      o.position.set(x, bob, z)
      o.rotation.set(0, Math.PI / 2 - s.a[i], 0)
      o.scale.setScalar(1.6)
      o.updateMatrix()
      bodies.current.setMatrixAt(i, o.matrix)
      bodies.current.setColorAt(i, colors[s.st[i]])
      o.position.y = bob + 2
      o.updateMatrix()
      heads.current.setMatrixAt(i, o.matrix)
      if (s.st[i] === 1) {
        o.position.set(x, 0.03, z)
        o.scale.setScalar(p.radius * S)
        o.updateMatrix()
        halos.current.setMatrixAt(k++, o.matrix)
      }
    }
    for (const m of [bodies.current, heads.current]) {
      m.count = s.n
      m.instanceMatrix.needsUpdate = true
    }
    bodies.current.instanceColor.needsUpdate = true
    halos.current.count = k
    halos.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={bodies} args={[geo.body, undefined, CAP]} frustumCulled={false} onUpdate={(m) => m.setColorAt(0, colors[0])}>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[geo.head, undefined, CAP]} frustumCulled={false}>
        <meshStandardMaterial color="#e8c4a0" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[geo.halo, undefined, CAP]} frustumCulled={false}>
        <meshBasicMaterial map={halo} transparent opacity={theme === 'dark' ? 0.55 : 0.4} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/** Paved square ringed by buildings with windows (lit at night) and lamps. */
function Plaza({ W, H, theme }) {
  const night = theme === 'dark'
  const data = useMemo(() => {
    const buildings = [], windows = [], lamps = []
    const m = 4 // gap between plaza and buildings
    let id = 0
    const side = (x0, z0, x1, z1, out) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      let d = 0
      while (d < len - 3) {
        const bw = 5 + hash(id) * 6, bd = 5 + hash(id + 50) * 4, bh = 4 + hash(id + 99) * 16
        const u = (d + bw / 2) / len
        const cx = x0 + (x1 - x0) * u + out[0] * (bd / 2 + m), cz = z0 + (z1 - z0) * u + out[1] * (bd / 2 + m)
        const rot = Math.atan2(out[0], out[1])
        buildings.push({ cx, cz, bw, bd, bh, rot, tone: hash(id + 7) })
        // windows on the plaza-facing wall
        for (let fy = 1.6; fy < bh - 1; fy += 1.8)
          for (let fx = -bw / 2 + 1; fx < bw / 2 - 0.6; fx += 1.4)
            if (hash(id * 31 + fx * 7 + fy * 13) < (night ? 0.55 : 0.9))
              windows.push({ x: cx - out[0] * (bd / 2 + 0.02) + Math.cos(rot) * fx, y: fy, z: cz - out[1] * (bd / 2 + 0.02) - Math.sin(rot) * fx, rot })
        d += bw + 0.8
        id++
      }
    }
    side(-W / 2, -H / 2, W / 2, -H / 2, [0, -1])
    side(-W / 2, H / 2, W / 2, H / 2, [0, 1])
    side(-W / 2, -H / 2, -W / 2, H / 2, [-1, 0])
    side(W / 2, -H / 2, W / 2, H / 2, [1, 0])
    for (let i = 0; i < 12; i++) {
      const tt = i / 12, edge = i % 4
      const x = edge < 2 ? -W / 2 + tt * W * 1.5 % W : edge === 2 ? -W / 2 + 1 : W / 2 - 1
      const z = edge === 0 ? -H / 2 + 1 : edge === 1 ? H / 2 - 1 : -H / 2 + (tt * H * 3) % H
      lamps.push([x, z])
    }
    return { buildings, windows, lamps }
  }, [W, H, night])

  const win = useRef(), bld = useRef(), lampRef = useRef(), bulbRef = useRef()
  const geo = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    win: new THREE.PlaneGeometry(0.7, 0.9),
    pole: new THREE.CylinderGeometry(0.06, 0.08, 3, 6).translate(0, 1.5, 0),
    bulb: new THREE.SphereGeometry(0.22, 8, 6),
  }), [])
  const paving = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = night ? '#1d2433' : '#c9ced6'
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = night ? '#252d3e' : '#b7bdc7'
    g.lineWidth = 3
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke() }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(W / 4, H / 4)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [W, H, night])

  const setAll = (mesh, items, fn) => {
    if (!mesh) return
    const o = new THREE.Object3D()
    items.forEach((it, i) => { fn(o, it); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix) })
    mesh.instanceMatrix.needsUpdate = true
  }
  const shade = (b) => new THREE.Color(night ? '#283246' : '#e4ded5').lerp(new THREE.Color(night ? '#1a2131' : '#c3b9ad'), b.tone)

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0}>
        <planeGeometry args={[W + 8, H + 8]} />
        <meshStandardMaterial map={paving} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[W + 140, H + 140]} />
        <meshStandardMaterial color={night ? '#121826' : '#9aa3ad'} roughness={1} />
      </mesh>
      <instancedMesh ref={bld} args={[geo.box, undefined, data.buildings.length]} key={`b${data.buildings.length}`}
        onUpdate={(m) => {
          setAll(m, data.buildings, (o, b) => { o.position.set(b.cx, 0, b.cz); o.rotation.set(0, b.rot, 0); o.scale.set(b.bw, b.bh, b.bd) })
          data.buildings.forEach((b, i) => m.setColorAt(i, shade(b)))
          m.instanceColor.needsUpdate = true
        }}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={win} args={[geo.win, undefined, data.windows.length]} key={`w${data.windows.length}`}
        onUpdate={(m) => setAll(m, data.windows, (o, it) => { o.position.set(it.x, it.y, it.z); o.rotation.set(0, it.rot + Math.PI, 0); o.scale.setScalar(1) })}>
        <meshBasicMaterial color={night ? '#ffc977' : '#8fb3d6'} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={lampRef} args={[geo.pole, undefined, data.lamps.length]}
        onUpdate={(m) => setAll(m, data.lamps, (o, [x, z]) => { o.position.set(x, 0, z); o.scale.setScalar(1) })}>
        <meshStandardMaterial color="#3a4152" />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[geo.bulb, undefined, data.lamps.length]}
        onUpdate={(m) => setAll(m, data.lamps, (o, [x, z]) => { o.position.set(x, 3.1, z); o.scale.setScalar(1) })}>
        <meshBasicMaterial color={night ? '#ffe2a8' : '#f4f1e8'} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
