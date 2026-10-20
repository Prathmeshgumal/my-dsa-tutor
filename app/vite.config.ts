/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { createClaudeChatMiddleware } from './server/claudeChat.ts'
import { createNotesMiddleware, createSolutionsMiddleware } from './server/solutionsApi.ts'

// The editor's files live as real files in <repo>/solutions (override with SOLUTIONS_DIR).
const solutionsDir = process.env.SOLUTIONS_DIR ?? path.resolve(import.meta.dirname, '../solutions')
// Markdown notes live in <repo>/notes (override with NOTES_DIR).
const notesDir = process.env.NOTES_DIR ?? path.resolve(import.meta.dirname, '../notes')

function solutionsApi(): Plugin {
  return {
    name: 'solutions-api',
    configureServer(server) {
      server.middlewares.use(createSolutionsMiddleware(solutionsDir))
      server.middlewares.use(createNotesMiddleware(notesDir))
      // Claude runs in the solutions folder, so it sees the same files the editor shows.
      server.middlewares.use(createClaudeChatMiddleware({ cwd: solutionsDir, notesDir }))
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
      '/piston': { target: process.env.PISTON_URL ?? 'http://127.0.0.1:2000', rewrite: (p) => p.replace(/^\/piston/, '/api/v2') },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
