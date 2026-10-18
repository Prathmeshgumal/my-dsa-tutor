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
