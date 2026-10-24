// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createAppServer, stopAppServer } from './app.ts'
import { loadConfig } from './config.ts'

let dir: string
let app: Server
let base: string
let piston: Server
const pistonSockets: Socket[] = []
let pistonHangs = false
const pistonRequests: import('node:http').IncomingMessage[] = []

/** Just enough of Piston: one HTTP route, and a WebSocket that answers "got it" to anything. */
async function startPiston() {
  piston = createServer((req, res) => {
    if (pistonHangs) {
      pistonRequests.push(req)
      return
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ path: req.url, method: req.method }))
  })
  piston.on('upgrade', (req, socket: Socket) => {
    pistonSockets.push(socket)
    if (pistonHangs) return
    const accept = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    socket.on('data', (frame: Buffer) => {
      // A close frame from the browser: hang up, as Piston does.
      if ((frame[0] & 0x0f) === 0x8) return socket.end()
      socket.write(Buffer.concat([Buffer.from([0x81, 6]), Buffer.from('got it')]))
    })
  })
  await new Promise<void>((r) => piston.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(piston.address() as { port: number }).port}`
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'app-'))
  const dist = path.join(dir, 'dist')
  await mkdir(path.join(dist, 'assets'), { recursive: true })
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>DSA Editor</title>')
  await writeFile(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)')
  await writeFile(path.join(dir, 'secret.txt'), 'not for the browser')
  const pistonUrl = await startPiston()
  const config = loadConfig({ env: { PISTON_URL: pistonUrl }, defaultDataDir: dir })
  app = createAppServer(config, { distDir: dist })
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(app.address() as { port: number }).port}`
})

afterEach(async () => {
  await stopAppServer(app)
  for (const s of pistonSockets) s.destroy()
  piston.closeAllConnections()
  await new Promise((r) => piston.close(r))
  pistonSockets.length = 0
  pistonHangs = false
  pistonRequests.length = 0
  await rm(dir, { recursive: true, force: true })
})

test('serves the page, and the page for any other address so reloads work', async () => {
  for (const url of ['/', '/problems/two-sum']) {
    const res = await fetch(base + url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toContain('DSA Editor')
  }
})

test('serves built files, cached for good since their names change with their content', async () => {
  const res = await fetch(`${base}/assets/index-abc123.js`)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  expect(await res.text()).toBe('console.log(1)')
  expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
})

test('never serves files outside the built page', async () => {
  for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
    const res = await fetch(base + url)
    expect(await res.text()).not.toContain('not for the browser')
  }
})

test('API routes are answered, and an unknown one is a 404, not the page', async () => {
  expect(await (await fetch(`${base}/api/files`)).json()).toEqual([])
  const res = await fetch(`${base}/api/nope`)
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'Not found' })
})

test('/piston is forwarded to Piston’s /api/v2', async () => {
  expect(await (await fetch(`${base}/piston/runtimes`)).json()).toEqual({ path: '/api/v2/runtimes', method: 'GET' })
  const res = await fetch(`${base}/piston/execute`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
  expect(await res.json()).toEqual({ path: '/api/v2/execute', method: 'POST' })
})

test('interactive runs reach Piston over a WebSocket, and closing it closes Piston’s side too', async () => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/piston/connect`)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  const reply = new Promise<string>((r) => (ws.onmessage = (e) => r(String(e.data))))
  ws.send('{"type":"init"}')
  expect(await reply).toBe('got it')
  const closed = new Promise((r) => pistonSockets[0].on('close', r))
  ws.close()
  await closed
})

test('a tab that disappears without a goodbye (closed, crashed) still closes Piston’s side', async () => {
  const socket = await new Promise<Socket>((r, j) => {
    const req = request(`${base}/piston/connect`, {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    })
    req.on('upgrade', (_res, s: Socket) => r(s))
    req.on('error', j)
    req.end()
  })
  // Piston hears the connection end (and then closes it).
  const closed = new Promise((r) => {
    pistonSockets[0].on('end', r)
    pistonSockets[0].on('close', r)
  })
  socket.destroy()
  await closed
})

test('stopping the server ends open interactive runs instead of waiting for them', async () => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/piston/connect`)
  await new Promise((r) => (ws.onopen = r))
  const closed = new Promise((r) => (ws.onclose = r))
  await stopAppServer(app)
  await closed
  app = createServer().listen(0) // so afterEach has something to stop
})

test('other websites and other addresses are refused, WebSockets included', async () => {
  const cross = await fetch(`${base}/piston/runtimes`, { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } })
  expect(cross.status).toBe(403)
  // A page on evil.example whose address was pointed at this computer (DNS rebinding).
  const status = await new Promise<number>((r) =>
    request(`${base}/api/files`, { headers: { Host: 'evil.example' } }, (res) => r(res.statusCode!)).end(),
  )
  expect(status).toBe(403)
  const upgrade = await new Promise<string>((r) => {
    const req = request(`${base}/piston/connect`, {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', Origin: 'https://evil.example' },
    })
    req.on('upgrade', () => r('upgraded'))
    req.on('response', (res) => r(`refused ${res.statusCode}`))
    req.on('error', () => r('refused'))
    req.end()
  })
  expect(upgrade).toMatch(/^refused/)
  expect(pistonSockets).toHaveLength(0)
})

test('if Piston is down, runs get a clear 502', async () => {
  piston.closeAllConnections()
  await new Promise((r) => piston.close(r))
  const res = await fetch(`${base}/piston/runtimes`)
  expect(res.status).toBe(502)
  expect(((await res.json()) as { error: string }).error).toMatch(/Piston/)
  piston.listen(0) // so afterEach can close it
})

/** Sends a WebSocket request by hand and then drops the connection abruptly, as a closed tab can. */
async function upgradeThenReset(headers: Record<string, string>, waitFor: () => boolean) {
  const { connect } = await import('node:net')
  const { port } = new URL(base)
  const client = connect(Number(port), '127.0.0.1')
  client.on('error', () => {})
  await new Promise((r) => client.once('connect', r))
  const lines = Object.entries({ Host: `127.0.0.1:${port}`, ...headers }).map(([k, v]) => `${k}: ${v}`)
  client.write(`GET /piston/connect HTTP/1.1\r\n${lines.join('\r\n')}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`)
  await vi.waitFor(() => expect(waitFor()).toBe(true))
  client.resetAndDestroy()
  await new Promise((r) => setTimeout(r, 50))
}

test('a tab that drops while Piston is still answering doesn’t take the server down', async () => {
  pistonHangs = true
  await upgradeThenReset({}, () => pistonSockets.length > 0)
  expect((await fetch(`${base}/`)).status).toBe(200)
})

test('a refused WebSocket that drops straight away doesn’t take the server down', async () => {
  await upgradeThenReset({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }, () => true)
  expect((await fetch(`${base}/`)).status).toBe(200)
})

test('a run the browser gives up on is dropped at Piston too, not left hanging', async () => {
  pistonHangs = true
  const stop = new AbortController()
  const res = fetch(`${base}/piston/execute`, { method: 'POST', body: '{}', signal: stop.signal }).catch(() => null)
  await vi.waitFor(() => expect(pistonRequests).toHaveLength(1))
  const closed = new Promise((r) => pistonRequests[0].socket.once('close', r))
  stop.abort()
  await res
  await closed
})
