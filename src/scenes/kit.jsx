// Shared pieces for the 3D scenes: canvas shell, day/night lighting,
// low-poly model builder and small texture helpers.
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sky, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** 2D sim world units -> scene units (a 1000-wide world becomes 100 wide). */
export const S = 0.1

/** Advances the simulation once per frame, before anything draws it. */
function Ticker({ engine }) {
  useFrame((_, delta) => {
    if (!document.hidden) engine.tick(delta)
  }, -1)
  return null
}

/**
 * Canvas + camera + controls + time-of-day. Dark theme = dusk/night (lights,
 * windows, flames glow), light theme = daytime sky.
 */
export function Shell({ engine, theme, camera, target = [0, 0, 0], fog = [60, 260], space = false, autoRotate = true, maxDistance = 300, children }) {
  const night = theme === 'dark' || space
  const bg = space ? '#03050b' : night ? '#0a1222' : '#cfe0f2'
  return (
    <Canvas className="sim-canvas" dpr={[1, 1.75]} camera={{ position: camera, fov: 45, near: 0.3, far: 3000 }} gl={{ antialias: true }}>
      <color attach="background" args={[bg]} />
      {!space && <fog attach="fog" args={[bg, fog[0], fog[1]]} />}
      {night
        ? <Stars radius={space ? 400 : 600} depth={space ? 200 : 60} count={space ? 6000 : 2500} factor={space ? 5 : 4} fade speed={0.5} />
        : <Sky distance={4000} sunPosition={[200, 60, -300]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} />}
      <hemisphereLight args={night ? ['#b4c6ee', '#3a4660', 1.7] : ['#ffffff', '#7a8a6a', 1.3]} />
      <directionalLight position={night ? [-80, 120, 60] : [120, 160, -80]} intensity={night ? 1.8 : 2.4} color={night ? '#c8d4ff' : '#fff4e0'} />
      <Ticker engine={engine} />
      {children}
      <OrbitControls target={target} autoRotate={autoRotate} autoRotateSpeed={0.3} enableDamping maxPolarAngle={Math.PI * 0.48} minDistance={8} maxDistance={maxDistance} makeDefault />
    </Canvas>
  )
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3()

/**
 * Merge primitive parts into one low-poly geometry with baked vertex colours.
 * parts: [geometry, colour, { p: [x,y,z], r: [rx,ry,rz], s: [sx,sy,sz] }]
 * White parts take the per-instance colour fully; dark parts stay dark.
 */
export function model(parts) {
  const geos = parts.map(([geo, color, t = {}]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    tmpM.compose(tmpV.set(...(t.p || [0, 0, 0])), tmpQ.setFromEuler(tmpE.set(...(t.r || [0, 0, 0]))), tmpS.set(...(t.s || [1, 1, 1])))
    g.applyMatrix4(tmpM)
    const c = new THREE.Color(color)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.dispose()
    return g
  })
  const out = mergeGeometries(geos)
  out.computeVertexNormals()
  out.computeBoundingSphere()
  return out
}

/** Soft round sprite for glows, stars and smoke. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'))
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Deterministic pseudo-random in [0,1) from an integer (stable decoration). */
export const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Flat ground with gently varied vertex colours. */
export function groundGeometry(w, h, colors, seg = 48) {
  const g = new THREE.PlaneGeometry(w, h, seg, Math.round((seg * h) / w)).rotateX(-Math.PI / 2)
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  const cs = colors.map((c) => new THREE.Color(c))
  for (let i = 0; i < n; i++) {
    const c = cs[Math.floor(hash(i) * cs.length)]
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** A low-poly tree (trunk + canopy). Canopy is white so instances can tint it. */
export const treeModel = (canopy = '#ffffff') => model([
  [new THREE.CylinderGeometry(0.09, 0.12, 0.5, 5), '#6b4a32', { p: [0, 0.25, 0] }],
  [new THREE.ConeGeometry(0.45, 1.1, 6), canopy, { p: [0, 0.95, 0] }],
  [new THREE.ConeGeometry(0.34, 0.8, 6), canopy, { p: [0, 1.35, 0] }],
])

export const UP = new THREE.Vector3(0, 1, 0)
