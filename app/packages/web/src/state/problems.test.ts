import { CASE_MARK, RESULT_MARK } from '@dsa/core/cppHarness'
import type { ProblemEntry } from '@dsa/core/problems'
import type { CodeRunner, RunResult } from '@dsa/core/runner/types'
import { configureProblems, useProblems } from './problems'
import { useSettings } from './settings'

const entry = (slug: string, extra: Partial<ProblemEntry> = {}): ProblemEntry => ({
  slug,
  problem: {
    title: slug,
    difficulty: 'easy',
    description: '',
    params: [{ name: 'n', type: 'int' }],
    compare: 'exact',
    tests: [
      { input: ['1'], expected: '1', example: true, addedBy: 'problem' },
      { input: ['2'], expected: '2', example: false, addedBy: 'problem' },
    ],
    createdAt: 1,
  },
  solution: 'class Solution {};',
  versions: [],
  driver: 'int main(){}',
  solved: false,
  attempts: 0,
  ...extra,
})

let calls: { url: string; method: string; body: unknown }[]
let server: ProblemEntry[]

function fakeFetch(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
  if (url === '/api/problems') return Promise.resolve(json(server))
  if (url.endsWith('/attempts') && method === 'GET') return Promise.resolve(json([]))
  return Promise.resolve(new Response(null, { status: 204 }))
}

const runnerReturning = (stdout: string): CodeRunner => ({
  run: async (): Promise<RunResult> => ({
    status: 'success',
    statusText: 'Accepted',
    stdout,
    stderr: '',
    compileOutput: '',
    timeMs: 3,
    memoryKb: 1,
  }),
})
const out = (...answers: string[]) => answers.map((a) => `\n${RESULT_MARK}\n${a}\n${CASE_MARK}\n`).join('')

beforeEach(() => {
  calls = []
  server = [entry('two-sum'), entry('three-sum')]
  configureProblems({ fetchImpl: fakeFetch as typeof fetch, delayMs: 10 })
  useProblems.setState({ entries: [], activeSlug: null, testRun: null, testError: null, testing: null, attempts: [], saveStatus: 'saved' })
})

test('load picks the first problem and open switches to the Problem screen', async () => {
  await useProblems.getState().load()
  expect(useProblems.getState().activeSlug).toBe('two-sum')
  await useProblems.getState().open('three-sum')
  expect(useProblems.getState().activeSlug).toBe('three-sum')
  expect(useSettings.getState().screen).toBe('problem')
})

test('typing saves the solution after a pause', async () => {
  await useProblems.getState().load()
  useProblems.getState().editSolution('new code')
  expect(useProblems.getState().saveStatus).toBe('pending')
  await vi.waitFor(() => expect(useProblems.getState().saveStatus).toBe('saved'))
  expect(calls.at(-1)).toEqual({ url: '/api/problems/two-sum/files/solution.cpp', method: 'PUT', body: { content: 'new code' } })
})

test('a reload while typing keeps the unsaved code', async () => {
  await useProblems.getState().load()
  useProblems.getState().editSolution('half typed')
  await useProblems.getState().load()
  expect(useProblems.getState().entries[0].solution).toBe('half typed')
})

test('Run checks the examples and saves nothing', async () => {
  await useProblems.getState().load()
  await useProblems.getState().test('run', runnerReturning(out('1')))
  expect(useProblems.getState().testRun).toMatchObject({ kind: 'run', cases: [0], passed: 1, total: 1 })
  expect(calls.some((c) => c.method === 'POST')).toBe(false)
})

test('Submit checks every case, saves an attempt, and marks it solved when all pass', async () => {
  await useProblems.getState().load()
  await useProblems.getState().test('submit', runnerReturning(out('1', '2')))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.url).toBe('/api/problems/two-sum/attempts')
  expect(post.body).toMatchObject({ attempt: { code: 'class Solution {};', passed: 2, total: 2, statusText: 'Accepted' } })
  expect(useProblems.getState().entries[0]).toMatchObject({ solved: true, attempts: 1 })
})

test('a failing Submit does not mark it solved', async () => {
  await useProblems.getState().load()
  await useProblems.getState().test('submit', runnerReturning(out('1', '9')))
  expect(useProblems.getState().entries[0]).toMatchObject({ solved: false, attempts: 1 })
  expect(useProblems.getState().testRun?.statusText).toBe('Wrong Answer')
})

test('you can add and remove your own cases, but not the problem’s', async () => {
  await useProblems.getState().load()
  await useProblems.getState().addCase({ input: ['5'], expected: '5' })
  const tests = () => useProblems.getState().entries[0].problem.tests
  expect(tests()[2]).toEqual({ input: ['5'], expected: '5', example: false, addedBy: 'user' })
  expect(calls.at(-1)).toMatchObject({ url: '/api/problems/two-sum/tests', method: 'PUT' })
  await useProblems.getState().removeCase(0)
  expect(tests()).toHaveLength(3)
  await useProblems.getState().removeCase(2)
  expect(tests()).toHaveLength(2)
})

test('deleting the open problem moves to the next one', async () => {
  await useProblems.getState().load()
  await useProblems.getState().remove('two-sum')
  expect(calls).toContainEqual({ url: '/api/problems/two-sum', method: 'DELETE', body: undefined })
  expect(useProblems.getState().activeSlug).toBe('three-sum')
})

test('a new version copies the open code, opens it, and edits save to it', async () => {
  await useProblems.getState().load()
  await useProblems.getState().newVersion()
  expect(useProblems.getState().activeFile).toBe('solution-2.cpp')
  expect(calls.at(-1)).toEqual({ url: '/api/problems/two-sum/files/solution-2.cpp', method: 'PUT', body: { content: 'class Solution {};' } })
  useProblems.getState().editSolution('brute force')
  await useProblems.getState().flush()
  expect(calls.at(-1)).toMatchObject({ url: '/api/problems/two-sum/files/solution-2.cpp', body: { content: 'brute force' } })
  expect(useProblems.getState().entries[0]).toMatchObject({ solution: 'class Solution {};', versions: [{ name: 'solution-2.cpp', content: 'brute force' }] })
})

test('Submit tests the open version and records which file it was', async () => {
  server = [entry('two-sum', { versions: [{ name: 'brute.cpp', content: 'brute code' }] })]
  await useProblems.getState().load()
  await useProblems.getState().selectFile('brute.cpp')
  let source = ''
  const runner: CodeRunner = {
    async run(req) {
      source = req.source
      return runnerReturning(out('1', '2')).run(req)
    },
  }
  await useProblems.getState().test('submit', runner)
  expect(source).toContain('brute code')
  expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ attempt: { file: 'brute.cpp', code: 'brute code' } })
})

test('deleting the open version goes back to solution.cpp; solution.cpp cannot be deleted', async () => {
  server = [entry('two-sum', { versions: [{ name: 'brute.cpp', content: 'x' }] })]
  await useProblems.getState().load()
  await useProblems.getState().selectFile('brute.cpp')
  await useProblems.getState().deleteVersion('brute.cpp')
  expect(useProblems.getState().activeFile).toBe('solution.cpp')
  expect(useProblems.getState().entries[0].versions).toEqual([])
  await useProblems.getState().deleteVersion('solution.cpp')
  expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
})

test('notes can be linked to and unlinked from the open problem', async () => {
  await useProblems.getState().load()
  await useProblems.getState().linkNote('note-1.md')
  await useProblems.getState().linkNote('note-1.md')
  expect(useProblems.getState().entries[0].problem.notes).toEqual(['note-1.md'])
  expect(calls.at(-1)).toEqual({ url: '/api/problems/two-sum/notes', method: 'PUT', body: { notes: ['note-1.md'] } })
  await useProblems.getState().unlinkNote('note-1.md')
  expect(useProblems.getState().entries[0].problem.notes).toEqual([])
})

test('Reset puts the open file back to the starting code and saves it', async () => {
  const problem = { ...entry('two-sum').problem, starter: 'class Solution {\npublic:\n};' }
  server = [entry('two-sum', { problem, solution: 'my attempt', versions: [{ name: 'brute.cpp', content: 'brute code' }] })]
  await useProblems.getState().load()
  await useProblems.getState().selectFile('brute.cpp')
  await useProblems.getState().resetCode()
  expect(calls.at(-1)).toEqual({ url: '/api/problems/two-sum/files/brute.cpp', method: 'PUT', body: { content: 'class Solution {\npublic:\n};' } })
  expect(useProblems.getState().entries[0]).toMatchObject({ solution: 'my attempt', versions: [{ name: 'brute.cpp', content: 'class Solution {\npublic:\n};' }] })
  expect(useProblems.getState().saveStatus).toBe('saved')
})

test('Reset does nothing when the starting code can’t be worked out', async () => {
  await useProblems.getState().load()
  await useProblems.getState().resetCode()
  expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  expect(useProblems.getState().entries[0].solution).toBe('class Solution {};')
})

test('a problem’s link is saved, and can be removed', async () => {
  await useProblems.getState().load()
  await useProblems.getState().setLink('https://leetcode.com/problems/two-sum/')
  expect(calls.at(-1)).toEqual({ url: '/api/problems/two-sum/link', method: 'PUT', body: { link: 'https://leetcode.com/problems/two-sum/' } })
  expect(useProblems.getState().entries[0].problem.link).toBe('https://leetcode.com/problems/two-sum/')
  await useProblems.getState().setLink(null)
  expect(calls.at(-1)?.body).toEqual({ link: null })
  expect(useProblems.getState().entries[0].problem).not.toHaveProperty('link')
})
