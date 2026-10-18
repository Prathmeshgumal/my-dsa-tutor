/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // Forward /piston/* to the local Piston container so the browser never makes a cross-origin call.
  server: {
    proxy: {
      '/piston': { target: 'http://127.0.0.1:2000', rewrite: (p) => p.replace(/^\/piston/, '/api/v2') },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
