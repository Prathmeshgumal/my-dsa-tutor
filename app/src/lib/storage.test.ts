import { LANGUAGES } from './languages'
import { defaultWorkspace, loadWorkspace, saveWorkspace, WORKSPACE_KEY } from './storage'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

test('default workspace is one open, active main.cpp with the C++ template', () => {
  const d = defaultWorkspace()
  expect(d.version).toBe(1)
  expect(d.files).toHaveLength(1)
  expect(d.files[0]).toMatchObject({ name: 'main.cpp', content: LANGUAGES.cpp.template })
  expect(d.openIds).toEqual([d.files[0].id])
  expect(d.activeId).toBe(d.files[0].id)
})

test('uses the dsa-editor:workspace key', () => {
  expect(WORKSPACE_KEY).toBe('dsa-editor:workspace')
})

test('missing → default', () => {
  expect(loadWorkspace().files.map((f) => f.name)).toEqual(['main.cpp'])
})

test('invalid JSON → default', () => {
  localStorage.setItem(WORKSPACE_KEY, '{oops')
  expect(loadWorkspace().files[0].name).toBe('main.cpp')
})

test('wrong shape → default', () => {
  localStorage.setItem(WORKSPACE_KEY, '{"version":1,"files":"x"}')
  expect(loadWorkspace().files[0].name).toBe('main.cpp')
})

test('file with wrong field types → default', () => {
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({ version: 1, files: [{ id: 1, name: 'a.cpp', content: '' }], openIds: [], activeId: null }),
  )
  expect(loadWorkspace().files[0].name).toBe('main.cpp')
})

test('localStorage throwing → default and save returns false', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied')
  })
  expect(loadWorkspace().files[0].name).toBe('main.cpp')
  expect(saveWorkspace(defaultWorkspace())).toBe(false)
})

test('round-trip', () => {
  const d = defaultWorkspace()
  expect(saveWorkspace(d)).toBe(true)
  expect(loadWorkspace()).toEqual(d)
})

test('empty workspace (all files deleted) round-trips', () => {
  const empty = { version: 1 as const, files: [], openIds: [], activeId: null }
  saveWorkspace(empty)
  expect(loadWorkspace()).toEqual(empty)
})

test('drops dangling openIds/activeId on load', () => {
  const file = { id: 'a', name: 'a.cpp', content: '' }
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({ version: 1, files: [file], openIds: ['a', 'gone'], activeId: 'gone' }),
  )
  expect(loadWorkspace()).toEqual({ version: 1, files: [file], openIds: ['a'], activeId: null })
})
