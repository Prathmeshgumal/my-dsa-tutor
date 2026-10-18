// Dev-server API that stores the editor's files as real files in one folder on disk.
//   GET    /api/files               → [{ name, content }]
//   PUT    /api/files/:name         { content } → write (create or overwrite)
//   DELETE /api/files/:name         → delete (idempotent)
//   POST   /api/files/:name/rename  { to } → rename
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { languageFromFilename } from '../src/lib/languages.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const PREFIX = '/api/files'
const MAX_BODY_BYTES = 5 * 1024 * 1024

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Only plain, visible code files directly inside the folder — no paths, no traversal. */
function assertSafeName(name: string): void {
  const safe =
    name.length > 0 &&
    name.length <= 255 &&
    !/[/\\\0]/.test(name) &&
    !name.startsWith('.') &&
    path.basename(name) === name &&
    languageFromFilename(name) !== null
  if (!safe) throw new HttpError(400, `Invalid file name: ${JSON.stringify(name)}`)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'File too large')
    chunks.push(chunk as Buffer)
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof body === 'object' && body !== null) return body as Record<string, unknown>
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Expected a JSON object body')
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  )
}

async function listFiles(dir: string) {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir, { withFileTypes: true })
  const names = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && languageFromFilename(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
  return Promise.all(names.map(async (name) => ({ name, content: await readFile(path.join(dir, name), 'utf8') })))
}

async function handle(dir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rest = (req.url ?? '').split('?')[0].slice(PREFIX.length)
  const method = req.method ?? 'GET'

  if (rest === '' || rest === '/') {
    if (method !== 'GET') throw new HttpError(405, 'Method not allowed')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(await listFiles(dir)))
    return
  }

  const [encodedName, action, ...extra] = rest.slice(1).split('/')
  let name: string
  try {
    name = decodeURIComponent(encodedName)
  } catch {
    throw new HttpError(400, 'Malformed file name')
  }
  if (extra.length) throw new HttpError(404, 'Not found')
  assertSafeName(name)
  const file = path.join(dir, name)
  await mkdir(dir, { recursive: true })

  if (action === undefined && method === 'PUT') {
    const { content } = await readJson(req)
    if (typeof content !== 'string') throw new HttpError(400, '"content" must be a string')
    await writeFile(file, content, 'utf8')
  } else if (action === undefined && method === 'DELETE') {
    await rm(file, { force: true })
  } else if (action === 'rename' && method === 'POST') {
    const { to } = await readJson(req)
    if (typeof to !== 'string') throw new HttpError(400, '"to" must be a string')
    assertSafeName(to)
    const clash = (await readdir(dir)).find((n) => n.toLowerCase() === to.toLowerCase() && n !== name)
    if (clash) throw new HttpError(409, `${clash} already exists`)
    if (!(await exists(file))) throw new HttpError(404, `${name} not found`)
    await rename(file, path.join(dir, to))
  } else {
    throw new HttpError(405, 'Method not allowed')
  }
  res.statusCode = 204
  res.end()
}

export function createSolutionsMiddleware(dir: string): Middleware {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (url !== PREFIX && !url.startsWith(`${PREFIX}/`) && !url.startsWith(`${PREFIX}?`)) return next()
    handle(dir, req, res).catch((e: unknown) => {
      res.statusCode = e instanceof HttpError ? e.status : 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    })
  }
}
