import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TEMPLATES, byId } from './sims/manifest.js'
import { Engine, deviceScale, schemaFor, snap } from './engine.js'
import { mapPrompt } from './ai/mapper.js'
import Stage from './Stage.jsx'
import Panel from './Panel.jsx'
import { SandboxEngine, customTemplate, generateCode, testInSandbox } from './custom.js'
import { extractCode } from './ai/customSim.js'

const EXAMPLES = [
  'a car stuck in a traffic jam at a four-way intersection',
  'ants carrying food back to their nest',
  'a zombie outbreak in a crowded mall',
  'show me how traffic jams form',
  'a murmuration of starlings at dusk',
  'wolves and sheep in a meadow',
  'a wildfire spreading through a dry forest with strong wind',
  'how a spinning gas cloud becomes a galaxy',
]
const SCALE = deviceScale()

const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

/** Turn a config (from AI, keywords or the picker) into a running engine. */
function makeRun(config, extra) {
  const t = byId(config.template_id)
  const schema = schemaFor(t, SCALE)
  const params = Object.fromEntries(Object.entries(schema).map(([k, p]) => [k, snap(p, config.params?.[k] ?? p.default)]))
  const engine = new Engine(t, params, { world: { w: 1000, h: 640 }, schema })
  return {
    t, schema, params, engine,
    meta: {
      key: Math.random(), title: config.title || t.name, description: config.description || t.summary,
      labels: { ...t.labels, ...(config.label_overrides || {}) }, ...extra,
    },
  }
}

export default function App() {
  const [run, setRun] = useState(() => makeRun({ template_id: 'epidemic' }, { source: 'manual' }))
  const [params, setParams] = useState(run.params)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [ai, setAi] = useState({ state: 'checking', message: 'Checking AI…' })
  const [theme, setTheme] = useState(() => store.get('lw-theme') || 'dark')
  const [panelOpen, setPanelOpen] = useState(false)
  const [flashLibrary, setFlashLibrary] = useState(false)
  const [building, setBuilding] = useState(null) // { step, code } while the AI writes a simulation
  const toastTimer = useRef()
  const inputRef = useRef()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    store.set('lw-theme', theme)
  }, [theme])

  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => setAi({ state: s.ready ? 'ready' : s.provider === 'none' ? 'off' : 'down', message: s.message, provider: s.provider }))
      .catch(() => setAi({ state: 'off', message: 'AI not configured (no backend running). Keyword matching and the template picker still work.' }))
  }, [])

  const notify = useCallback((text, kind = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ text, kind, id: Math.random() })
    toastTimer.current = setTimeout(() => setToast(null), 5200)
  }, [])

  const start = useCallback((next) => {
    next.engine.speed = speed
    next.engine.playing = true
    setRun(next)
    setParams(next.params)
    setPlaying(true)
  }, [speed])

  const startCustom = (code, info, q) => {
    const engine = new SandboxEngine(code, info)
    const t = customTemplate(info)
    start({ t, schema: info.params, params: engine.params, engine, meta: { key: Math.random(), title: info.title, description: info.description, labels: t.labels, source: 'custom', code, prompt: q } })
  }

  /** Experimental mode: AI writes a new simulation, we test it, repair once, or fall back. */
  const build = async (q, fallback) => {
    let previous = null, lastError = ''
    for (let attempt = 1; attempt <= 2; attempt++) {
      const step = attempt === 1 ? 'The AI is writing a new simulation' : 'It had a bug: the AI is fixing its code'
      setBuilding({ step, code: '' })
      let text = ''
      try {
        text = await generateCode(q, previous, (t) => setBuilding({ step, code: t }))
      } catch (e) {
        lastError = e.message
        if (/not available|server error/.test(lastError)) break
        previous = { code: text || '(no code)', error: lastError }
        continue
      }
      let code
      try { code = extractCode(text) } catch (e) { lastError = e.message; previous = { code: text, error: lastError }; continue }
      setBuilding({ step: 'Testing it safely in a sandbox', code: text })
      const test = await testInSandbox(code)
      if (test.ok) { setBuilding(null); startCustom(code, test.info, q); return true }
      lastError = test.error
      previous = { code, error: test.error }
    }
    setBuilding(null)
    if (fallback?.config) {
      start(makeRun(fallback.config, { source: 'ai', provider: fallback.provider, warnings: fallback.warnings, prompt: q, closest: true }))
      notify(`The AI couldn't build a working custom simulation (${lastError}). Showing the closest built-in one instead.`, 'warn')
    } else notify(`The AI couldn't build a working simulation (${lastError}). Try rewording, or pick one from the library.`, 'warn')
    return false
  }

  const submit = async (text = prompt) => {
    const q = text.trim()
    if (!q || loading || building) return
    setPrompt(q)
    setLoading(true)
    let result
    try {
      const r = await fetch('/api/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: q }) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      result = await r.json()
    } catch {
      result = { ...(await mapPrompt(q, null)), provider: 'none' } // backend unreachable: map in the browser
    }
    setLoading(false)
    const exactMatch = result.source === 'ai' && result.config && result.exact !== false
    if (exactMatch) {
      start(makeRun(result.config, { source: 'ai', provider: result.provider, warnings: result.warnings, prompt: q }))
      return
    }
    // No built-in simulation shows this exactly: let the AI write one.
    if (ai.state === 'ready' && result.source !== 'keyword') {
      await build(q, result.config ? result : null)
      return
    }
    if (!result.config) {
      notify('No template fits that prompt yet. Pick one from the library below and shape it with the sliders.', 'warn')
      setPanelOpen(true)
      setFlashLibrary(true)
      setTimeout(() => setFlashLibrary(false), 2400)
      return
    }
    start(makeRun(result.config, { source: result.source, provider: result.provider, reason: result.reason, warnings: result.warnings, prompt: q }))
    if (result.source === 'fallback') notify(`AI unavailable or invalid, used the nearest template instead. (${result.reason})`, 'warn')
    if (result.source === 'keyword') notify('AI not configured: matched your prompt to a template by keywords.', 'info')
  }

  const onSandboxError = useCallback((msg) => notify(`The AI-written simulation crashed: ${msg}. Press "Regenerate" to let the AI try again.`, 'warn'), [notify])

  const pick = (id) => start(makeRun({ template_id: id }, { source: 'manual' }))

  const onParam = (k, v) => {
    const restarted = run.engine.setParam(k, v)
    setParams({ ...run.engine.params })
    if (restarted) notify(`${run.schema[k].label} changed: simulation restarted.`, 'info')
  }
  const togglePlay = useCallback(() => {
    run.engine.playing = !run.engine.playing
    setPlaying(run.engine.playing)
  }, [run])
  const reset = useCallback(() => { run.engine.reset(); run.engine.playing = true; setPlaying(true) }, [run])
  const onSpeed = (s) => { run.engine.speed = s; setSpeed(s) }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, button, select')) return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if (e.key === 'r' || e.key === 'R') reset()
      if (e.key === '/') { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, reset])

  const aiLabel = useMemo(() => ({
    ready: ai.provider === 'gemini' ? 'Gemini ready' : 'Ollama ready',
    off: 'AI not configured', down: 'AI offline', checking: 'Checking…',
  })[ai.state], [ai])

  return (
    <div className={`app ${loading || building ? 'is-loading' : ''}`}>
      <div className="backdrop" aria-hidden />
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 48 24" className="logo" aria-hidden>
            <path d="M1 12h10l4-9 6 18 5-14 3 5h18" />
          </svg>
          <span>Livewire</span>
        </div>
        <form className="prompt glass" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <svg viewBox="0 0 24 24" className="spark" aria-hidden><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
          <input
            ref={inputRef} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a simulation…  e.g. how a rumour spreads at a party" maxLength={300}
            aria-label="Describe a simulation"
          />
          <button className="btn primary go" disabled={loading || !!building || !prompt.trim()}>
            {loading || building ? <span className="spinner" /> : 'Simulate'}
          </button>
        </form>
        <div className="top-right">
          <span className={`ai-pill ${ai.state}`} title={ai.message} tabIndex={0}><i />{aiLabel}</span>
          <button className="btn icon ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light/dark mode">
            {theme === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
          </button>
        </div>
      </header>

      <div className="examples" role="list" aria-label="Example prompts">
        {EXAMPLES.map((ex) => (
          <button key={ex} role="listitem" className="chip" onClick={() => submit(ex)} disabled={loading || !!building}>{ex}</button>
        ))}
      </div>

      <main className="main">
        <section className="stage-wrap glass">
          {building
            ? <div className="stage-idle" aria-hidden /> /* scene paused so the AI gets the whole GPU */
            : <Stage engine={run.engine} template={run.t} theme={theme} labels={run.meta.labels} runKey={run.meta.key} onSandboxError={onSandboxError} />}
          {!playing && <div className="paused-tag">Paused · press Space</div>}
          {loading && (
            <div className="composing">
              <div className="scan" />
              <p>Composing a simulation for<br /><b>“{prompt}”</b></p>
              <small>{ai.state === 'ready' ? 'Checking the built-in simulations first…' : 'Matching your words to the template library…'}</small>
            </div>
          )}
          {building && (
            <div className="composing">
              <div className="scan" />
              <p>No built-in simulation shows<br /><b>“{prompt}”</b></p>
              <small>{building.step}… <span className="spinner" style={{ display: 'inline-block', verticalAlign: '-3px', width: 12, height: 12 }} /></small>
              <pre className="code-live">{building.code ? building.code.split('\n').slice(-12).join('\n') : 'waiting for the model to start (the first run loads it, ~20 s)…'}</pre>
            </div>
          )}
        </section>
        <Panel
          template={run.t} schema={run.schema} params={params} meta={run.meta} labels={run.meta.labels}
          engine={run.engine} theme={theme} playing={playing} speed={speed} open={panelOpen} templates={TEMPLATES}
          flashLibrary={flashLibrary} onToggle={() => setPanelOpen((o) => !o)} onParam={onParam} onPlay={togglePlay}
          onReset={reset} onSpeed={onSpeed} onAction={(id) => run.engine.act(id)} onPick={pick}
          canBuild={ai.state === 'ready' && !building && !loading && !!(run.meta.prompt || prompt.trim())}
          onBuild={() => build(run.meta.prompt || prompt.trim(), null)}
        />
      </main>

      {toast && <div key={toast.id} className={`toast glass ${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  )
}
