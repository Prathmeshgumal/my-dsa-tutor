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
  return { onmessage: null as ((e: { data: string }) => void) | null, onopen: null as (() => void) | null, close: vi.fn() }
}

beforeEach(() => vi.clearAllMocks())

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
