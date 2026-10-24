/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { removeLeftoverTempFiles } from './server/atomicWrite.ts'
import { createClaudeChatMiddleware } from './server/claudeChat.ts'
import { createFolderEventsMiddleware } from './server/folderEvents.ts'
import { createHealthMiddleware } from './server/healthApi.ts'
import { createLogger, createLogMiddleware } from './server/log.ts'
import { createProblemsMiddleware } from './server/problemsApi.ts'
import { createSameSiteGuard, fromAnotherSite } from './server/sameSite.ts'
import { createNotesMiddleware, createPlaygroundMiddleware, createSolutionsMiddleware } from './server/solutionsApi.ts'

// The editor's files live as real files in <repo>/solutions (override with SOLUTIONS_DIR).
const solutionsDir = process.env.SOLUTIONS_DIR ?? path.resolve(import.meta.dirname, '../solutions')
// Markdown notes live in <repo>/notes (override with NOTES_DIR).
const notesDir = process.env.NOTES_DIR ?? path.resolve(import.meta.dirname, '../notes')
// Dry-run visualizations shown in the Playground live in <repo>/playground (override with PLAYGROUND_DIR).
const playgroundDir = process.env.PLAYGROUND_DIR ?? path.resolve(import.meta.dirname, '../playground')

// Practice problems (description, tests, solution) live in <repo>/problems, one folder each (override with PROBLEMS_DIR).
const problemsDir = process.env.PROBLEMS_DIR ?? path.resolve(import.meta.dirname, '../problems')

const pistonUrl = process.env.PISTON_URL ?? 'http://127.0.0.1:2000'

// The editor's log file lives in <repo>/logs (override with LOGS_DIR).
const logsDir = process.env.LOGS_DIR ?? path.resolve(import.meta.dirname, '../logs')

function solutionsApi(): Plugin {
  return {
    name: 'solutions-api',
    configureServer(server) {
      // First: other websites open in your browser may not use any of the routes below.
      server.middlewares.use(createSameSiteGuard())
      const logger = createLogger(logsDir)
      const onRejection = (reason: unknown) => logger.log('error', 'Unhandled error in the server', reason)
      process.on('unhandledRejection', onRejection)
      // Vite restarts the server when its files change; the old one's listener must go with it.
      server.httpServer?.once('close', () => process.off('unhandledRejection', onRejection))
      server.middlewares.use(createLogMiddleware(logger))
      void removeLeftoverTempFiles([solutionsDir, notesDir, playgroundDir, problemsDir]).catch((e) =>
        logger.log('warn', 'Couldn’t clear temporary files left by an interrupted save', e),
      )
      server.middlewares.use(
        createHealthMiddleware({
          pistonUrl,
          folders: { solutions: solutionsDir, notes: notesDir, playground: playgroundDir, problems: problemsDir },
        }),
      )
      server.middlewares.use(
        createFolderEventsMiddleware({
          folders: { files: solutionsDir, notes: notesDir, playground: playgroundDir, problems: problemsDir },
        }),
      )
      server.middlewares.use(createSolutionsMiddleware(solutionsDir))
      server.middlewares.use(createNotesMiddleware(notesDir))
      server.middlewares.use(createPlaygroundMiddleware(playgroundDir))
      server.middlewares.use(createProblemsMiddleware(problemsDir))
      // Claude runs in the solutions folder, so it sees the same files the editor shows.
      server.middlewares.use(createClaudeChatMiddleware({ cwd: solutionsDir, notesDir, playgroundDir, problemsDir, logger }))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), solutionsApi()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // Forward /piston/* to Piston (local container, or `piston` inside Docker Compose) so the browser never makes a cross-origin call.
  server: {
    // Fixed port: browser data (open tabs, theme, settings) is stored per origin, so the address must not change.
    port: 5199,
    strictPort: true,
    proxy: {
      // ws: interactive runs talk to Piston over a WebSocket (/piston/connect).
      '/piston': {
        target: pistonUrl,
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
