// Dev-server API that stores files as real files in one folder on disk.
// Code files live under /api/files (solutions folder), markdown notes under /api/notes (notes folder).
//   GET    /api/files               → [{ name, content }]
//   PUT    /api/files/:name         { content } → write (create or overwrite)
//   DELETE /api/files/:name         → delete (idempotent)
//   POST   /api/files/:name/rename  { to } → rename
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { languageFromFilename } from '@dsa/core/languages'
import { writeFileAtomic } from './atomicWrite.ts'
import { noteOwnChange } from './ownChanges.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const MAX_BODY_BYTES = 5 * 1024 * 1024

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Store {
  dir: string
  prefix: string
  /** Which file names this store holds (e.g. code files, or .md notes). */
  allows(name: string): boolean
}

/** Only plain, visible files of the store's kind directly inside the folder — no paths, no traversal. */
function assertSafeName(store: Store, name: string): void {
  const safe =
    name.length > 0 &&
    name.length <= 255 &&
    !/[/\\\0]/.test(name) &&
    !name.startsWith('.') &&
    path.basename(name) === name &&
    store.allows(name)
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

async function listFiles({ dir, allows }: Store) {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir, { withFileTypes: true })
  const names = entries
    .filter((e) => e.isFile() && !e.name.startsWith('.') && allows(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))
  return Promise.all(names.map(async (name) => ({ name, content: await readFile(path.join(dir, name), 'utf8') })))
}

async function handle(store: Store, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { dir } = store
  const rest = (req.url ?? '').split('?')[0].slice(store.prefix.length)
  const method = req.method ?? 'GET'

  if (rest === '' || rest === '/') {
    if (method !== 'GET') throw new HttpError(405, 'Method not allowed')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(await listFiles(store)))
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
  assertSafeName(store, name)
  const file = path.join(dir, name)
  await mkdir(dir, { recursive: true })

  if (action === undefined && method === 'PUT') {
    const { content } = await readJson(req)
    if (typeof content !== 'string') throw new HttpError(400, '"content" must be a string')
    await writeFileAtomic(file, content)
  } else if (action === undefined && method === 'DELETE') {
    noteOwnChange(file)
    await rm(file, { force: true })
  } else if (action === 'rename' && method === 'POST') {
    const { to } = await readJson(req)
    if (typeof to !== 'string') throw new HttpError(400, '"to" must be a string')
    assertSafeName(store, to)
    const clash = (await readdir(dir)).find((n) => n.toLowerCase() === to.toLowerCase() && n !== name)
    if (clash) throw new HttpError(409, `${clash} already exists`)
    if (!(await exists(file))) throw new HttpError(404, `${name} not found`)
    noteOwnChange(file)
    noteOwnChange(path.join(dir, to))
    await rename(file, path.join(dir, to))
  } else {
    throw new HttpError(405, 'Method not allowed')
  }
  res.statusCode = 204
  res.end()
}

function createStoreMiddleware(store: Store): Middleware {
  const { prefix } = store
  return (req, res, next) => {
    const url = req.url ?? ''
    if (url !== prefix && !url.startsWith(`${prefix}/`) && !url.startsWith(`${prefix}?`)) return next()
    handle(store, req, res).catch((e: unknown) => {
      res.statusCode = e instanceof HttpError ? e.status : 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    })
  }
}

export function createSolutionsMiddleware(dir: string): Middleware {
  return createStoreMiddleware({ dir, prefix: '/api/files', allows: (name) => languageFromFilename(name) !== null })
}

/** Saved dry runs for the Playground, one JSON file each. */
export function createPlaygroundMiddleware(dir: string): Middleware {
  return createStoreMiddleware({ dir, prefix: '/api/playground', allows: (name) => /^[\w-]+\.json$/.test(name) })
}

export function createNotesMiddleware(dir: string): Middleware {
  return createStoreMiddleware({ dir, prefix: '/api/notes', allows: (name) => /\.md$/i.test(name) })
}
