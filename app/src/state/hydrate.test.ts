import { saveWorkspace, type WorkspaceData } from '@/lib/storage'
import { hydrateFromDisk } from './hydrate'
import { useWorkspace } from './workspace'

const ws = () => useWorkspace.getState()

function diskWith(files: { name: string; content: string }[]) {
  return vi.fn(async () => new Response(JSON.stringify(files)))
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ ready: false })
})

test('loads files from disk, reusing ids, open tabs and active file from the browser by name', async () => {
  const local: WorkspaceData = {
    version: 1,
    files: [
      { id: 'id-a', name: 'a.cpp', content: 'stale' },
      { id: 'id-b', name: 'b.py', content: '' },
    ],
    openIds: ['id-b', 'id-a'],
    activeId: 'id-b',
  }
  saveWorkspace(local)
  const result = await hydrateFromDisk(
    diskWith([
      { name: 'a.cpp', content: 'from disk' },
      { name: 'b.py', content: 'print(1)' },
      { name: 'c.java', content: 'class Main{}' },
    ]),
  )
  expect(result.ok).toBe(true)
  expect(ws().ready).toBe(true)
  expect(ws().files.map((f) => [f.id, f.name, f.content])).toEqual([
    ['id-a', 'a.cpp', 'from disk'],
    ['id-b', 'b.py', 'print(1)'],
    [expect.any(String), 'c.java', 'class Main{}'],
  ])
  expect(ws().openIds).toEqual(['id-b', 'id-a'])
  expect(ws().activeId).toBe('id-b')
  expect(result.synced).toEqual(ws().files)
})

test('files deleted on disk drop out of the tabs', async () => {
  saveWorkspace({ version: 1, files: [{ id: 'x', name: 'gone.cpp', content: '' }], openIds: ['x'], activeId: 'x' })
  await hydrateFromDisk(diskWith([{ name: 'a.cpp', content: '' }]))
  expect(ws().openIds).toEqual([])
  expect(ws().activeId).toBeNull()
})

test('empty disk folder → browser files are kept and marked unsynced (migration to disk)', async () => {
  saveWorkspace({ version: 1, files: [{ id: 'old', name: 'old.cpp', content: 'mine' }], openIds: ['old'], activeId: 'old' })
  const result = await hydrateFromDisk(diskWith([]))
  expect(result).toEqual({ ok: true, synced: [] })
  expect(ws().files).toEqual([{ id: 'old', name: 'old.cpp', content: 'mine' }])
  expect(ws().activeId).toBe('old')
})

test('first ever run (nothing anywhere) → default main.cpp, unsynced so it gets written', async () => {
  const result = await hydrateFromDisk(diskWith([]))
  expect(ws().files.map((f) => f.name)).toEqual(['main.cpp'])
  expect(result.synced).toEqual([])
})

test('files API unavailable → keeps browser files, reports not ok, still ready', async () => {
  saveWorkspace({ version: 1, files: [{ id: 'b', name: 'b.cpp', content: 'kept' }], openIds: ['b'], activeId: 'b' })
  const result = await hydrateFromDisk(vi.fn(async () => new Response('', { status: 404 })))
  expect(result.ok).toBe(false)
  expect(ws().ready).toBe(true)
  expect(ws().files).toEqual([{ id: 'b', name: 'b.cpp', content: 'kept' }])
})
