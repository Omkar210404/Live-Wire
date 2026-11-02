import { useEffect, useRef } from 'react'
import { PALETTES } from './Stage.jsx'

const SOURCE = {
  ai: (p) => ({ text: `AI · ${p}`, cls: 'ok' }),
  fallback: () => ({ text: 'Keyword fallback', cls: 'warn' }),
  keyword: () => ({ text: 'Keyword match', cls: 'muted' }),
  manual: () => ({ text: 'Manual', cls: 'muted' }),
  custom: () => ({ text: 'AI-generated · experimental', cls: 'warn' }),
}
const SPEEDS = [0.25, 0.5, 1, 2, 4]

export default function Panel(props) {
  const { template, schema, params, meta, labels, engine, theme, playing, speed, open, templates, flashLibrary } = props
  const badge = (SOURCE[meta.source] || SOURCE.manual)(meta.provider)
  return (
    <aside className={`panel glass ${open ? 'open' : ''}`}>
      <button className="sheet-handle" onClick={props.onToggle} aria-expanded={open}>
        <span /> {open ? 'Hide controls' : 'Show controls'}
      </button>
      <div className="panel-scroll" key={meta.key}>
        <header className="panel-head fade-in">
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
          <span className="tmpl-name">{template.name}</span>
          <h1>{meta.title}</h1>
          <p className="desc">{meta.description}</p>
          {meta.reason && meta.source === 'fallback' && <p className="note warn">AI fell back: {meta.reason}</p>}
          {meta.closest && <p className="note warn">Closest built-in match. It doesn't show exactly what you asked for.</p>}
          {meta.source === 'custom' && (
            <>
              <p className="note warn">The AI wrote this simulation just now, for your prompt. It runs in a sandbox and may be inaccurate or look rough.</p>
              <details className="note">
                <summary>Show the code the AI wrote</summary>
                <pre className="code-box">{meta.code}</pre>
              </details>
            </>
          )}
          {props.canBuild && (
            <button className="btn build-btn" onClick={props.onBuild}>
              {meta.source === 'custom' ? 'Regenerate with AI' : 'Not quite it? Build exactly this with AI'}
            </button>
          )}
          {meta.warnings?.length > 0 && (
            <details className="note">
              <summary>{meta.warnings.length} AI value{meta.warnings.length > 1 ? 's' : ''} corrected</summary>
              <ul>{meta.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
        </header>

        <div className="controls">
          <button className="btn primary icon" onClick={props.onPlay} aria-label={playing ? 'Pause' : 'Play'} title="Space">
            {playing ? <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" /></svg>}
          </button>
          <button className="btn icon" onClick={props.onReset} aria-label="Reset" title="Reset (R)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /></svg>
          </button>
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? 'on' : ''} onClick={() => props.onSpeed(s)}>{s}×</button>
            ))}
          </div>
        </div>
        {template.actions && (
          <div className="actions">
            {template.actions.map((a) => <button key={a.id} className="btn ghost" onClick={() => props.onAction(a.id)}>{a.label}</button>)}
          </div>
        )}

        {template.series.length
          ? <Chart engine={engine} template={template} labels={labels} pal={PALETTES[theme]} />
          : <p className="note">This AI-written simulation doesn't report any numbers, so there's nothing to chart.</p>}

        <section className="sliders">
          <h2>Rules <small>drag to change the live simulation</small></h2>
          {Object.entries(schema).map(([k, p]) => (
            <label className="slider" key={k} title={p.help || ''}>
              <span className="s-top">
                <span>{p.label}{p.restart && <em title="Changing this restarts the simulation">restarts</em>}</span>
                <b>{formatVal(params[k], p)}</b>
              </span>
              <input
                type="range" min={p.min} max={p.max} step={p.step} value={params[k]}
                style={{ '--pct': `${((params[k] - p.min) / (p.max - p.min)) * 100}%` }}
                onChange={(e) => props.onParam(k, Number(e.target.value))}
              />
              {p.help && <span className="s-help">{p.help}</span>}
            </label>
          ))}
        </section>

        <section className={`library ${flashLibrary ? 'flash' : ''}`}>
          <h2>Library <small>pick a template by hand</small></h2>
          <div className="lib-grid">
            {templates.map((t) => (
              <button key={t.id} className={`lib-item ${t.id === template.id ? 'on' : ''}`} onClick={() => props.onPick(t.id)}>
                <b>{t.name}</b>
                <span>{t.view === '3d' ? '3D' : '2D'} · {Object.keys(t.params).length} rules</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}

function formatVal(v, p) {
  const d = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : p.step >= 0.01 ? 2 : 3
  return `${Number(v).toFixed(d)}${p.unit ? ` ${p.unit}` : ''}`
}

/** Live line chart, redrawn ~12x a second from the engine's history (no React renders). */
function Chart({ engine, template, labels, pal }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let id
    const draw = () => {
      id = setTimeout(draw, 80)
      if (document.hidden) return
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = r.width, h = r.height, pad = 6
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = pal.track
      ctx.lineWidth = 1
      for (let g = 1; g < 4; g++) { const y = Math.round((h * g) / 4) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      const hist = engine.history
      const maxOf = (k) => Math.max(1e-9, ...hist[k])
      const shared = template.sharedScale ? Math.max(...template.series.map((s) => maxOf(s.key))) : 0
      for (const s of template.series) {
        const data = hist[s.key]
        if (data.length < 2) continue
        const max = s.max || shared || maxOf(s.key) * 1.1
        const span = Math.max(data.length, 80) - 1 // window grows until the history is full
        const x = (i) => (i / span) * w
        const y = (v) => h - pad - (v / max) * (h - pad * 2)
        const color = pal[s.color] || pal.fg
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, color + '33'); grad.addColorStop(1, color + '00')
        ctx.beginPath()
        data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.stroke()
        ctx.lineTo(x(data.length - 1), h); ctx.lineTo(0, h); ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()
        const lx = x(data.length - 1), ly = y(data.at(-1))
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill()
      }
    }
    draw()
    return () => clearTimeout(id)
  }, [engine, template, pal])

  return (
    <section className="chart">
      <canvas ref={ref} />
      <div className="legend">
        {template.series.map((s) => (
          <span key={s.key}><i style={{ background: pal[s.color] }} />{labels[s.key]}</span>
        ))}
      </div>
    </section>
  )
}
