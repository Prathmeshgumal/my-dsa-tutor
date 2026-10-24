// Browser tests: `npm run test:e2e`. They build the page, start the editor on a throwaway data folder with a
// pretend Piston (e2e/serve.ts), and click through it in a real browser.
import { defineConfig } from '@playwright/test'
import { E2E_PORT } from './e2e/paths.ts'

export default defineConfig({
  testDir: './e2e',
  // One editor and one data folder are shared, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build -w @dsa/web -- --logLevel warn && node e2e/serve.ts',
    url: `http://localhost:${E2E_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
