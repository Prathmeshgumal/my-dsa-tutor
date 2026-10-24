// The editor as a real app: the API routes (./routes.ts), the built page from dist/, and /piston forwarded to
// Piston, all on one plain Node server. `npm start` runs it (./main.ts); `npm run dev` uses Vite instead.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import path from 'node:path'
import type { Config } from './config.ts'
import type { Logger } from './log.ts'
import { createRoutes } from './routes.ts'
import { fromAnotherSite } from './sameSite.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Only addresses that can't belong to someone else's website: localhost names and plain IP addresses. A page on
 * evil.example whose name was pointed at this computer (DNS rebinding) sends Host: evil.example and is refused.
 */
export function isAllowedHost(host: string | undefined): boolean {
  if (!host) return false
  let name: string
  try {
    name = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  return (
    name === 'localhost' ||
    name.endsWith('.localhost') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(name) ||
    name.startsWith('[') // IPv6
  )
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** A file inside dist/, or null for anything that would leave it. */
function insideDist(distDir: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const file = path.resolve(distDir, `.${path.posix.normalize(`/${decoded}`)}`)
  return file === distDir || file.startsWith(distDir + path.sep) ? file : null
}

async function serveFile(res: ServerResponse, file: string, cache: string): Promise<boolean> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return false
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
  res.setHeader('Content-Length', info.size)
  res.setHeader('Cache-Control', cache)
  createReadStream(file).pipe(res)
  return true
}

/** The built page: real files as they are, and index.html for any other address so reloading a page works. */
async function servePage(distDir: string, req: IncomingMessage, res: ServerResponse) {
  const urlPath = (req.url ?? '/').split('?')[0]
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' })
  const file = insideDist(distDir, urlPath)
  if (!file) return sendJson(res, 404, { error: 'Not found' })
  // Built files have their content's hash in their name, so they never change and can be kept forever.
  const hashed = urlPath.startsWith('/assets/')
  if (await serveFile(res, file, hashed ? 'public, max-age=31536000, immutable' : 'no-cache')) return
  if (hashed || path.extname(urlPath)) return sendJson(res, 404, { error: 'Not found' })
  if (!(await serveFile(res, path.join(distDir, 'index.html'), 'no-cache'))) {
    sendJson(res, 503, { error: 'The page isn’t built yet. Run npm run build.' })
  }
}

const pistonTarget = (pistonUrl: string, url: string) => new URL(url.replace(/^\/piston/, '/api/v2'), pistonUrl)

function forwardToPiston(pistonUrl: string, req: IncomingMessage, res: ServerResponse) {
  const target = pistonTarget(pistonUrl, req.url ?? '/')
  const outgoing = request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(res)
  })
  outgoing.on('error', () => {
    if (!res.headersSent) sendJson(res, 502, { error: 'Couldn’t reach Piston. Is it running? (docker compose up -d)' })
    else res.destroy()
  })
  req.pipe(outgoing)
}

/** Interactive runs: the browser's WebSocket is joined straight to Piston's, so closing one closes the other. */
function forwardUpgrade(pistonUrl: string, req: IncomingMessage, socket: Duplex, head: Buffer, open: Set<Duplex>) {
  const target = pistonTarget(pistonUrl, req.url ?? '/')
  const outgoing = request(target, { method: 'GET', headers: { ...req.headers, host: target.host } })
  outgoing.on('upgrade', (answer, pistonSocket, pistonHead) => {
    const lines = [`HTTP/1.1 101 ${answer.statusMessage ?? 'Switching Protocols'}`]
    for (let i = 0; i < answer.rawHeaders.length; i += 2) lines.push(`${answer.rawHeaders[i]}: ${answer.rawHeaders[i + 1]}`)
    socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (pistonHead.length) socket.write(pistonHead)
    if (head.length) pistonSocket.write(head)
    pistonSocket.pipe(socket).pipe(pistonSocket)
    open.add(socket)
    const closeBoth = () => {
      open.delete(socket)
      socket.destroy()
      pistonSocket.destroy()
    }
    socket.on('close', closeBoth)
    socket.on('error', closeBoth)
    pistonSocket.on('close', closeBoth)
    pistonSocket.on('error', closeBoth)
  })
  outgoing.on('response', (answer) => {
    socket.end(`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}\r\nConnection: close\r\n\r\n`)
  })
  outgoing.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'))
  outgoing.end()
}

/** WebSockets each server has open: the server stops tracking a connection once it's upgraded. */
const upgraded = new WeakMap<Server, Set<Duplex>>()

/** Stops the server now: open requests and interactive runs are ended rather than waited for. */
export async function stopAppServer(server: Server): Promise<void> {
  const closed = new Promise<void>((r) => server.close(() => r()))
  server.closeAllConnections()
  for (const socket of upgraded.get(server) ?? []) socket.destroy()
  await closed
}

export function createAppServer(config: Config, { distDir, logger }: { distDir: string; logger?: Logger }): Server {
  const { handle } = createRoutes(config, { logger })
  const server = createServer((req, res) => {
    if (!isAllowedHost(req.headers.host)) return sendJson(res, 403, { error: 'Blocked: open the editor at localhost.' })
    handle(req, res, () => {
      const urlPath = (req.url ?? '').split('?')[0]
      if (/^\/piston(\/|$)/.test(urlPath)) return forwardToPiston(config.pistonUrl, req, res)
      if (/^\/api(\/|$)/.test(urlPath)) return sendJson(res, 404, { error: 'Not found' })
      void servePage(path.resolve(distDir), req, res)
    })
  })
  const open = new Set<Duplex>()
  upgraded.set(server, open)
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const allowed = isAllowedHost(req.headers.host) && !fromAnotherSite(req) && /^\/piston(\/|$)/.test(req.url ?? '')
    if (!allowed) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    forwardUpgrade(config.pistonUrl, req, socket, head, open)
  })
  return server
}
