// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, rm, utimes, writeFile, mkdir } from 'node:fs/promises'
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
  expect((await fetch(`${base}/api/state/settings`, { method: 'PUT', body: '{"state":{}}' })).status).toBe(204)
  expect((await (await fetch(`${base}/api/state`)).json()).settings).toBe('{"state":{}}')
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

test('a fresh data folder gets all its folders, so nothing has to be set up by hand', async () => {
  const fresh = await mkdtemp(path.join(tmpdir(), 'fresh-'))
  const config = loadConfig({ env: {}, defaultDataDir: path.join(fresh, 'data') })
  createRoutes(config)
  for (const folder of Object.values(config.folders)) expect(existsSync(folder)).toBe(true)
  await rm(fresh, { recursive: true, force: true })
})

test('Setup checks every folder the editor writes to, tabs and logs included', async () => {
  const health = (await (await fetch(`${base}/api/health`)).json()) as { folders: { name: string }[] }
  expect(health.folders.map((f) => f.name)).toEqual(['solutions', 'notes', 'playground', 'problems', 'state', 'logs'])
})

test('a half-finished save of tabs or chats left by a crash is cleared at start', async () => {
  const config = loadConfig({ env: {}, defaultDataDir: dir })
  const leftover = path.join(config.folders.state, '.ai.json.1234abcd.saving')
  await writeFile(leftover, '{"half":')
  const old = new Date(Date.now() - 60 * 60_000)
  await utimes(leftover, old, old)
  createRoutes(config)
  await vi.waitFor(() => expect(existsSync(leftover)).toBe(false))
})
