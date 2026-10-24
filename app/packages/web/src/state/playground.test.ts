import type { DryRun } from '@dsa/core/dryRun'
import { useSettings } from './settings'
import { configurePlayground, usePlayground } from './playground'

const pg = () => usePlayground.getState()
const run = (id: string, steps = 3, createdAt = 1): DryRun => ({
  id,
  title: `Run ${id}`,
  createdAt,
  steps: Array.from({ length: steps }, (_, i) => ({ note: `step ${i + 1}` })),
})

let deleted: string[]
beforeEach(() => {
  vi.useFakeTimers()
  deleted = []
  configurePlayground({
    fetchImpl: (async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleted.push(url)
        return new Response(null, { status: 204 })
      }
      return Response.json([
        { name: 'a.json', content: JSON.stringify(run('a', 3, 1)) },
        { name: 'b.json', content: JSON.stringify(run('b', 2, 5)) },
        { name: 'broken.json', content: '{nope' },
      ])
    }) as typeof fetch,
  })
  usePlayground.setState({ runs: [], activeId: null, step: 0, playing: false, speed: 1, status: 'idle' })
  useSettings.setState({ section: 'code' })
})
afterEach(() => vi.useRealTimers())

test('loads saved dry runs, newest first, skipping broken files', async () => {
  await pg().load()
  expect(pg().runs.map((r) => r.id)).toEqual(['b', 'a'])
  expect(pg().activeId).toBe('b')
})

test('a new dry run from Claude goes to the top; opening it switches to the Playground at step 1', () => {
  pg().add(run('new', 4, 9))
  expect(pg().runs[0].id).toBe('new')
  pg().open('new')
  expect(pg()).toMatchObject({ activeId: 'new', step: 0, playing: false })
  expect(useSettings.getState().section).toBe('dryruns')
})

test('stepping stays within the dry run', () => {
  pg().add(run('x', 3))
  pg().open('x')
  pg().prev()
  expect(pg().step).toBe(0)
  pg().next()
  pg().next()
  pg().next()
  expect(pg().step).toBe(2)
  pg().goTo(-5)
  expect(pg().step).toBe(0)
  pg().goTo(99)
  expect(pg().step).toBe(2)
})

test('play advances on its own at the chosen speed and stops at the end', () => {
  pg().add(run('x', 3))
  pg().open('x')
  pg().setSpeed(2)
  pg().togglePlay()
  expect(pg().playing).toBe(true)
  vi.advanceTimersByTime(600)
  expect(pg().step).toBe(1)
  vi.advanceTimersByTime(600)
  expect(pg().step).toBe(2)
  vi.advanceTimersByTime(600)
  expect(pg().playing).toBe(false)
})

test('play from the last step starts over', () => {
  pg().add(run('x', 2))
  pg().open('x')
  pg().goTo(1)
  pg().togglePlay()
  expect(pg().step).toBe(0)
})

test('deleting removes the file and opens the next one', async () => {
  await pg().load()
  await pg().remove('b')
  expect(deleted).toEqual(['/api/playground/b.json'])
  expect(pg().runs.map((r) => r.id)).toEqual(['a'])
  expect(pg().activeId).toBe('a')
})

test('the built-in example can be opened without Claude', () => {
  pg().openExample()
  const active = pg().runs.find((r) => r.id === pg().activeId)!
  expect(active.steps.length).toBeGreaterThan(5)
  expect(active.code).toBeTruthy()
})
