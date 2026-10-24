// Starts the editor for the browser tests (playwright.config.ts runs this): a fresh data folder with a few
// files, a pretend Piston, and the real server from packages/server/src/app.ts. Nothing touches your own data or Docker.
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'
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

// Interactive runs (Piston's WebSocket API), whatever the code: asks for a name, then greets it.
const frame = (message: object) => {
  const body = Buffer.from(JSON.stringify(message))
  const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 0xff])
  return Buffer.concat([head, body])
}
/** The browser's frames are small, masked text frames. */
function readFrame(data: Buffer): { op: number; text: string } {
  let len = data[1] & 0x7f
  let at = 2
  if (len === 126) {
    len = data.readUInt16BE(2)
    at = 4
  }
  const mask = data.subarray(at, at + 4)
  const body = Buffer.from(data.subarray(at + 4, at + 4 + len).map((b, i) => b ^ mask[i % 4]))
  return { op: data[0] & 0x0f, text: body.toString() }
}
piston.on('upgrade', (req, socket: Duplex) => {
  const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  socket.on('error', () => {})
  socket.on('data', (data: Buffer) => {
    const { op, text } = readFrame(data)
    if (op === 0x8) return socket.end()
    const m = JSON.parse(text) as { type: string; data?: string }
    if (m.type === 'init') {
      socket.write(frame({ type: 'stage', stage: 'run' }))
      socket.write(frame({ type: 'data', stream: 'stdout', data: 'Name? ' }))
    } else if (m.type === 'data') {
      socket.write(frame({ type: 'data', stream: 'stdout', data: `hi ${m.data?.trim()}\n` }))
      socket.write(frame({ type: 'exit', stage: 'run', code: 0, signal: null }))
    }
  })
})
piston.listen(0, '127.0.0.1', () => {
  const { port } = piston.address() as { port: number }
  const config = loadConfig({ env: { DATA_DIR, PORT: String(E2E_PORT), PISTON_URL: `http://127.0.0.1:${port}` }, defaultDataDir: DATA_DIR })
  const app = createAppServer(config, { distDir: path.resolve(import.meta.dirname, '../packages/web/dist') })
  app.listen(config.port, '127.0.0.1', () => console.log(`Browser-test editor at http://localhost:${config.port}`))
})
