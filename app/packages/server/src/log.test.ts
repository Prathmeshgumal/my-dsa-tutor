// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLogger, createLogMiddleware } from './log.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'logs-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const fixed = () => new Date('2026-10-24T10:00:00.000Z')

test('writes one JSON line per entry, with errors’ stacks, and tails the newest', async () => {
  const logger = createLogger(dir, { now: fixed })
  logger.log('info', 'started')
  logger.log('error', 'chat failed', new Error('boom'))
  const lines = await logger.tail(5)
  expect(lines).toHaveLength(2)
  expect(JSON.parse(lines[0])).toEqual({ at: '2026-10-24T10:00:00.000Z', level: 'info', message: 'started' })
  expect(JSON.parse(lines[1])).toMatchObject({ level: 'error', message: 'chat failed', detail: expect.stringContaining('Error: boom') })
  expect(await logger.tail(1)).toEqual([lines[1]])
})

test('moves a full log aside and starts a new one', async () => {
  await writeFile(path.join(dir, 'editor.log'), 'x'.repeat(1024 * 1024 + 1))
  const logger = createLogger(dir)
  logger.log('warn', 'fresh')
  await logger.tail(1)
  expect((await readdir(dir)).sort()).toEqual(['editor.log', 'editor.log.1'])
  expect(await readFile(path.join(dir, 'editor.log'), 'utf8')).toContain('fresh')
})

test('a log folder it can’t write to doesn’t throw', async () => {
  const logger = createLogger(path.join(dir, 'file-not-folder', 'x'))
  await writeFile(path.join(dir, 'file-not-folder'), '')
  logger.log('error', 'lost')
  expect(await logger.tail(1)).toEqual([])
})

describe('routes', () => {
  let server: Server
  let base: string

  beforeEach(async () => {
    const middleware = createLogMiddleware(createLogger(dir, { now: fixed }))
    server = createServer((req, res) => middleware(req, res, () => res.end('next')))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })

  afterEach(async () => {
    await new Promise((r) => server.close(r))
  })

  test('the browser can report an error, and diagnostics can read it back', async () => {
    const res = await fetch(`${base}/api/log`, { method: 'POST', body: JSON.stringify({ level: 'error', message: 'Playground crashed', detail: 'stack…' }) })
    expect(res.status).toBe(204)
    const text = await (await fetch(`${base}/api/logs?tail=10`)).text()
    expect(JSON.parse(text)).toMatchObject({ level: 'error', message: '[browser] Playground crashed', detail: 'stack…' })
  })

  test('an oversized report is ignored', async () => {
    await fetch(`${base}/api/log`, { method: 'POST', body: JSON.stringify({ message: 'x'.repeat(70_000) }) })
    expect(await (await fetch(`${base}/api/logs`)).text()).toBe('')
  })
})
