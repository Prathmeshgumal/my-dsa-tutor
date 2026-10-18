import { toast } from 'sonner'
import { useSettingsDialog } from '@/components/settings/SettingsDialog'
import { LANGUAGES } from '@/lib/languages'
import { RunnerError, type CodeRunner, type RunResult } from '@/lib/runner/types'
import { defaultWorkspace } from '@/lib/storage'
import { useRun } from './run'
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
  useSettings.setState({ apiKey: 'k' })
  useRun.setState({ state: 'idle', result: null, error: null, connection: 'connected' })
  useSettingsDialog.setState({ open: false, reason: 'manual' })
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

test('no key → opens settings dialog with reason no_key, state error, no runner call', async () => {
  useSettings.setState({ apiKey: '' })
  const runner = fakeRunner(async () => ok)
  await run().runActiveFile(runner)
  expect(runner.run).not.toHaveBeenCalled()
  expect(useSettingsDialog.getState()).toMatchObject({ open: true, reason: 'no_key' })
  expect(run().state).toBe('error')
  expect(run().error?.kind).toBe('no_key')
  expect(run().connection).toBe('no_key')
})

test.each(['auth', 'quota', 'network', 'http'] as const)(
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
