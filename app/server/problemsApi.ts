// Dev-server API for practice problems (see ./problemStore.ts for the folder layout).
//   GET    /api/problems                    → ProblemEntry[]
//   GET    /api/problems/_newer             → slugs of problems a newer editor saved (left out of the list)
//   PUT    /api/problems/:slug/solution     { content } → save the student's code
//   PUT    /api/problems/:slug/files/:name  { content } → save another version of the code (e.g. brute-force.cpp)
//   DELETE /api/problems/:slug/files/:name  → delete a version (not solution.cpp)
//   PUT    /api/problems/:slug/notes        { notes } → which notes (file names in notes/) belong to it
//   PUT    /api/problems/:slug/tests        { tests } → replace the test cases
//   GET    /api/problems/:slug/attempts     → Attempt[] (newest first)
//   POST   /api/problems/:slug/attempts     { attempt } → save a Submit
//   DELETE /api/problems/:slug              → delete the problem and its attempts
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Attempt, TestCase } from '../src/lib/problems.ts'
import {
  BadName,
  deleteCode,
  deleteProblem,
  listAttempts,
  listEntries,
  listNewer,
  ProblemNotFound,
  saveAttempt,
  writeCode,
  writeNoteLinks,
  writeSolution,
  writeTests,
} from './problemStore.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const PREFIX = '/api/problems'
const MAX_BODY_BYTES = 5 * 1024 * 1024

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Too large')
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

const isString = (v: unknown): v is string => typeof v === 'string'

function parseTests(raw: unknown): TestCase[] {
  if (!Array.isArray(raw)) throw new HttpError(400, '"tests" must be a list')
  return raw.map((t: Record<string, unknown>) => {
    if (!t || !Array.isArray(t.input) || !t.input.every(isString) || !isString(t.expected)) {
      throw new HttpError(400, 'Each test needs "input" (list of strings) and "expected"')
    }
    const addedBy = t.addedBy === 'user' || t.addedBy === 'claude' ? t.addedBy : 'problem'
    return { input: t.input, expected: t.expected, example: t.example === true, addedBy }
  })
}

function parseAttempt(raw: unknown): Attempt {
  const a = raw as Record<string, unknown> | null
  if (!a || !isString(a.code) || typeof a.passed !== 'number' || typeof a.total !== 'number' || !Array.isArray(a.results)) {
    throw new HttpError(400, '"attempt" needs code, passed, total and results')
  }
  return {
    at: Date.now(),
    ...(isString(a.file) ? { file: a.file } : {}),
    code: a.code,
    passed: a.passed,
    total: a.total,
    statusText: isString(a.statusText) ? a.statusText : '',
    results: a.results as Attempt['results'],
  }
}

function json(res: ServerResponse, body: unknown) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handle(dir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rest = (req.url ?? '').split('?')[0].slice(PREFIX.length)
  const method = req.method ?? 'GET'

  if (rest === '' || rest === '/') {
    if (method !== 'GET') throw new HttpError(405, 'Method not allowed')
    return json(res, await listEntries(dir))
  }
  if (rest === '/_newer' && method === 'GET') return json(res, await listNewer(dir))

  const [slug, action, ...extra] = rest.slice(1).split('/')
  if (action === 'files' && extra.length === 1) {
    const name = decodeURIComponent(extra[0])
    if (method === 'PUT') {
      const { content } = await readJson(req)
      if (!isString(content)) throw new HttpError(400, '"content" must be a string')
      await writeCode(dir, slug, name, content)
    } else if (method === 'DELETE') await deleteCode(dir, slug, name)
    else throw new HttpError(405, 'Method not allowed')
    res.statusCode = 204
    res.end()
    return
  }
  if (extra.length) throw new HttpError(404, 'Not found')

  if (action === undefined && method === 'DELETE') await deleteProblem(dir, slug)
  else if (action === 'notes' && method === 'PUT') {
    const { notes } = await readJson(req)
    if (!Array.isArray(notes) || !notes.every(isString)) throw new HttpError(400, '"notes" must be a list of note names')
    await writeNoteLinks(dir, slug, notes)
  }
  else if (action === 'solution' && method === 'PUT') {
    const { content } = await readJson(req)
    if (!isString(content)) throw new HttpError(400, '"content" must be a string')
    await writeSolution(dir, slug, content)
  } else if (action === 'tests' && method === 'PUT') {
    await writeTests(dir, slug, parseTests((await readJson(req)).tests))
  } else if (action === 'attempts' && method === 'GET') {
    return json(res, await listAttempts(dir, slug))
  } else if (action === 'attempts' && method === 'POST') {
    await saveAttempt(dir, slug, parseAttempt((await readJson(req)).attempt))
  } else {
    throw new HttpError(405, 'Method not allowed')
  }
  res.statusCode = 204
  res.end()
}

export function createProblemsMiddleware(dir: string): Middleware {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (url !== PREFIX && !url.startsWith(`${PREFIX}/`) && !url.startsWith(`${PREFIX}?`)) return next()
    handle(dir, req, res).catch((e: unknown) => {
      res.statusCode = e instanceof HttpError ? e.status : e instanceof ProblemNotFound ? 404 : e instanceof BadName ? 400 : 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    })
  }
}
