// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createNotesMiddleware } from './solutionsApi'

let dir: string
let server: Server
let base: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'notes-'))
  const middleware = createNotesMiddleware(dir)
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418
      res.end('next')
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/notes`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  await rm(dir, { recursive: true, force: true })
})

test('stores markdown notes as .md files and lists only those', async () => {
  await writeFile(path.join(dir, 'main.cpp'), 'int main(){}')
  const res = await fetch(`${base}/note-1.md`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '# Graphs\n\n- BFS uses a queue' }),
  })
  expect(res.status).toBe(204)
  expect(await readFile(path.join(dir, 'note-1.md'), 'utf8')).toBe('# Graphs\n\n- BFS uses a queue')
  expect(await (await fetch(base)).json()).toEqual([{ name: 'note-1.md', content: '# Graphs\n\n- BFS uses a queue' }])
})

test('rejects anything that is not a plain .md name', async () => {
  for (const bad of ['main.cpp', '..%2Fescape.md', '.hidden.md']) {
    const res = await fetch(`${base}/${bad}`, { method: 'PUT', body: JSON.stringify({ content: 'x' }) })
    expect(res.status).toBe(400)
  }
})

test('deletes notes', async () => {
  await writeFile(path.join(dir, 'note-1.md'), 'x')
  expect((await fetch(`${base}/note-1.md`, { method: 'DELETE' })).status).toBe(204)
  expect(await (await fetch(base)).json()).toEqual([])
})

test('code-file URLs are left for the files API', async () => {
  expect((await fetch(base.replace('/api/notes', '/api/files'))).status).toBe(418)
})
