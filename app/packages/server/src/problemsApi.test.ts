// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Problem, ProblemEntry } from '@dsa/core/problems'
import { createProblemsMiddleware } from './problemsApi.ts'
import { createProblem } from './problemStore.ts'

let dir: string
let server: Server
let base: string

const problem = (title: string, createdAt = 1): Problem => ({
  title,
  difficulty: 'easy',
  description: 'Find two numbers.',
  params: [{ name: 'nums', type: 'vector<int>' }],
  compare: 'exact',
  tests: [{ input: ['[1,2]'], expected: '3', example: true, addedBy: 'problem' }],
  createdAt,
})

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'problems-'))
  const middleware = createProblemsMiddleware(dir)
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 418
      res.end('next')
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/problems`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  await rm(dir, { recursive: true, force: true })
})

const send = (url: string, method: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('lists problems newest first with their code and driver', async () => {
  await createProblem(dir, { problem: problem('Two Sum', 1), solution: 'class Solution {};', driver: 'int main(){}' })
  await createProblem(dir, { problem: problem('Two Sum', 2), solution: '', driver: '' })
  const entries = (await (await fetch(base)).json()) as ProblemEntry[]
  expect(entries.map((e: { slug: string }) => e.slug)).toEqual(['two-sum-2', 'two-sum'])
  expect(entries[1]).toMatchObject({ solution: 'class Solution {};', driver: 'int main(){}', solved: false, attempts: 0 })
})

test('saves the solution', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  expect((await send(`${base}/${slug}/solution`, 'PUT', { content: 'new code' })).status).toBe(204)
  expect(await readFile(path.join(dir, slug, 'solution.cpp'), 'utf8')).toBe('new code')
})

test('replaces the test cases', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  const tests = [{ input: ['[5]'], expected: '5', example: false, addedBy: 'user' }]
  expect((await send(`${base}/${slug}/tests`, 'PUT', { tests })).status).toBe(204)
  const saved = JSON.parse(await readFile(path.join(dir, slug, 'problem.json'), 'utf8'))
  expect(saved.tests).toEqual(tests)
  expect(saved.title).toBe('Two Sum')
})

test('a fully passing attempt marks the problem solved, and stays solved', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  const attempt = (passed: number) => ({ code: 'x', passed, total: 2, statusText: '', results: [] })
  await send(`${base}/${slug}/attempts`, 'POST', { attempt: attempt(2) })
  await new Promise((r) => setTimeout(r, 5))
  await send(`${base}/${slug}/attempts`, 'POST', { attempt: attempt(1) })
  const attempts = (await (await fetch(`${base}/${slug}/attempts`)).json()) as { passed: number }[]
  expect(attempts.map((a: { passed: number }) => a.passed)).toEqual([1, 2])
  const [entry] = (await (await fetch(base)).json()) as ProblemEntry[]
  expect(entry).toMatchObject({ solved: true, attempts: 2 })
})

test('deletes a problem', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  expect((await fetch(`${base}/${slug}`, { method: 'DELETE' })).status).toBe(204)
  expect(await readdir(dir)).toEqual([])
})

test('rejects bad names and unknown problems', async () => {
  expect((await send(`${base}/..%2Fx/solution`, 'PUT', { content: '' })).status).toBe(404)
  expect((await send(`${base}/missing/solution`, 'PUT', { content: '' })).status).toBe(404)
  expect((await send(`${base}/missing/tests`, 'PUT', { tests: 'no' })).status).toBe(400)
})

test('leaves other routes alone', async () => {
  expect((await fetch(base.replace('problems', 'files'))).status).toBe(418)
})

test('saves and deletes other versions of the code, but never solution.cpp', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: 'main', driver: '' })
  expect((await send(`${base}/${slug}/files/brute-force.cpp`, 'PUT', { content: 'brute' })).status).toBe(204)
  const [entry] = (await (await fetch(base)).json()) as ProblemEntry[]
  expect(entry.versions).toEqual([{ name: 'brute-force.cpp', content: 'brute' }])
  expect(entry.solution).toBe('main')
  expect((await fetch(`${base}/${slug}/files/solution.cpp`, { method: 'DELETE' })).status).toBe(400)
  expect((await fetch(`${base}/${slug}/files/driver.cpp`, { method: 'DELETE' })).status).toBe(400)
  expect((await send(`${base}/${slug}/files/..%2Fx.cpp`, 'PUT', { content: '' })).status).toBe(400)
  expect((await fetch(`${base}/${slug}/files/brute-force.cpp`, { method: 'DELETE' })).status).toBe(204)
  expect(((await (await fetch(base)).json()) as ProblemEntry[])[0].versions).toEqual([])
})

test('stores which notes belong to a problem', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  expect((await send(`${base}/${slug}/notes`, 'PUT', { notes: ['note-1.md', 'note-1.md', 'note-3.md'] })).status).toBe(204)
  const [entry] = (await (await fetch(base)).json()) as ProblemEntry[]
  expect(entry.problem.notes).toEqual(['note-1.md', 'note-3.md'])
})

test('a problem saved by a newer editor is never overwritten, and says why', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  const file = path.join(dir, slug, 'problem.json')
  const future = JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), formatVersion: 99 })
  await writeFile(file, future)
  const res = await send(`${base}/${slug}/tests`, 'PUT', { tests: [] })
  expect(res.status).toBe(404)
  expect(((await res.json()) as { error: string }).error).toBe('"two-sum" was saved by a newer version of the editor. Update the editor to open it.')
  expect(await readFile(file, 'utf8')).toBe(future)
})

test('lists the problems a newer editor saved, which the list leaves out', async () => {
  const slug = await createProblem(dir, { problem: problem('Two Sum'), solution: '', driver: '' })
  await createProblem(dir, { problem: problem('Three Sum'), solution: '', driver: '' })
  const file = path.join(dir, slug, 'problem.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), formatVersion: 99 }))
  expect(((await (await fetch(base)).json()) as ProblemEntry[]).map((e: { slug: string }) => e.slug)).toEqual(['three-sum'])
  expect(await (await fetch(`${base}/_newer`)).json()).toEqual(['two-sum'])
})
