// Starts the editor for the browser tests (playwright.config.ts runs this): a fresh data folder with a few
// files, a pretend Piston, and the real server from packages/server/src/app.ts. Nothing touches your own data or Docker.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { createAppServer } from '../packages/server/src/app.ts'
import { loadConfig } from '../packages/server/src/config.ts'
import { DATA_DIR, E2E_PORT, SOLUTIONS } from './paths.ts'

rmSync(DATA_DIR, { recursive: true, force: true })
mkdirSync(SOLUTIONS, { recursive: true })
writeFileSync(path.join(SOLUTIONS, 'two_sum.cpp'), '#include <iostream>\nint main() {\n  std::cout << 3;\n}\n')
writeFileSync(path.join(SOLUTIONS, 'hello.py'), 'print("hello")\n')

// Piston with C++ and Python installed but not Java, so the Setup check has something to report.
const piston = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/api/v2/runtimes') {
    return res.end(JSON.stringify([
      { language: 'c++', version: '10.2.0', aliases: [] },
      { language: 'python', version: '3.12.0', aliases: [] },
    ]))
  }
  res.statusCode = 404
  res.end('{}')
})
piston.listen(0, '127.0.0.1', () => {
  const { port } = piston.address() as { port: number }
  const config = loadConfig({ env: { DATA_DIR, PORT: String(E2E_PORT), PISTON_URL: `http://127.0.0.1:${port}` }, defaultDataDir: DATA_DIR })
  const app = createAppServer(config, { distDir: path.resolve(import.meta.dirname, '../packages/web/dist') })
  app.listen(config.port, '127.0.0.1', () => console.log(`Browser-test editor at http://localhost:${config.port}`))
})
