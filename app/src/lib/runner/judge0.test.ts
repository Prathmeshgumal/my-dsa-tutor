import { encodeBase64 } from '@/lib/base64'
import { LANGUAGES } from '@/lib/languages'
import { createJudge0RapidApiRunner } from './judge0'
import type { RunRequest } from './types'

const req: RunRequest = { language: LANGUAGES.cpp, source: 'int main(){}', stdin: '' }

function respond(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

function submission(statusId: number, description: string, extra: Record<string, unknown> = {}) {
  return { status: { id: statusId, description }, stdout: null, stderr: null, compile_output: null, time: null, memory: null, ...extra }
}

async function run(body: unknown, status = 200) {
  const fetchImpl = respond(body, status)
  return createJudge0RapidApiRunner({ apiKey: 'k', fetchImpl }).run(req)
}

test('sends correct request', async () => {
  const fetchImpl = respond(submission(3, 'Accepted'))
  await createJudge0RapidApiRunner({ apiKey: 'k', fetchImpl }).run(req)
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true')
  expect(init.method).toBe('POST')
  expect(init.headers).toMatchObject({
    'X-RapidAPI-Key': 'k',
    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
    'Content-Type': 'application/json',
  })
  expect(JSON.parse(init.body as string)).toEqual({
    source_code: encodeBase64('int main(){}'),
    language_id: 54,
    stdin: '',
  })
})

test('accepted → success with ms and KB', async () => {
  const result = await run(
    submission(3, 'Accepted', { stdout: encodeBase64('0 1\n'), time: '0.012', memory: 3400 }),
  )
  expect(result).toMatchObject({
    status: 'success',
    statusText: 'Accepted',
    stdout: '0 1\n',
    timeMs: 12,
    memoryKb: 3400,
  })
})

test('decodes unicode stdout', async () => {
  const result = await run(submission(3, 'Accepted', { stdout: encodeBase64('é → ✓') }))
  expect(result.stdout).toBe('é → ✓')
})

test('status 6 → compile_error with decoded compile_output', async () => {
  const result = await run(
    submission(6, 'Compilation Error', { compile_output: encodeBase64("error: expected ';'") }),
  )
  expect(result).toMatchObject({ status: 'compile_error', compileOutput: "error: expected ';'" })
})

test('status 5 → time_limit', async () => {
  const result = await run(submission(5, 'Time Limit Exceeded'))
  expect(result).toMatchObject({ status: 'time_limit', statusText: 'Time Limit Exceeded', timeMs: null })
})

test.each([7, 8, 9, 10, 11, 12])('status %i → runtime_error with stderr', async (id) => {
  const result = await run(submission(id, 'Runtime Error', { stderr: encodeBase64('segfault') }))
  expect(result).toMatchObject({ status: 'runtime_error', stderr: 'segfault' })
})

test.each([13, 14])('status %i → internal_error', async (id) => {
  const result = await run(submission(id, 'Internal Error'))
  expect(result.status).toBe('internal_error')
})

test('empty key → RunnerError no_key, no fetch', async () => {
  const fetchImpl = respond({})
  await expect(createJudge0RapidApiRunner({ apiKey: '', fetchImpl }).run(req)).rejects.toMatchObject({
    kind: 'no_key',
    message: 'Add your RapidAPI key in Settings to run code.',
  })
  expect(fetchImpl).not.toHaveBeenCalled()
})

test.each([
  [401, 'auth', 'Invalid API key — check it in Settings.'],
  [403, 'auth', 'Invalid API key — check it in Settings.'],
  [429, 'quota', 'Daily Judge0 quota used up. Try again tomorrow.'],
  [500, 'http', 'Judge0 error (HTTP 500).'],
])('HTTP %i → %s', async (status, kind, message) => {
  await expect(run({ message: 'x' }, status)).rejects.toMatchObject({ kind, message })
})

test('fetch throws → network', async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  await expect(createJudge0RapidApiRunner({ apiKey: 'k', fetchImpl }).run(req)).rejects.toMatchObject({
    kind: 'network',
    message: 'Couldn’t reach Judge0 — check your connection.',
  })
})
