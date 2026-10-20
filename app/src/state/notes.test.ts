import { configureNotes, noteTitle, useNotes } from './notes'
import { useProblems } from './problems'
import { useSettings } from './settings'

const notes = () => useNotes.getState()
let disk: Map<string, string>
let calls: string[]

/** A fake /api/notes backed by a Map. */
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  calls.push(`${method} ${url}`)
  if (url === '/api/notes') return Response.json([...disk].map(([name, content]) => ({ name, content })))
  const name = decodeURIComponent(url.slice('/api/notes/'.length))
  if (method === 'PUT') disk.set(name, JSON.parse(String(init!.body)).content)
  if (method === 'DELETE') disk.delete(name)
  return new Response(null, { status: 204 })
})

beforeEach(() => {
  vi.useFakeTimers()
  disk = new Map()
  calls = []
  configureNotes({ fetchImpl: fakeFetch as typeof fetch, delayMs: 800 })
  useNotes.setState({ notes: [], activeName: null, status: 'idle', saveStatus: 'saved' })
})

afterEach(() => vi.useRealTimers())

test('loads notes from disk and opens the first one', async () => {
  disk.set('note-1.md', '# Graphs')
  disk.set('note-2.md', '# DP')
  await notes().load()
  expect(notes().status).toBe('ready')
  expect(notes().notes.map((n) => n.name)).toEqual(['note-1.md', 'note-2.md'])
  expect(notes().activeName).toBe('note-1.md')
})

test('a new note gets the next free name, is saved at once and opened', async () => {
  disk.set('note-1.md', 'x')
  await notes().load()
  await notes().create()
  expect(notes().activeName).toBe('note-2.md')
  expect(disk.get('note-2.md')).toBe('# Untitled note\n\n')
})

test('typing autosaves once you stop for a moment (not on every key)', async () => {
  await notes().load()
  await notes().create()
  calls = []
  notes().edit('# A')
  notes().edit('# AB')
  notes().edit('# ABC')
  expect(notes().saveStatus).toBe('pending')
  await vi.advanceTimersByTimeAsync(799)
  expect(calls).toEqual([])
  await vi.advanceTimersByTimeAsync(1)
  expect(calls).toEqual(['PUT /api/notes/note-1.md'])
  expect(disk.get('note-1.md')).toBe('# ABC')
  expect(notes().saveStatus).toBe('saved')
})

test('switching notes saves the pending edit straight away', async () => {
  disk.set('note-1.md', 'one')
  disk.set('note-2.md', 'two')
  await notes().load()
  notes().edit('one edited')
  await notes().select('note-2.md')
  expect(disk.get('note-1.md')).toBe('one edited')
  expect(notes().activeName).toBe('note-2.md')
})

test('deleting removes the file and opens another note', async () => {
  disk.set('note-1.md', 'one')
  disk.set('note-2.md', 'two')
  await notes().load()
  await notes().remove('note-1.md')
  expect(disk.has('note-1.md')).toBe(false)
  expect(notes().notes.map((n) => n.name)).toEqual(['note-2.md'])
  expect(notes().activeName).toBe('note-2.md')
})

test('a failed save is reported, not silently dropped', async () => {
  await notes().load()
  await notes().create()
  configureNotes({ fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch, delayMs: 800 })
  notes().edit('lost?')
  await vi.advanceTimersByTimeAsync(800)
  expect(notes().saveStatus).toBe('error')
})

test('note titles come from the first line, without markdown heading marks', () => {
  expect(noteTitle('# Graph tricks\n\nbody')).toBe('Graph tricks')
  expect(noteTitle('\n\n  plain first line')).toBe('plain first line')
  expect(noteTitle('')).toBe('Untitled note')
})

test('a note created on the Problem screen is linked to the open problem', async () => {
  const linkNote = vi.fn(async () => {})
  useProblems.setState({ linkNote })
  useSettings.setState({ screen: 'problem' })
  await notes().load()
  await notes().create()
  expect(linkNote).toHaveBeenCalledWith('note-1.md')
  useSettings.setState({ screen: 'editor' })
  await notes().create()
  expect(linkNote).toHaveBeenCalledTimes(1)
})
