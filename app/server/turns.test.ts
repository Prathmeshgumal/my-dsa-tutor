// @vitest-environment node
import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { createTurns } from './turns'

/** Just enough of a response to watch a turn. */
function fakeRes() {
  const res = Object.assign(new EventEmitter(), { chunks: [] as string[], ended: false })
  return Object.assign(res, {
    writeHead: () => res,
    write: (c: string) => res.chunks.push(c),
    end: () => {
      res.ended = true
    },
  })
}

afterEach(() => vi.useRealTimers())

test('a turn nobody watches is stopped after a while; watching keeps it going', async () => {
  vi.useFakeTimers()
  const turns = createTurns({ unwatchedMs: 1000 })
  let signal!: AbortSignal
  const id = turns.start(async (_send, s) => {
    signal = s
    await new Promise((r) => s.addEventListener('abort', r))
  })
  const res = fakeRes()
  turns.watch(id, 0, res as unknown as ServerResponse)
  vi.advanceTimersByTime(5000)
  expect(signal.aborted).toBe(false)
  res.emit('close')
  vi.advanceTimersByTime(999)
  expect(signal.aborted).toBe(false)
  vi.advanceTimersByTime(1)
  expect(signal.aborted).toBe(true)
})

test('a finished turn can still be replayed for a while, then it is gone', async () => {
  vi.useFakeTimers()
  const turns = createTurns({ keepMs: 1000 })
  const id = turns.start(async (send) => send({ type: 'done' }))
  await vi.waitFor(() => {
    const res = fakeRes()
    turns.watch(id, 0, res as unknown as ServerResponse)
    expect(res.ended).toBe(true)
    expect(res.chunks.join('')).toContain('"type":"done"')
  })
  vi.advanceTimersByTime(1000)
  expect(turns.watch(id, 0, fakeRes() as unknown as ServerResponse)).toBe(false)
})

test('an error thrown by the turn reaches the browser as an error event, Stop does not', async () => {
  const turns = createTurns()
  const failing = turns.start(async () => {
    throw new Error('Claude Code crashed')
  })
  const stopped = turns.start(async (_send, s) => {
    await new Promise((r) => s.addEventListener('abort', r))
    throw new Error('aborted')
  })
  turns.stop(stopped)
  await new Promise((r) => setTimeout(r, 10))
  const a = fakeRes()
  turns.watch(failing, 0, a as unknown as ServerResponse)
  expect(a.chunks.join('')).toContain('Claude Code crashed')
  const b = fakeRes()
  turns.watch(stopped, 0, b as unknown as ServerResponse)
  expect(b.chunks.join('')).not.toContain('"type":"error"')
})
