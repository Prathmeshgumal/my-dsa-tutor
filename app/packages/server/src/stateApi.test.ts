// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createStateMiddleware } from './stateApi'

let dir: string
let server: Server
let base: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'state-'))
  const middleware = createStateMiddleware(path.join(dir, 'state'), { maxBytes: 1000 })
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418
      res.end()
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/state`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  await rm(dir, { recursive: true, force: true })
})

const put = (key: string, body: string) => fetch(`${base}/${key}`, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } })

test('nothing saved yet: every kind of state is null', async () => {
  const res = await fetch(base)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(await res.json()).toEqual({ settings: null, workspace: null, ai: null, problems: null })
})

test('saves state as it was sent, and gives it back', async () => {
  const chats = JSON.stringify({ state: { chats: [{ id: 'c1' }] }, version: 0 })
  expect((await put('ai', chats)).status).toBe(204)
  expect((await put('settings', '{"state":{"theme":"dark"},"version":1}')).status).toBe(204)
  expect(await (await fetch(base)).json()).toEqual({ settings: '{"state":{"theme":"dark"},"version":1}', workspace: null, ai: chats, problems: null })
  expect((await readdir(path.join(dir, 'state'))).sort()).toEqual(['ai.json', 'settings.json'])
})

test('refuses unknown kinds, broken JSON and anything too big, and keeps what was there', async () => {
  await put('settings', '{"ok":true}')
  expect((await put('passwords', '{}')).status).toBe(404)
  expect((await put('settings', '{nope')).status).toBe(400)
  expect((await put('settings', JSON.stringify({ big: 'x'.repeat(2000) }))).status).toBe(413)
  expect((await (await fetch(base)).json()).settings).toBe('{"ok":true}')
})

test('leaves other routes alone', async () => {
  expect((await fetch(`${base.replace('/state', '/files')}`)).status).toBe(418)
  expect((await fetch(`${base}/settings`)).status).toBe(405)
})
