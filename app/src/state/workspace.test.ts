import { LANGUAGES } from '@/lib/languages'
import { defaultWorkspace } from '@/lib/storage'
import { useWorkspace } from './workspace'

const ws = () => useWorkspace.getState()
const names = () => ws().files.map((f) => f.name)

beforeEach(() => {
  useWorkspace.setState({ ...defaultWorkspace(), saveStatus: 'saved', lastSavedAt: null })
})

test('createFile adds, opens, activates with language template', () => {
  expect(ws().createFile('two.py')).toEqual({ ok: true })
  expect(ws().activeFile()).toMatchObject({ name: 'two.py', content: LANGUAGES.python.template })
  expect(ws().openIds).toHaveLength(2)
})

test('createFile trims the name', () => {
  ws().createFile('  two.py ')
  expect(names()).toContain('two.py')
})

test('createFile rejects duplicate', () => {
  expect(ws().createFile('MAIN.cpp')).toEqual({ ok: false, error: 'A file with this name already exists' })
  expect(names()).toEqual(['main.cpp'])
})

test('renameFile invalid keeps old name', () => {
  const id = ws().files[0].id
  expect(ws().renameFile(id, 'notes.txt')).toEqual({ ok: false, error: 'Use .cpp, .java or .py' })
  expect(names()).toEqual(['main.cpp'])
})

test('renameFile valid', () => {
  const id = ws().files[0].id
  expect(ws().renameFile(id, 'sol.cpp')).toEqual({ ok: true })
  expect(names()).toEqual(['sol.cpp'])
})

test('renameFile to own name with different case is allowed', () => {
  const id = ws().files[0].id
  expect(ws().renameFile(id, 'Main.cpp')).toEqual({ ok: true })
  expect(names()).toEqual(['Main.cpp'])
})

test('renameFile to another file’s name is rejected', () => {
  ws().createFile('b.cpp')
  const id = ws().files[0].id
  expect(ws().renameFile(id, 'B.cpp')).toEqual({ ok: false, error: 'A file with this name already exists' })
})

test('setActiveLanguage renames extension', () => {
  ws().setActiveLanguage('java')
  expect(ws().activeFile()!.name).toBe('main.java')
})

test('setActiveLanguage uses uniqueName on clash', () => {
  ws().createFile('main.py')
  ws().setActive(ws().files[0].id)
  ws().setActiveLanguage('python')
  expect(ws().activeFile()!.name).toBe('main-1.py')
})

test('openFile adds a tab and activates it', () => {
  ws().createFile('b.cpp')
  const [a, b] = ws().files
  ws().closeTab(b.id)
  ws().openFile(b.id)
  expect(ws().openIds).toEqual([a.id, b.id])
  expect(ws().activeId).toBe(b.id)
})

test('closeTab active → activates right neighbour, else left; last → activeId null', () => {
  ws().createFile('b.cpp')
  ws().createFile('c.cpp')
  const [a, b, c] = ws().files
  ws().setActive(b.id)
  ws().closeTab(b.id)
  expect(ws().activeId).toBe(c.id)
  ws().closeTab(c.id)
  expect(ws().activeId).toBe(a.id)
  ws().closeTab(a.id)
  expect(ws().openIds).toEqual([])
  expect(ws().activeId).toBeNull()
  expect(ws().activeFile()).toBeNull()
})

test('closeTab of an inactive tab keeps the active one', () => {
  ws().createFile('b.cpp')
  const [a, b] = ws().files
  ws().closeTab(a.id)
  expect(ws().activeId).toBe(b.id)
})

test('deleteFile removes from files and tabs; deleting last leaves files [] and activeId null', () => {
  ws().createFile('b.cpp')
  const [a, b] = ws().files
  ws().deleteFile(b.id)
  expect(names()).toEqual(['main.cpp'])
  expect(ws().openIds).toEqual([a.id])
  expect(ws().activeId).toBe(a.id)
  ws().deleteFile(a.id)
  expect(ws().files).toEqual([])
  expect(ws().activeId).toBeNull()
})

test('updateContent changes content and sets saveStatus to saving', () => {
  const id = ws().files[0].id
  ws().updateContent(id, 'x')
  expect(ws().files[0].content).toBe('x')
  expect(ws().saveStatus).toBe('saving')
})
