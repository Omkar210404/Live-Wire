// The simulation library. To add a template: drop a module in this folder
// that follows the contract below, then add one import + one array entry.
//
// Template contract (plain JS, no browser APIs outside render):
//   id, name, summary, keywords[]   - identity + what the AI / keyword fallback see
//   view: '2d' | '3d'               - Canvas 2D or Three.js instanced mesh
//   params: { key: { label, min, max, step, default, unit?, help?,
//                    restart?  - changing it re-initialises the sim
//                    heavy?    - an agent/cell count, capped on weak devices } }
//   labels: { statKey: 'Display name' }  - the AI may rename these
//   series: [{ key, color, max? }]       - which stats the live chart plots
//   init(params, rand, world) -> state
//   step(state, params, dt)              - mutate state by dt seconds
//   stats(state) -> { statKey: number }
//   render(ctx, state, params, theme, w, h)   for view '2d'
//   render3d: { shape, size, palette, bounds } for view '3d' (state.pos/vel/kind/n)
//   optional: timeScale, fixedDt, sharedScale (one chart axis), actions[{id,label}] + act(state, id), examples[]
import epidemic from './epidemic.js'
import boids from './boids.js'
import ecosystem from './ecosystem.js'
import traffic from './traffic.js'
import gravity from './gravity.js'
import forestfire from './forestfire.js'

export const TEMPLATES = [epidemic, boids, ecosystem, traffic, gravity, forestfire]

export const byId = (id) => TEMPLATES.find((t) => t.id === id)

export const defaults = (t) => Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, v.default]))
