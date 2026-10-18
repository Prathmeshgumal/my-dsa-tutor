import { defaultWorkspace, WORKSPACE_KEY } from '@/lib/storage'
import { startAutosave } from './autosave'
import { useWorkspace } from './workspace'

const ws = () => useWorkspace.getState()
let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: null })
  stop = startAutosave()
})

afterEach(() => {
  stop()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('debounces 500ms then saves and sets saved', () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem')
  const id = ws().files[0].id
  ws().updateContent(id, 'a')
  ws().updateContent(id, 'ab')
  vi.advanceTimersByTime(499)
  expect(setItem).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(setItem).toHaveBeenCalledTimes(1)
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).files[0].content).toBe('ab')
  expect(ws().saveStatus).toBe('saved')
  expect(ws().lastSavedAt).not.toBeNull()
})

test('saves tab and file changes too, not just content', () => {
  ws().createFile('b.py')
  vi.advanceTimersByTime(500)
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).files).toHaveLength(2)
})

test('persisted data does not include saveStatus', () => {
  ws().updateContent(ws().files[0].id, 'z')
  vi.advanceTimersByTime(500)
  expect(Object.keys(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!)).sort()).toEqual(
    ['activeId', 'files', 'openIds', 'version'],
  )
})

test('visibilitychange hidden flushes immediately', () => {
  ws().updateContent(ws().files[0].id, 'now')
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).files[0].content).toBe('now')
})

test('beforeunload flushes immediately', () => {
  ws().updateContent(ws().files[0].id, 'bye')
  window.dispatchEvent(new Event('beforeunload'))
  expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).files[0].content).toBe('bye')
})

test('save failure → saveStatus error', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  ws().updateContent(ws().files[0].id, 'x')
  vi.advanceTimersByTime(500)
  expect(ws().saveStatus).toBe('error')
})

test('stop() removes listeners and pending save', () => {
  ws().updateContent(ws().files[0].id, 'never')
  stop()
  vi.advanceTimersByTime(1000)
  expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
})

describe('with disk sync', () => {
  const okFetch = () => vi.fn(async () => new Response(null, { status: 204 }))

  beforeEach(() => {
    stop()
  })

  test('after the debounce, changed files are written to disk and status becomes saved', async () => {
    const fetchImpl = okFetch()
    const synced = ws().files
    stop = startAutosave({ disk: { synced, fetchImpl } })
    ws().updateContent(ws().files[0].id, 'disk!')
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/files/main.cpp')
    expect(JSON.parse(init.body as string)).toEqual({ content: 'disk!' })
    expect(ws().saveStatus).toBe('saved')
  })

  test('unsynced files from startup are written on the first save', async () => {
    const fetchImpl = okFetch()
    stop = startAutosave({ disk: { synced: [], fetchImpl } })
    ws().createFile('b.py')
    await vi.advanceTimersByTimeAsync(500)
    expect((fetchImpl.mock.calls as unknown as [string][]).map((c) => c[0]).sort()).toEqual([
      '/api/files/b.py',
      '/api/files/main.cpp',
    ])
  })

  test('files not yet on disk at startup are written immediately, without waiting for an edit', async () => {
    const fetchImpl = okFetch()
    stop = startAutosave({ disk: { synced: [], fetchImpl } })
    await vi.advanceTimersByTimeAsync(0)
    expect((fetchImpl.mock.calls as unknown as [string][]).map((c) => c[0])).toEqual(['/api/files/main.cpp'])
  })

  test('already in sync at startup → no writes until something changes', async () => {
    const fetchImpl = okFetch()
    stop = startAutosave({ disk: { synced: ws().files, fetchImpl } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('disk failure → status error, and the next save retries the same change', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'disk full' }), { status: 500 }))
      .mockResolvedValue(new Response(null, { status: 204 }))
    stop = startAutosave({ disk: { synced: ws().files, fetchImpl } })
    const id = ws().files[0].id
    ws().updateContent(id, 'one')
    await vi.advanceTimersByTimeAsync(500)
    expect(ws().saveStatus).toBe('error')
    ws().updateContent(id, 'two')
    await vi.advanceTimersByTimeAsync(500)
    expect(ws().saveStatus).toBe('saved')
    const last = fetchImpl.mock.calls.at(-1) as unknown as [string, RequestInit]
    expect(JSON.parse(last[1].body as string)).toEqual({ content: 'two' })
  })

  test('closing the page sends pending changes with keepalive', async () => {
    const fetchImpl = okFetch()
    stop = startAutosave({ disk: { synced: ws().files, fetchImpl } })
    ws().updateContent(ws().files[0].id, 'bye')
    window.dispatchEvent(new Event('beforeunload'))
    await vi.advanceTimersByTimeAsync(0)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.keepalive).toBe(true)
  })
})
