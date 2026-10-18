import type { ChatEvent, ChatRequest } from './chatEvents'

export type { ChatEvent }

/** Sends one chat turn to the dev server and calls `onEvent` for each streamed event. Never throws. */
export async function streamChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  { fetchImpl = fetch, signal }: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<void> {
  try {
    const res = await fetchImpl('/api/claude/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!res.ok || !res.body) {
      onEvent({
        type: 'error',
        message: `Couldn’t reach Claude Code (HTTP ${res.status}). Is the editor running with npm run dev?`,
      })
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
        if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)) as ChatEvent)
      }
    }
  } catch (e) {
    if (signal?.aborted) return
    onEvent({ type: 'error', message: `Couldn’t reach Claude Code: ${e instanceof Error ? e.message : String(e)}` })
  }
}
