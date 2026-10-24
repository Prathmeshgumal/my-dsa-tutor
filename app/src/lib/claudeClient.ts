import type { ChatEvent, ChatRequest } from './chatEvents'

export type { ChatEvent }

/** Called with each event and its number in the reply (for reconnecting after it). */
export type OnChatEvent = (event: ChatEvent, id?: number) => void

interface StreamOptions {
  fetchImpl?: typeof fetch
  /** Stop: ends the reply on the server too. */
  signal?: AbortSignal
  /** Waits between reconnect attempts (test seam). */
  sleep?: (ms: number) => Promise<void>
}

/** Waits before each reconnect attempt; the reply gives up after the last one. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000, 15000]

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Sends one chat turn to the dev server and calls `onEvent` for each streamed event. Never throws. */
export function streamChat(request: ChatRequest, onEvent: OnChatEvent, options: StreamOptions = {}): Promise<void> {
  const { fetchImpl = fetch, signal } = options
  return follow(
    () =>
      fetchImpl('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      }),
    null,
    0,
    onEvent,
    options,
  )
}

/** Reconnects to a reply that was still running (e.g. after the page reloaded), after the events already seen. */
export function resumeChat(turnId: string, seen: number, onEvent: OnChatEvent, options: StreamOptions = {}): Promise<void> {
  const { fetchImpl = fetch, signal } = options
  return follow(() => fetchImpl(`/api/claude/turns/${encodeURIComponent(turnId)}?after=${seen}`, { signal }), turnId, seen, onEvent, options)
}

async function follow(
  open: () => Promise<Response>,
  knownTurn: string | null,
  seen: number,
  onEvent: OnChatEvent,
  { fetchImpl = fetch, signal, sleep = wait }: StreamOptions,
): Promise<void> {
  let turnId = knownTurn
  let lastId = seen
  let finished = false
  let attempt = 0
  const stopOnServer = () => {
    if (turnId) void fetchImpl(`/api/claude/turns/${encodeURIComponent(turnId)}/stop`, { method: 'POST' }).catch(() => {})
  }
  signal?.addEventListener('abort', stopOnServer, { once: true })

  let connect = open
  try {
    for (;;) {
      try {
        const res = await connect()
        if (res.status === 404 && turnId) {
          onEvent({ type: 'error', message: 'The reply was cut off: the editor restarted while Claude was working.' }, lastId)
          return
        }
        if (!res.ok || !res.body) {
          onEvent({ type: 'error', message: `Couldn’t reach Claude Code (HTTP ${res.status}). Is the editor running?` }, lastId)
          return
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          let end: number
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            const data = /^data: (.*)$/m.exec(chunk)?.[1]
            if (!data) continue
            const id = Number(/^id: (\d+)$/m.exec(chunk)?.[1] ?? lastId + 1)
            const event = JSON.parse(data) as ChatEvent
            lastId = id
            attempt = 0
            if (event.type === 'turn') turnId = event.turnId
            if (event.type === 'done' || event.type === 'error') finished = true
            onEvent(event, id)
          }
        }
      } catch (e) {
        if (signal?.aborted) return
        // Before the reply started there's nothing to reconnect to.
        if (!turnId) {
          onEvent({ type: 'error', message: `Couldn’t reach Claude Code: ${e instanceof Error ? e.message : String(e)}` }, lastId)
          return
        }
      }
      if (finished || signal?.aborted) return
      // The connection dropped mid-reply (server busy, network blip, laptop asleep): pick up where it stopped.
      if (!turnId || attempt >= RETRY_MS.length) {
        onEvent({ type: 'error', message: 'Lost the connection to Claude Code. Is the editor still running?' }, lastId)
        return
      }
      await sleep(RETRY_MS[attempt++])
      if (signal?.aborted) return
      const id = turnId
      connect = () => fetchImpl(`/api/claude/turns/${encodeURIComponent(id)}?after=${lastId}`, { signal })
    }
  } finally {
    signal?.removeEventListener('abort', stopOnServer)
  }
}
