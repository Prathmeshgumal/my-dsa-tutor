import type { SocketLike } from '@/lib/runner/interactive'
import { toast } from 'sonner'
import { LANGUAGES } from '@/lib/languages'
import { RunnerError, type CodeRunner, type RunResult } from '@/lib/runner/types'
import { defaultWorkspace } from '@/lib/storage'
import { configureRun, createRunner, useRun } from './run'
import { useSettings } from './settings'
import { useWorkspace } from './workspace'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const ok: RunResult = {
  status: 'success',
  statusText: 'Accepted',
  stdout: '42\n',
  stderr: '',
  compileOutput: '',
  timeMs: 12,
  memoryKb: 3400,
}

function fakeRunner(impl: () => Promise<RunResult>) {
  return { run: vi.fn(impl) } satisfies CodeRunner
}

const run = () => useRun.getState()

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: null })
  useRun.setState({ state: 'idle', result: null, error: null, connection: 'connected' })
})

test('runs active file with its language and empty stdin', async () => {
  useWorkspace.getState().createFile('two.py')
  useWorkspace.getState().updateContent(useWorkspace.getState().activeId!, 'print(1)')
  const runner = fakeRunner(async () => ok)
  await run().runActiveFile(runner)
  expect(runner.run).toHaveBeenCalledWith({ language: LANGUAGES.python, source: 'print(1)', stdin: '' })
  expect(run()).toMatchObject({ state: 'done', result: ok, error: null })
})

test('state is running while the request is in flight', async () => {
  let resolve!: (r: RunResult) => void
  const runner = fakeRunner(() => new Promise((r) => (resolve = r)))
  const pending = run().runActiveFile(runner)
  expect(run().state).toBe('running')
  resolve(ok)
  await pending
  expect(run().state).toBe('done')
})

test('ignores a second call while running', async () => {
  let resolve!: (r: RunResult) => void
  const runner = fakeRunner(() => new Promise((r) => (resolve = r)))
  const first = run().runActiveFile(runner)
  await run().runActiveFile(runner)
  expect(runner.run).toHaveBeenCalledTimes(1)
  resolve(ok)
  await first
})

test.each(['network', 'http'] as const)(
  '%s error → state error, connection failed, toast with message',
  async (kind) => {
    const runner = fakeRunner(async () => {
      throw new RunnerError(kind, `msg-${kind}`)
    })
    await run().runActiveFile(runner)
    expect(run()).toMatchObject({ state: 'error', connection: 'failed', result: null })
    expect(run().error?.message).toBe(`msg-${kind}`)
    expect(toast.error).toHaveBeenCalledWith(`msg-${kind}`)
  },
)

test('unexpected error is reported, not swallowed', async () => {
  const runner = fakeRunner(async () => {
    throw new Error('boom')
  })
  await run().runActiveFile(runner)
  expect(run().state).toBe('error')
  expect(run().error?.message).toMatch(/boom/)
  expect(toast.error).toHaveBeenCalled()
})

test('success after a failure → connection connected', async () => {
  useRun.setState({ connection: 'failed' })
  await run().runActiveFile(fakeRunner(async () => ok))
  expect(run().connection).toBe('connected')
})

test('no active file → no-op', async () => {
  useWorkspace.setState({ openIds: [], activeId: null })
  const runner = fakeRunner(async () => ok)
  await run().runActiveFile(runner)
  expect(runner.run).not.toHaveBeenCalled()
  expect(run().state).toBe('idle')
})

test('createRunner picks Piston via the /piston proxy', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { stdout: '', stderr: '', code: 0, signal: null, status: null, message: null } })))
  vi.stubGlobal('fetch', fetchMock)
  await createRunner().run({ language: LANGUAGES.cpp, source: '', stdin: '' })
  expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/piston/execute')
  vi.unstubAllGlobals()
})

test('running with the output hidden opens it straight away, before the result arrives', async () => {
  useSettings.setState({ outputOpen: false })
  let resolve!: (r: RunResult) => void
  const pending = run().runActiveFile(fakeRunner(() => new Promise((r) => (resolve = r))))
  expect(useSettings.getState().outputOpen).toBe(true)
  resolve(ok)
  await pending
})

describe('running like a terminal (Piston)', () => {
  class FakeSocket implements SocketLike {
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onclose: ((e: { code: number; reason: string }) => void) | null = null
    onerror: (() => void) | null = null
    sent: Record<string, unknown>[] = []
    send(data: string) {
      this.sent.push(JSON.parse(data))
    }
    close() {}
    piston(m: Record<string, unknown>) {
      this.onmessage?.({ data: JSON.stringify(m) })
    }
  }

  let socket: FakeSocket
  beforeEach(() => {
    socket = new FakeSocket()
    configureRun({ connect: () => socket })
    useRun.setState({ terminal: [], phase: null, lastStdin: '' })
    useWorkspace.getState().createFile('read.cpp')
  })
  afterEach(() => configureRun({}))

  test('the program asks, you type, it carries on; the terminal shows both in order', async () => {
    const done = run().runActiveFile()
    socket.onopen?.()
    expect(run().phase).toBe('compiling')
    socket.piston({ type: 'stage', stage: 'run' })
    socket.piston({ type: 'data', stream: 'stdout', data: 'rows: ' })
    expect(run().phase).toBe('running')
    run().sendInput('2')
    expect(socket.sent.at(-1)).toEqual({ type: 'data', stream: 'stdin', data: '2\n' })
    socket.piston({ type: 'data', stream: 'stdout', data: 'got ' })
    socket.piston({ type: 'data', stream: 'stdout', data: '2\n' })
    socket.piston({ type: 'exit', stage: 'run', code: 0, signal: null })
    await done
    expect(run().terminal).toEqual([
      { kind: 'stdout', text: 'rows: ' },
      { kind: 'input', text: '2\n' },
      { kind: 'stdout', text: 'got 2\n' },
    ])
    expect(run()).toMatchObject({ state: 'done', lastStdin: '2\n', result: { status: 'success', stdout: 'rows: got 2\n' } })
  })

  test('typing before the program starts goes nowhere', () => {
    void run().runActiveFile()
    socket.onopen?.()
    run().sendInput('early')
    expect(socket.sent.filter((m) => m.type === 'data')).toEqual([])
    expect(run().terminal).toEqual([])
  })

  test('Stop ends the program', async () => {
    const done = run().runActiveFile()
    socket.onopen?.()
    socket.piston({ type: 'stage', stage: 'run' })
    run().stop()
    await done
    expect(run().result).toMatchObject({ statusText: 'Stopped' })
  })

  test('no Piston: an error with the fix', async () => {
    const done = run().runActiveFile()
    socket.onclose?.({ code: 1006, reason: '' })
    await done
    expect(run()).toMatchObject({ state: 'error', connection: 'failed' })
    expect(run().error?.message).toMatch(/docker compose up -d/)
  })
})
