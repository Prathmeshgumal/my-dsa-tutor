// What the editor remembers between visits (open tabs, chats, settings), saved as files so that clearing the
// browser, using another browser or changing the port loses nothing.
//   GET /api/state        → { settings, workspace, ai, problems }: each the JSON text saved, or null
//   PUT /api/state/:key   JSON body → saved as <state folder>/<key>.json
import { mkdir, readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { STATE_KEYS, type SavedState, type StateKey } from '@dsa/core/appState'
import { writeFileAtomic } from './atomicWrite.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const ROUTE = '/api/state'
/** Chats can hold pasted images, so this is generous. */
const MAX_BYTES = 50 * 1024 * 1024

const isKey = (k: string): k is StateKey => Object.hasOwn(STATE_KEYS, k)

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (body === undefined) return res.end()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** The body as text, or null if it's bigger than `max`. */
async function readText(req: IncomingMessage, max: number): Promise<string | null> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function createStateMiddleware(dir: string, { maxBytes = MAX_BYTES } = {}): Middleware {
  const file = (key: StateKey) => path.join(dir, `${key}.json`)

  const handle = async (req: IncomingMessage, res: ServerResponse, rest: string) => {
    if (rest === '' && req.method === 'GET') {
      const keys = Object.keys(STATE_KEYS) as StateKey[]
      const values = await Promise.all(keys.map((k) => readFile(file(k), 'utf8').catch(() => null)))
      return send(res, 200, Object.fromEntries(keys.map((k, i) => [k, values[i]])) as SavedState)
    }
    const key = rest.slice(1)
    if (!/^\/[a-z]+$/.test(rest) || !isKey(key)) return send(res, 404, { error: 'Not found' })
    if (req.method !== 'PUT') return send(res, 405, { error: 'Method not allowed' })
    const text = await readText(req, maxBytes)
    if (text === null) return send(res, 413, { error: 'Too large' })
    try {
      JSON.parse(text)
    } catch {
      return send(res, 400, { error: 'Expected JSON' })
    }
    await mkdir(dir, { recursive: true })
    await writeFileAtomic(file(key), text)
    send(res, 204)
  }

  return (req, res, next) => {
    const route = (req.url ?? '').split('?')[0]
    if (route !== ROUTE && !route.startsWith(`${ROUTE}/`)) return next()
    handle(req, res, route.slice(ROUTE.length)).catch((e: unknown) => send(res, 500, { error: e instanceof Error ? e.message : String(e) }))
  }
}
