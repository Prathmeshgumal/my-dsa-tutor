/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { loadConfig } from './server/config.ts'
import { createRoutes } from './server/routes.ts'
import { fromAnotherSite } from './server/sameSite.ts'

// Ports, Piston and the data folders: see server/config.ts. Data lives in the project folder by default.
const config = loadConfig({ defaultDataDir: path.resolve(import.meta.dirname, '..') })

/** In development, the API is served by this dev server; `npm start` serves the same routes (server/main.ts). */
function api(): Plugin {
  return {
    name: 'editor-api',
    configureServer(server) {
      const { handle, logger } = createRoutes(config)
      const onRejection = (reason: unknown) => logger.log('error', 'Unhandled error in the server', reason)
      process.on('unhandledRejection', onRejection)
      // Vite restarts the server when its files change; the old one's listener must go with it.
      server.httpServer?.once('close', () => process.off('unhandledRejection', onRejection))
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), api()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // Forward /piston/* to Piston (local container, or `piston` inside Docker Compose) so the browser never makes a cross-origin call.
  server: {
    // Fixed port: browser data (open tabs, theme, settings) is stored per origin, so the address must not change.
    port: config.port,
    strictPort: true,
    proxy: {
      // ws: interactive runs talk to Piston over a WebSocket (/piston/connect).
      '/piston': {
        target: config.pistonUrl,
        rewrite: (p) => p.replace(/^\/piston/, '/api/v2'),
        ws: true,
        // WebSocket upgrades skip the middleware above, so the same-site check is repeated here.
        configure: (proxy) => {
          proxy.on('proxyReqWs', (_proxyReq, req, socket) => {
            if (fromAnotherSite(req)) socket.destroy()
          })
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
