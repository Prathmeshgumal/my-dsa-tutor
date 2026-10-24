// A small log file for when something goes wrong: server errors and errors the browser reports.
// One JSON object per line in <logs>/editor.log; at 1 MB it moves to editor.log.1 and starts again.
//   POST /api/log          { level, message, detail? } → the browser reports an error
//   GET  /api/logs?tail=n  → the last n lines (for "Copy diagnostics")
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

export type Level = 'error' | 'warn' | 'info'

const MAX_BYTES = 1024 * 1024
const MAX_FIELD = 4000

export interface Logger {
  log(level: Level, message: string, detail?: unknown): void
  /** The last `lines` lines of the log, oldest first. */
  tail(lines: number): Promise<string[]>
}

const cut = (text: string) => (text.length > MAX_FIELD ? `${text.slice(0, MAX_FIELD)}…` : text)

function describe(detail: unknown): string | undefined {
  if (detail === undefined) return undefined
  if (detail instanceof Error) return cut(detail.stack ?? detail.message)
  return cut(typeof detail === 'string' ? detail : JSON.stringify(detail))
}

export function createLogger(dir: string, { now = () => new Date() } = {}): Logger {
  const file = path.join(dir, 'editor.log')
  // Writes go one at a time, so lines never interleave and rotation never races a write.
  let queue = Promise.resolve()

  return {
    log(level, message, detail) {
      const line = JSON.stringify({ at: now().toISOString(), level, message: cut(message), ...(detail !== undefined ? { detail: describe(detail) } : {}) })
      queue = queue
        .then(async () => {
          await mkdir(dir, { recursive: true })
          const size = await stat(file).then(
            (s) => s.size,
            () => 0,
          )
          if (size > MAX_BYTES) await rename(file, `${file}.1`)
          await appendFile(file, `${line}\n`, 'utf8')
        })
        // Logging must never break the editor.
        .catch(() => {})
    },
    async tail(lines) {
      await queue
      const text = await readFile(file, 'utf8').catch(() => '')
      return text.split('\n').filter(Boolean).slice(-lines)
    },
  }
}

async function readSmallJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 64 * 1024) return null
    chunks.push(chunk as Buffer)
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function createLogMiddleware(logger: Logger): Middleware {
  return (req, res, next) => {
    const [route, query = ''] = (req.url ?? '').split('?')
    if (route === '/api/log' && req.method === 'POST') {
      void readSmallJson(req).then((body) => {
        const level = body?.level === 'warn' || body?.level === 'info' ? body.level : 'error'
        if (body && typeof body.message === 'string') logger.log(level, `[browser] ${body.message}`, body.detail)
        res.statusCode = 204
        res.end()
      })
      return
    }
    if (route === '/api/logs' && req.method === 'GET') {
      const n = Math.min(500, Math.max(1, Number(new URLSearchParams(query).get('tail')) || 100))
      void logger.tail(n).then((lines) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(lines.join('\n'))
      })
      return
    }
    next()
  }
}
