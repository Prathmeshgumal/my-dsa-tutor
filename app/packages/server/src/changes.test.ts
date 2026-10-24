// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Change } from '@dsa/core/changes'
import { applyChange, ToolError } from './changes'
import { createClaudeChatMiddleware } from './claudeChat'

let root: string
let stores: { dir: string; notesDir: string; problemsDir: string }

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'changes-'))
  stores = { dir: path.join(root, 'solutions'), notesDir: path.join(root, 'notes'), problemsDir: path.join(root, 'problems') }
  for (const d of Object.values(stores)) await mkdir(d)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('an edit applies to the file as it is now, if the old text is still there', async () => {
  await writeFile(path.join(stores.dir, 'a.cpp'), 'int x = 1;\nint y = 2;')
  const applied = await applyChange(stores, { type: 'edit_file', name: 'a.cpp', oldText: 'int x = 1;', newText: 'int x = 5;' })
  expect(await readFile(path.join(stores.dir, 'a.cpp'), 'utf8')).toBe('int x = 5;\nint y = 2;')
  expect(applied.effects).toEqual([{ type: 'file_changed', file: 'a.cpp' }])
})

test('an edit to a file that changed meanwhile is refused and nothing is written', async () => {
  await writeFile(path.join(stores.dir, 'a.cpp'), 'int x = 9;')
  await expect(applyChange(stores, { type: 'edit_file', name: 'a.cpp', oldText: 'int x = 1;', newText: 'int x = 5;' })).rejects.toThrow(
    'a.cpp changed while waiting for approval',
  )
  expect(await readFile(path.join(stores.dir, 'a.cpp'), 'utf8')).toBe('int x = 9;')
})

test('a new file that exists by now is refused, not overwritten', async () => {
  await writeFile(path.join(stores.dir, 'a.cpp'), 'mine')
  await expect(applyChange(stores, { type: 'create_file', name: 'a.cpp', content: 'theirs' })).rejects.toBeInstanceOf(ToolError)
  expect(await readFile(path.join(stores.dir, 'a.cpp'), 'utf8')).toBe('mine')
})

test('a new note whose name was taken meanwhile gets the next free name', async () => {
  await writeFile(path.join(stores.notesDir, 'note-1.md'), '# Mine')
  const applied = await applyChange(stores, { type: 'create_note', name: 'note-1.md', content: '# Claude’s' })
  expect(applied.effects).toEqual([{ type: 'note_changed', note: 'note-2.md' }])
  expect(await readFile(path.join(stores.notesDir, 'note-1.md'), 'utf8')).toBe('# Mine')
  expect(await readFile(path.join(stores.notesDir, 'note-2.md'), 'utf8')).toBe('# Claude’s')
})

test.each<[string, Change]>([
  ['a path in a file name', { type: 'create_file', name: '../escape.cpp', content: 'x' }],
  ['a path in a note name', { type: 'edit_note', name: '../../etc/passwd.md', oldText: 'a', newText: 'b' }],
  ['a bad problem name', { type: 'add_test', slug: '../x', test: { input: [], expected: '', example: false, addedBy: 'claude' } }],
])('refuses %s', async (_name, change) => {
  await expect(applyChange(stores, change)).rejects.toBeInstanceOf(ToolError)
  expect(await readdir(root)).toEqual(['notes', 'problems', 'solutions'])
})

describe('POST /api/claude/apply', () => {
  let server: Server
  let url: string

  beforeEach(async () => {
    const middleware = createClaudeChatMiddleware({ cwd: stores.dir, notesDir: stores.notesDir, playgroundDir: root, problemsDir: stores.problemsDir })
    server = createServer((req, res) => middleware(req, res, () => res.end('next')))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/claude/apply`
  })

  afterEach(async () => {
    await new Promise((r) => server.close(r))
  })

  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  test('applies the change and says what changed', async () => {
    const res = await post({ change: { type: 'create_file', name: 'b.py', content: 'print(1)' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: 'Created b.py.', effects: [{ type: 'file_changed', file: 'b.py' }] })
  })

  test('a change that no longer fits answers 409 with the reason', async () => {
    const res = await post({ change: { type: 'edit_file', name: 'gone.cpp', oldText: 'a', newText: 'b' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("gone.cpp doesn't exist any more.")
  })

  test('the reason is written for the person, not for Claude', async () => {
    await writeFile(path.join(stores.dir, 'a.cpp'), 'int x = 9;')
    const edit = await post({ change: { type: 'edit_file', name: 'a.cpp', oldText: 'int x = 1;', newText: 'int x = 5;' } })
    expect((await edit.json()).error).toBe('a.cpp has changed since Claude suggested this, so the change no longer fits.')
    const create = await post({ change: { type: 'create_file', name: 'a.cpp', content: 'theirs' } })
    expect((await create.json()).error).toBe('a.cpp already exists.')
  })

  test('something that isn’t a change answers 400', async () => {
    expect((await post({ change: { type: 'rm_rf', path: '/' } })).status).toBe(400)
    expect((await post({})).status).toBe(400)
  })
})
