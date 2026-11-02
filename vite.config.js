import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi, loadEnv } from './server/api.mjs'

// In dev the /api endpoints run inside Vite's Node process, so the AI key
// stays server-side and one `npm run dev` starts everything.
const livewireApi = () => ({
  name: 'livewire-api',
  configureServer(server) {
    loadEnv()
    server.middlewares.use('/api', createApi())
  },
})

// The 3D chunk (three.js) is big by nature and loads lazily.
// LIVEWIRE_BASE sets the sub-path for GitHub Pages (e.g. /livewire/).
export default defineConfig({ base: process.env.LIVEWIRE_BASE || '/', plugins: [react(), livewireApi()], build: { chunkSizeWarningLimit: 900 } })
