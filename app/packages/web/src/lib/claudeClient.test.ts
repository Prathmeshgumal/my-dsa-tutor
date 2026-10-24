import { resumeChat, streamChat, type ChatEvent } from './claudeClient'

function sseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

const request = { message: 'hi', sessionId: null, context: { activeFile: null, openFiles: [], lastRun: null, openNote: null, openProblem: null } }

test('posts the request and yields events, even when split across chunks', async () => {
  const fetchImpl = vi.fn(async () =>
    sseResponse(['data: {"type":"session","sessionId":"s1"}\n\ndata: {"type":"te', 'xt","text":"Hel"}\n\n', 'data: {"type":"done"}\n\n']),
  )
  const events: ChatEvent[] = []
  await streamChat(request, (e) => events.push(e), { fetchImpl })
  expect(events).toEqual([{ type: 'session', sessionId: 's1' }, { type: 'text', text: 'Hel' }, { type: 'done' }])
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/claude/chat')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string)).toEqual(request)
})

test('HTTP failure becomes an error event', async () => {
  const events: ChatEvent[] = []
  await streamChat(request, (e) => events.push(e), { fetchImpl: vi.fn(async () => new Response('nope', { status: 404 })) })
  expect(events).toEqual([{ type: 'error', message: 'Couldn’t reach Claude Code (HTTP 404). Is the editor running?' }])
})

test('network failure becomes an error event', async () => {
  const events: ChatEvent[] = []
  await streamChat(request, (e) => events.push(e), {
    fetchImpl: vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }),
  })
  expect(events[0]).toMatchObject({ type: 'error' })
})

test('aborting stops quietly (no error event)', async () => {
  const controller = new AbortController()
  const events: ChatEvent[] = []
  const fetchImpl = vi.fn(async () => {
    controller.abort()
    throw new DOMException('aborted', 'AbortError')
  })
  await streamChat(request, (e) => events.push(e), { fetchImpl, signal: controller.signal })
  expect(events).toEqual([])
})

const ev = (id: number, event: object) => `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`
const noSleep = async () => {}

test('a dropped connection reconnects after the last event seen, and nothing is repeated', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(sseResponse([ev(1, { type: 'turn', turnId: 't1' }), ev(2, { type: 'text', text: 'a' })]))
    .mockResolvedValueOnce(sseResponse([ev(3, { type: 'text', text: 'b' }), ev(4, { type: 'done' })]))
  const events: [ChatEvent, number][] = []
  await streamChat(request, (e, id) => events.push([e, id!]), { fetchImpl, sleep: noSleep })
  expect(events.map(([e, id]) => [e.type, id])).toEqual([
    ['turn', 1],
    ['text', 2],
    ['text', 3],
    ['done', 4],
  ])
  expect(fetchImpl.mock.calls[1][0]).toBe('/api/claude/turns/t1?after=2')
})

test('gives up with a clear error when the server stays unreachable', async () => {
  const fetchImpl = vi.fn().mockResolvedValueOnce(sseResponse([ev(1, { type: 'turn', turnId: 't1' })]))
  fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'))
  const events: ChatEvent[] = []
  await streamChat(request, (e) => events.push(e), { fetchImpl, sleep: noSleep })
  expect(events.at(-1)).toEqual({ type: 'error', message: 'Lost the connection to Claude Code. Is the editor still running?' })
  expect(fetchImpl.mock.calls.length).toBeGreaterThan(2)
})

test('a reply the server no longer knows (it restarted) says so', async () => {
  const events: ChatEvent[] = []
  await resumeChat('t1', 5, (e) => events.push(e), { fetchImpl: vi.fn(async () => new Response('{}', { status: 404 })) })
  expect(events).toEqual([{ type: 'error', message: 'The reply was cut off: the editor restarted while Claude was working.' }])
})

test('resuming asks only for the events after the ones already seen', async () => {
  const fetchImpl = vi.fn(async () => sseResponse([ev(6, { type: 'done' })]))
  const events: number[] = []
  await resumeChat('t 1', 5, (_e, id) => events.push(id!), { fetchImpl })
  expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('/api/claude/turns/t%201?after=5')
  expect(events).toEqual([6])
})

test('Stop also stops the reply on the server', async () => {
  const controller = new AbortController()
  let push!: (s: string) => void
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      push = (s) => c.enqueue(new TextEncoder().encode(s))
    },
  })
  const fetchImpl = vi.fn(async (url: string) =>
    url === '/api/claude/chat' ? new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }) : new Response(null, { status: 204 }),
  )
  const done = streamChat(request, (e) => e.type === 'turn' && controller.abort(), {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    signal: controller.signal,
  })
  push(ev(1, { type: 'turn', turnId: 't9' }))
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/api/claude/turns/t9/stop', { method: 'POST' }))
  void body.cancel().catch(() => {})
  void done
})
