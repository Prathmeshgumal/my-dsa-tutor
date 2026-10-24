import { startFolderSync } from './folderSync'

const refreshFromDisk = vi.hoisted(() => vi.fn(async () => {}))
const flushAutosave = vi.hoisted(() => vi.fn(async () => {}))
const loads = vi.hoisted(() => ({ notes: vi.fn(async () => {}), playground: vi.fn(async () => {}), problems: vi.fn(async () => {}) }))

vi.mock('./hydrate', () => ({ refreshFromDisk }))
vi.mock('./autosave', () => ({ flushAutosave }))
vi.mock('./notes', () => ({ useNotes: { getState: () => ({ load: loads.notes }) } }))
vi.mock('./playground', () => ({ usePlayground: { getState: () => ({ load: loads.playground }) } }))
vi.mock('./problems', () => ({ useProblems: { getState: () => ({ load: loads.problems }) } }))

function fakeSource() {
  return {
    onmessage: null as ((e: { data: string }) => void) | null,
    onopen: null as (() => void) | null,
    onerror: null as (() => void) | null,
    close: vi.fn(),
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

test('a files change saves pending edits, then re-reads the folder', async () => {
  const source = fakeSource()
  startFolderSync(() => source)
  source.onmessage!({ data: '{"area":"files"}' })
  await vi.waitFor(() => expect(refreshFromDisk).toHaveBeenCalled())
  expect(flushAutosave.mock.invocationCallOrder[0]).toBeLessThan(refreshFromDisk.mock.invocationCallOrder[0])
})

test.each(['notes', 'playground', 'problems'] as const)('a %s change reloads only that area', (area) => {
  const source = fakeSource()
  startFolderSync(() => source)
  source.onmessage!({ data: JSON.stringify({ area }) })
  expect(loads[area]).toHaveBeenCalledOnce()
  expect(refreshFromDisk).not.toHaveBeenCalled()
})

test('after a dropped connection everything reloads; the first connect reloads nothing', async () => {
  const source = fakeSource()
  startFolderSync(() => source)
  source.onopen!()
  expect(loads.notes).not.toHaveBeenCalled()
  source.onopen!()
  await vi.waitFor(() => expect(refreshFromDisk).toHaveBeenCalled())
  expect(loads.notes).toHaveBeenCalled()
  expect(loads.playground).toHaveBeenCalled()
  expect(loads.problems).toHaveBeenCalled()
})

test('garbage is ignored and stop closes the connection', () => {
  const source = fakeSource()
  const stop = startFolderSync(() => source)
  source.onmessage!({ data: 'nope' })
  source.onmessage!({ data: '{"area":"elsewhere"}' })
  stop()
  expect(source.close).toHaveBeenCalled()
})

test('while the server is down it retries less and less often, and back to soon once connected', () => {
  vi.useFakeTimers()
  const sources: ReturnType<typeof fakeSource>[] = []
  startFolderSync(() => {
    sources.push(fakeSource())
    return sources.at(-1)!
  })
  const dropAndWait = (ms: number) => {
    const before = sources.length
    const current = sources.at(-1)!
    current.onerror!()
    expect(current.close).toHaveBeenCalled()
    vi.advanceTimersByTime(ms - 1)
    expect(sources).toHaveLength(before)
    vi.advanceTimersByTime(1)
    expect(sources).toHaveLength(before + 1)
  }
  dropAndWait(3000)
  dropAndWait(6000)
  dropAndWait(12000)
  sources.at(-1)!.onopen!()
  dropAndWait(3000)
})

test('stop cancels a retry that is waiting', () => {
  vi.useFakeTimers()
  let opened = 0
  const source = fakeSource()
  const stop = startFolderSync(() => {
    opened++
    return source
  })
  source.onerror!()
  stop()
  vi.advanceTimersByTime(60_000)
  expect(opened).toBe(1)
})
