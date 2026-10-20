import { LANGUAGES } from '@/lib/languages'
import { createPistonRunner } from './piston'
import type { RunRequest } from './types'

const req: RunRequest = { language: LANGUAGES.cpp, source: 'int main(){}', stdin: '' }

const ok = { signal: null, stdout: '', stderr: '', code: 0, output: '', message: null, status: null }

function respond(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

async function run(body: unknown, status = 200, r: RunRequest = req) {
  return createPistonRunner({ fetchImpl: respond(body, status) }).run(r)
}

test('posts to <baseUrl>/execute with language, any version and a fixed file name', async () => {
  const fetchImpl = respond({ run: ok })
  await createPistonRunner({ baseUrl: '/piston', fetchImpl }).run(req)
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/piston/execute')
  expect(init.method).toBe('POST')
  expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  expect(JSON.parse(init.body as string)).toEqual({
    language: 'c++',
    version: '*',
    files: [{ name: 'main', content: 'int main(){}' }],
    stdin: '',
    // Piston allows long interactive runs; a batch run stays short so an infinite loop stops quickly.
    run_timeout: 3000,
  })
})

test('java is sent as Main.java', async () => {
  const fetchImpl = respond({ run: ok })
  await createPistonRunner({ fetchImpl }).run({ ...req, language: LANGUAGES.java })
  expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).files[0].name).toBe(
    'Main.java',
  )
})

test('success with unicode stdout, cpu time in ms and memory in KB', async () => {
  const result = await run({ run: { ...ok, stdout: 'é → ✓\n', cpu_time: 3, memory: 1212000 } })
  expect(result).toMatchObject({ status: 'success', statusText: 'Accepted', stdout: 'é → ✓\n', timeMs: 3, memoryKb: 1184 })
})

test('missing time and memory → null', async () => {
  const result = await run({ run: ok })
  expect(result).toMatchObject({ timeMs: null, memoryKb: null })
})

test('compile failure → compile_error with compiler stderr, minus the chmod noise line', async () => {
  const stderr =
    "main.cpp:1:20: error: expected ';' before '}' token\nchmod: cannot access 'a.out': No such file or directory\n"
  const result = await run({
    compile: { ...ok, code: 1, stderr, status: 'RE', message: 'Exited with error status 1' },
    run: { ...ok, code: 1, stderr, status: 'RE' },
  })
  expect(result.status).toBe('compile_error')
  expect(result.compileOutput).toBe("main.cpp:1:20: error: expected ';' before '}' token\n")
  expect(result.stderr).toBe('')
})

test('status TO → time_limit', async () => {
  const result = await run({ run: { ...ok, signal: 'SIGKILL', code: null, status: 'TO', message: 'Time limit exceeded (wall clock)' } })
  expect(result.status).toBe('time_limit')
})

test('non-zero exit → runtime_error with stderr and exit code', async () => {
  const result = await run({
    run: { ...ok, code: 139, stderr: 'Segmentation fault\n', status: 'RE', message: 'Exited with error status 139' },
  })
  expect(result).toMatchObject({ status: 'runtime_error', statusText: 'Runtime error (exit 139)', stderr: 'Segmentation fault\n' })
})

test('killed by a signal → runtime_error naming the signal', async () => {
  const result = await run({ run: { ...ok, code: null, signal: 'SIGSEGV', status: 'SG' } })
  expect(result).toMatchObject({ status: 'runtime_error', statusText: 'Runtime error (SIGSEGV)' })
})

test('status XX → internal_error', async () => {
  const result = await run({ run: { ...ok, status: 'XX', message: 'internal' } })
  expect(result.status).toBe('internal_error')
})

test('HTTP 400 with message → http error carrying Piston’s message', async () => {
  await expect(run({ message: 'cobol-* runtime is unknown' }, 400)).rejects.toMatchObject({
    kind: 'http',
    message: 'Piston: cobol-* runtime is unknown',
  })
})

test('HTTP 500 without JSON → generic http error', async () => {
  const fetchImpl = vi.fn(async () => new Response('Bad Gateway', { status: 502 }))
  await expect(createPistonRunner({ fetchImpl }).run(req)).rejects.toMatchObject({
    kind: 'http',
    message: 'Piston error (HTTP 502).',
  })
})

test('fetch throws → network error telling how to start Piston', async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  await expect(createPistonRunner({ fetchImpl }).run(req)).rejects.toMatchObject({
    kind: 'network',
    message: 'Couldn’t reach Piston — start it with “docker compose up -d”.',
  })
})
