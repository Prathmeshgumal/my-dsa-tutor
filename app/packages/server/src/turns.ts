// Claude's replies ("turns") run on the server independently of the browser connection that started them.
// Every event is kept, numbered, so a browser that lost its connection (or reloaded the page) can
// reconnect and pick up where it left off. A turn ends when Claude finishes or the user presses Stop.
import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import type { ChatEvent } from '@dsa/core/chatEvents'

type Send = (event: ChatEvent) => void

interface Turn {
  events: ChatEvent[]
  done: boolean
  abort: AbortController
  listeners: Set<ServerResponse>
  /** Cleanup timer: drops a finished turn, or stops one nobody has watched for a long time. */
  timer?: ReturnType<typeof setTimeout>
}

export interface TurnOptions {
  /** How long a finished turn's events stay available for a reconnect. */
  keepMs?: number
  /** A running turn nobody is connected to is stopped after this long (it may be waiting on an approval). */
  unwatchedMs?: number
}

export function createTurns({ keepMs = 10 * 60_000, unwatchedMs = 15 * 60_000 }: TurnOptions = {}) {
  const turns = new Map<string, Turn>()

  const write = (res: ServerResponse, index: number, event: ChatEvent) => res.write(`id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`)

  /** Starts or stops the cleanup timer to match whether anyone is watching. */
  function schedule(id: string) {
    const turn = turns.get(id)
    if (!turn) return
    clearTimeout(turn.timer)
    if (turn.done) turn.timer = setTimeout(() => turns.delete(id), keepMs)
    else if (turn.listeners.size === 0) turn.timer = setTimeout(() => turn.abort.abort(), unwatchedMs)
  }

  return {
    /** Starts a turn; `run` gets a send function and the signal Stop aborts. Returns the turn's id. */
    start(run: (send: Send, signal: AbortSignal) => Promise<void>): string {
      const id = randomUUID()
      const turn: Turn = { events: [], done: false, abort: new AbortController(), listeners: new Set() }
      turns.set(id, turn)
      const send: Send = (event) => {
        if (turn.done) return
        const index = turn.events.push(event) - 1
        for (const res of turn.listeners) write(res, index, event)
      }
      send({ type: 'turn', turnId: id })
      void run(send, turn.abort.signal)
        .catch((e) => {
          if (!turn.abort.signal.aborted) send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
        })
        .finally(() => {
          turn.done = true
          for (const res of turn.listeners) res.end()
          turn.listeners.clear()
          schedule(id)
        })
      schedule(id)
      return id
    },

    /** Streams the turn's events after the `after`-th one, then live ones. False if there's no such turn. */
    watch(id: string, after: number, res: ServerResponse): boolean {
      const turn = turns.get(id)
      if (!turn) return false
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      for (let i = Math.max(0, after); i < turn.events.length; i++) write(res, i, turn.events[i])
      if (turn.done) {
        res.end()
        return true
      }
      turn.listeners.add(res)
      schedule(id)
      res.on('close', () => {
        turn.listeners.delete(res)
        schedule(id)
      })
      return true
    },

    /** Stops a running turn (the Stop button). */
    stop(id: string): boolean {
      const turn = turns.get(id)
      turn?.abort.abort()
      return Boolean(turn)
    },
  }
}

export type Turns = ReturnType<typeof createTurns>
