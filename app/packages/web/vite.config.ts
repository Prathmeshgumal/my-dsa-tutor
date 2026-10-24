/// <reference types="vitest/config" />
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const appDir = path.resolve(import.meta.dirname, '../..')

/** The editor's port: PORT, else "port" in dsa-tutor.json, else 5199. The server (app/server, config.py) reads the
 * rest of the settings and checks them all; this is only where the page is served from in development. */
function editorPort(): number {
  if (process.env.PORT) return Number(process.env.PORT)
  const dataDir = path.resolve(process.env.DATA_DIR || path.dirname(appDir))
  try {
    const port = (JSON.parse(readFileSync(path.join(dataDir, 'dsa-tutor.json'), 'utf8')) as { port?: unknown }).port
    if (typeof port === 'number') return port
  } catch {
    // No settings file: the default.
  }
  return 5199
}

const port = editorPort()
const serverUrl = `http://127.0.0.1:${process.env.DSA_SERVER_PORT ?? port + 1}`

/** In development the API comes from the Python server (app/server), started here and restarted when its code
 * changes. Vite forwards /api and /piston to it; the server does its own same-site checks. `npm start` serves the
 * built page from the same server. */
function api(): Plugin {
  return {
    name: 'editor-api',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITEST) return // unit tests fake the API
      const child = spawn('uv', ['run', '--project', 'server', 'watchfiles', '--filter', 'python', 'python -m dsa_server', 'server/src'], {
        cwd: appDir,
        env: { ...process.env, PORT: new URL(serverUrl).port, HOST: '127.0.0.1' },
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

export default defineConfig({
  plugins: [react(), tailwindcss(), api()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // The geist package doesn't export its font files, so index.css reaches them through its real folder,
      // wherever npm put it.
      '@geist-fonts': path.join(path.dirname(fileURLToPath(import.meta.resolve('geist/font'))), 'fonts'),
    },
  },
  server: {
    // If it's taken, say so instead of quietly using another port.
    port,
    strictPort: true,
    proxy: {
      '/api': { target: serverUrl },
      // ws: interactive runs talk to Piston over a WebSocket (/piston/connect), through the server.
      '/piston': { target: serverUrl, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
