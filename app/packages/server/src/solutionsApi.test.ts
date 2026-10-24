// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSolutionsMiddleware } from './solutionsApi.ts'

let dir: string
let server: Server
let base: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'solutions-'))
  const middleware = createSolutionsMiddleware(dir)
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418
      res.end('next')
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address() as { port: number }
  base = `http://127.0.0.1:${addr.port}/api/files`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  await rm(dir, { recursive: true, force: true })
})

const put = (name: string, content: string) =>
  fetch(`${base}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })

test('GET lists code files with content, sorted, ignoring other files', async () => {
  await writeFile(path.join(dir, 'b.py'), 'print(1)')
  await writeFile(path.join(dir, 'a.cpp'), 'int main(){}')
  await writeFile(path.join(dir, 'notes.txt'), 'x')
  const res = await fetch(base)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual([
    { name: 'a.cpp', content: 'int main(){}' },
    { name: 'b.py', content: 'print(1)' },
  ])
})

test('GET creates the folder if it does not exist yet', async () => {
  await rm(dir, { recursive: true })
  const res = await fetch(base)
  expect(await res.json()).toEqual([])
  expect(await readdir(dir)).toEqual([])
})

test('PUT writes the file (unicode intact)', async () => {
  const res = await put('two sum.cpp', '// é → ✓\n')
  expect(res.status).toBe(204)
  expect(await readFile(path.join(dir, 'two sum.cpp'), 'utf8')).toBe('// é → ✓\n')
})

test('DELETE removes the file and is idempotent', async () => {
  await writeFile(path.join(dir, 'a.cpp'), '')
  expect((await fetch(`${base}/a.cpp`, { method: 'DELETE' })).status).toBe(204)
  expect(await readdir(dir)).toEqual([])
  expect((await fetch(`${base}/a.cpp`, { method: 'DELETE' })).status).toBe(204)
})

test('rename moves the file', async () => {
  await writeFile(path.join(dir, 'a.cpp'), 'x')
  const res = await fetch(`${base}/a.cpp/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'b.cpp' }),
  })
  expect(res.status).toBe(204)
  expect(await readdir(dir)).toEqual(['b.cpp'])
})

test('rename onto another existing file → 409, nothing changes', async () => {
  await writeFile(path.join(dir, 'a.cpp'), 'a')
  await writeFile(path.join(dir, 'b.cpp'), 'b')
  const res = await fetch(`${base}/a.cpp/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'B.CPP' }),
  })
  expect(res.status).toBe(409)
  expect((await readdir(dir)).sort()).toEqual(['a.cpp', 'b.cpp'])
})

test('rename changing only case is allowed', async () => {
  await writeFile(path.join(dir, 'main.cpp'), 'x')
  const res = await fetch(`${base}/main.cpp/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'Main.cpp' }),
  })
  expect(res.status).toBe(204)
  expect(await readdir(dir)).toEqual(['Main.cpp'])
})

test.each(['..%2Fescape.cpp', '%2E%2E%2F%2E%2E%2Fetc.cpp', '.hidden.cpp', 'notes.txt', 'a%5Cb.cpp', 'a%00.cpp'])(
  'unsafe or unsupported name %s → 400 and nothing written outside the folder',
  async (encoded) => {
    const res = await fetch(`${base}/${encoded}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    })
    expect(res.status).toBe(400)
    expect(await readdir(dir)).toEqual([])
    await expect(readdir(path.dirname(dir))).resolves.not.toContain('escape.cpp')
  },
)

test('rename to an unsafe name → 400', async () => {
  await writeFile(path.join(dir, 'a.cpp'), 'x')
  const res = await fetch(`${base}/a.cpp/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: '../a.cpp' }),
  })
  expect(res.status).toBe(400)
  expect(await readdir(dir)).toEqual(['a.cpp'])
})

test('PUT with a non-string content → 400', async () => {
  const res = await fetch(`${base}/a.cpp`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 5 }),
  })
  expect(res.status).toBe(400)
})

test('other URLs fall through to the next middleware', async () => {
  const res = await fetch(base.replace('/api/files', '/somewhere'))
  expect(res.status).toBe(418)
})
