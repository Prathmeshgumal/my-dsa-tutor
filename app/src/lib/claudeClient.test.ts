import { streamChat, type ChatEvent } from './claudeClient'

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

const request = { message: 'hi', sessionId: null, context: { activeFile: null, openFiles: [] } }

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
  expect(events).toEqual([{ type: 'error', message: 'Couldn’t reach Claude Code (HTTP 404). Is the editor running with npm run dev?' }])
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
