import { lazy, Suspense, useEffect, useRef, useState } from 'react'

// Each template can have a 3D scene at src/scenes/<id>.jsx, found automatically
// and lazy-loaded (three.js only downloads when a scene is shown).
const sceneFiles = import.meta.glob(['./scenes/*.jsx', '!./scenes/kit.jsx'])
const SCENES = Object.fromEntries(Object.entries(sceneFiles).map(([path, load]) => [path.match(/scenes\/(.+)\.jsx$/)[1], lazy(load)]))
// Fallback for a 3D template without its own scene.
const View3D = lazy(() => import('./View3D.jsx'))
/** World shape the 3D scenes are laid out for (2D sims). */
const WORLD_3D = { w: 1000, h: 640 }

// Canvas colours per theme (CSS can't reach inside a canvas).
export const PALETTES = {
  dark: { bg: '#0a0d14', fg: '#e8ecf4', muted: '#7d889b', track: '#1b2331', accent: '#ffb35c', accent2: '#ffe3b3', cool1: '#6cb6ff', cool2: '#4fd1c5', cool3: '#8b8cf5', tree: '#2f8f78', ash: '#2c313c' },
  light: { bg: '#f3f5f9', fg: '#141a26', muted: '#6a7585', track: '#d5dbe5', accent: '#e8792b', accent2: '#ffb066', cool1: '#2f74d0', cool2: '#14998c', cool3: '#6a5fd8', tree: '#3f9a6e', ash: '#c3c9d2' },
}

export default function Stage({ engine, template, theme, labels, runKey }) {
  const hudRef = useRef(null)
  const pal = PALETTES[theme]
  const [mode, setMode] = useState('3d')
  const Scene = SCENES[template.id]
  const hasMap = typeof template.render === 'function'
  const show3D = Scene && (mode === '3d' || !hasMap)

  useEffect(() => {
    if (show3D && 'w' in engine.state) engine.setWorld(WORLD_3D.w, WORLD_3D.h)
  }, [show3D, engine])

  // HUD numbers: written straight into the DOM a few times a second.
  useEffect(() => {
    let id
    const loop = () => {
      const el = hudRef.current
      if (el && engine) {
        const st = engine.latest
        el.querySelectorAll('[data-k]').forEach((n) => { n.textContent = fmt(st[n.dataset.k]) })
        const t = el.querySelector('[data-time]')
        if (t) t.textContent = `${engine.simTime.toFixed(1)}s`
      }
      id = setTimeout(loop, 150)
    }
    loop()
    return () => clearTimeout(id)
  }, [engine])

  return (
    <div className="stage" key={runKey}>
      <Suspense fallback={<div className="loading-3d"><span className="spinner" />Building the 3D scene…</div>}>
        {show3D ? <Scene engine={engine} template={template} theme={theme} pal={pal} />
          : hasMap ? <View2D engine={engine} template={template} pal={pal} />
          : <View3D engine={engine} template={template} pal={pal} theme={theme} />}
      </Suspense>
      {Scene && hasMap && (
        <div className="view-toggle seg glass" role="group" aria-label="View">
          <button className={show3D ? 'on' : ''} onClick={() => setMode('3d')}>3D</button>
          <button className={!show3D ? 'on' : ''} onClick={() => setMode('map')}>Map</button>
        </div>
      )}
      {show3D && <div className="orbit-hint">drag to orbit · scroll to zoom</div>}
      <div className="hud glass" ref={hudRef}>
        {Object.keys(template.labels).map((k) => {
          const s = template.series.find((x) => x.key === k)
          return (
            <div className="hud-row" key={k}>
              <i style={{ background: pal[s?.color] || pal.muted }} />
              <span>{labels[k]}</span>
              <b data-k={k}>{fmt(engine.latest[k])}</b>
            </div>
          )
        })}
        <div className="hud-row hud-time"><span>sim time</span><b data-time>0.0s</b></div>
      </div>
    </div>
  )
}

const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(v < 10 ? 2 : 1))

function View2D({ engine, template, pal }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let w = 0, h = 0, raf, last = performance.now()
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width; h = r.height
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (w > 0 && h > 0) engine.setWorld(1000, Math.round((1000 * h) / w))
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = (now - last) / 1000
      last = now
      if (document.hidden) return // paused while the tab is hidden
      engine.tick(dt)
      ctx.clearRect(0, 0, w, h)
      template.render(ctx, engine.state, engine.params, pal, w, h)
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [engine, template, pal])
  return <canvas ref={ref} className="sim-canvas" />
}
