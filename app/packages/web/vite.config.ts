/// <reference types="vitest/config" />
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { loadConfig } from '@dsa/server/config'
import { createRoutes } from '@dsa/server/routes'
import { fromAnotherSite } from '@dsa/server/sameSite'

// Ports, Piston and the data folders: see packages/server/src/config.ts. Data lives in the project folder by default.
const config = loadConfig({ defaultDataDir: path.resolve(import.meta.dirname, '../../..') })

/** In development, the API is served by this dev server; `npm start` serves the same routes (packages/server/src/main.ts). */
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

// `npm run dev:python`: the API comes from the Python server (app/server) instead, started here and restarted
// when its code changes. Vite forwards /api and /piston to it; the Python server does its own same-site checks.
const python = process.env.DSA_SERVER === 'python'
const pythonUrl = `http://127.0.0.1:${process.env.DSA_PYTHON_PORT ?? config.port + 1}`

function pythonApi(): Plugin {
  return {
    name: 'editor-api-python',
    apply: 'serve',
    configureServer(server) {
      const appDir = path.resolve(import.meta.dirname, '../..')
      const child = spawn('uv', ['run', '--project', 'server', 'watchfiles', '--filter', 'python', 'python -m dsa_server', 'server/src'], {
        cwd: appDir,
        env: { ...process.env, PORT: new URL(pythonUrl).port, HOST: '127.0.0.1' },
        stdio: 'inherit',
      })
      const stop = () => child.kill('SIGINT')
      server.httpServer?.once('close', stop)
      // Vite exits on Ctrl+C without closing its server, so the Python server is stopped on the way out too.
      process.once('exit', stop)
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.once(signal, () => {
          stop()
          process.exit(0)
        })
      }
    },
  }
}

const pythonProxy = {
  '/api': { target: pythonUrl },
  '/piston': { target: pythonUrl, ws: true },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), python ? pythonApi() : api()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // The geist package doesn't export its font files, so index.css reaches them through its real folder,
      // wherever npm put it.
      '@geist-fonts': path.join(path.dirname(fileURLToPath(import.meta.resolve('geist/font'))), 'fonts'),
    },
  },
  // Forward /piston/* to Piston (local container, or `piston` inside Docker Compose) so the browser never makes a cross-origin call.
  server: {
    // From the config; if it's taken, say so instead of quietly using another port.
    port: config.port,
    strictPort: true,
    proxy: python ? pythonProxy : {
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
