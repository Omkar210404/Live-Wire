import { lazy, Suspense, useEffect, useRef } from 'react'

// Three.js is ~700 kB, so the 3D view only loads when a 3D template runs.
const View3D = lazy(() => import('./View3D.jsx'))

// Canvas colours per theme (CSS can't reach inside a canvas).
export const PALETTES = {
  dark: { bg: '#0a0d14', fg: '#e8ecf4', muted: '#7d889b', track: '#1b2331', accent: '#ffb35c', accent2: '#ffe3b3', cool1: '#6cb6ff', cool2: '#4fd1c5', cool3: '#8b8cf5', tree: '#2f8f78', ash: '#2c313c' },
  light: { bg: '#f3f5f9', fg: '#141a26', muted: '#6a7585', track: '#d5dbe5', accent: '#e8792b', accent2: '#ffb066', cool1: '#2f74d0', cool2: '#14998c', cool3: '#6a5fd8', tree: '#3f9a6e', ash: '#c3c9d2' },
}

/** Last measured stage aspect, so new engines start with the right world shape. */
export const stageWorld = { w: 1000, h: 625 }

export default function Stage({ engine, template, theme, labels, runKey }) {
  const hudRef = useRef(null)
  const pal = PALETTES[theme]

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
      {template.view === '3d'
        ? <Suspense fallback={<div className="loading-3d">Loading 3D engine…</div>}><View3D engine={engine} template={template} pal={pal} theme={theme} /></Suspense>
        : <View2D engine={engine} template={template} pal={pal} />}
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
      if (w > 0 && h > 0) {
        stageWorld.h = Math.round((1000 * h) / w)
        engine.setWorld(1000, stageWorld.h)
      }
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
