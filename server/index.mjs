// Production server: serves the built app (dist/) and the /api endpoints.
// Run `npm run build` first, then `npm start`.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApi, loadEnv } from './api.mjs'

loadEnv()
const api = createApi()
const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' }
const port = Number(process.env.PORT) || 8787

createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return api(req, res)
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([\/]\.\.)+/, '')
  for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
    if (!file.startsWith(DIST)) break
    try {
      const data = await readFile(file)
      res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream')
      return res.end(data)
    } catch {}
  }
  res.statusCode = 404
  res.end('Not found. Did you run `npm run build`?')
}).listen(port, () => console.log(`Livewire on http://localhost:${port}`))
