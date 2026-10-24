// @vitest-environment node
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadConfig } from './config'
import { createRoutes } from './routes'

let dir: string
let server: Server
let base: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'routes-'))
  const config = loadConfig({ env: {}, defaultDataDir: dir })
  await mkdir(config.folders.solutions, { recursive: true })
  await writeFile(path.join(config.folders.solutions, 'a.cpp'), 'int main(){}')
  const { handle } = createRoutes(config)
  server = createServer((req, res) =>
    handle(req, res, () => {
      res.statusCode = 404
      res.end('not an API route')
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(dir, { recursive: true, force: true })
})

test('the API routes read and write the configured folders', async () => {
  expect(await (await fetch(`${base}/api/files`)).json()).toEqual([{ name: 'a.cpp', content: 'int main(){}' }])
  const put = await fetch(`${base}/api/notes/note-1.md`, { method: 'PUT', body: JSON.stringify({ content: '# Hi' }) })
  expect(put.status).toBe(204)
  expect(await (await fetch(`${base}/api/notes`)).json()).toEqual([{ name: 'note-1.md', content: '# Hi' }])
  expect((await fetch(`${base}/api/problems`)).status).toBe(200)
  expect((await fetch(`${base}/api/health`)).status).toBe(200)
})

test('anything else is passed on', async () => {
  const res = await fetch(`${base}/index.html`)
  expect(res.status).toBe(404)
  expect(await res.text()).toBe('not an API route')
})

test('other websites are refused before any route runs', async () => {
  const res = await fetch(`${base}/api/files`, { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } })
  expect(res.status).toBe(403)
})
