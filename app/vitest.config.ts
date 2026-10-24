// `npm test` runs every package's unit tests. Browser tests are separate: npm run test:e2e
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: 'packages/core', environment: 'node', globals: true } },
      { test: { name: 'server', root: 'packages/server', environment: 'node', globals: true } },
      'packages/web',
    ],
  },
})
