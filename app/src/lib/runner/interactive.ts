// Runs a program the way a terminal does: output streams in as it's printed, and the program waits
// while you type its input. Uses Piston's WebSocket API (/api/v2/connect), proxied at /piston/connect.
import type { Language } from '../languages.ts'
import type { RunResult } from './types.ts'

/** How long a program may run, including time spent waiting for you to type. */
export const INTERACTIVE_TIMEOUT_MS = 120_000

export type SessionEvent =
  | { type: 'compiling' }
  | { type: 'running' }
  | { type: 'output'; stream: 'stdout' | 'stderr'; data: string }
  /** The program has ended; result summarises the whole run. */
  | { type: 'done'; result: RunResult }

export interface Session {
  /** Sends text to the program's input, e.g. "5\n". */
  write(text: string): void
  /** Stops the program. */
  stop(): void
}

/** The bit of WebSocket a session needs (a fake in tests). */
export interface SocketLike {
  onopen: (() => void) | null
  onmessage: ((e: { data: string }) => void) | null
  onclose: ((e: { code: number; reason: string }) => void) | null
  onerror: (() => void) | null
  send(data: string): void
  close(): void
}

// Piston's g++ wrapper chmods a.out even when compilation failed; that line is noise.
const CHMOD_NOISE = /^chmod: cannot access 'a\.out'.*\n?/m

/**
 * Programs print into a buffer when they aren't attached to a real terminal, so a printf prompt could
 * show only after the input it asks for. For C++, switch that off before main runs; #line keeps
 * compiler messages pointing at the student's own lines.
 */
export function prepareSource(language: Language, source: string, fileName: string): string {
  if (language.id !== 'cpp') return source
  return [
    '#include <cstdio>',
    'static const int dsa_unbuffered_output = (std::setvbuf(stdout, nullptr, _IONBF, 0), 0);',
    `#line 1 "${fileName.replace(/["\\]/g, '')}"`,
    source,
  ].join('\n')
}

interface Options {
  language: Language
  source: string
  fileName: string
  onEvent(event: SessionEvent): void
  /** Opens the socket; the default connects through the dev server's /piston proxy. */
  connect?: () => SocketLike
}

export function startSession({ language, source, fileName, onEvent, connect }: Options): Session {
  const socket =
    connect?.() ??
    (new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/piston/connect`) as SocketLike)
  let stage: 'connecting' | 'compile' | 'run' | 'done' = 'connecting'
  let stdout = ''
  let stderr = ''
  let compileOutput = ''
  let stoppedByUser = false

  const finish = (result: Omit<RunResult, 'stdout' | 'stderr' | 'compileOutput' | 'memoryKb' | 'timeMs'> & Partial<RunResult>) => {
    if (stage === 'done') return
    stage = 'done'
    onEvent({
      type: 'done',
      result: {
        stdout,
        stderr,
        compileOutput: compileOutput.replace(CHMOD_NOISE, ''),
        // The time would mostly be you typing, so it isn't shown.
        timeMs: null,
        memoryKb: null,
        ...result,
      },
    })
    socket.close()
  }

  socket.onopen = () =>
    socket.send(
      JSON.stringify({
        type: 'init',
        language: language.piston.language,
        version: '*',
        files: [{ name: language.piston.fileName, content: prepareSource(language, source, fileName) }],
        run_timeout: INTERACTIVE_TIMEOUT_MS,
      }),
    )

  socket.onmessage = (e) => {
    let m: { type?: string; stage?: string; stream?: string; data?: string; code?: number | null; signal?: string | null; message?: string }
    try {
      m = JSON.parse(e.data)
    } catch {
      return
    }
    if (m.type === 'stage' && m.stage === 'compile') {
      stage = 'compile'
      onEvent({ type: 'compiling' })
    } else if (m.type === 'stage' && m.stage === 'run') {
      stage = 'run'
      onEvent({ type: 'running' })
    } else if (m.type === 'data' && typeof m.data === 'string') {
      if (stage === 'compile') {
        compileOutput += m.data
        return
      }
      const stream = m.stream === 'stderr' ? 'stderr' : 'stdout'
      if (stream === 'stdout') stdout += m.data
      else stderr += m.data
      onEvent({ type: 'output', stream, data: m.data })
    } else if (m.type === 'exit' && m.stage === 'compile' && m.code !== 0) {
      finish({ status: 'compile_error', statusText: 'Compilation Error', stdout: '' })
    } else if (m.type === 'exit' && m.stage === 'run') {
      if (stoppedByUser) finish({ status: 'runtime_error', statusText: 'Stopped' })
      else if (m.signal === 'SIGKILL') finish({ status: 'time_limit', statusText: `Stopped after ${INTERACTIVE_TIMEOUT_MS / 60_000} minutes` })
      else if (m.signal) finish({ status: 'runtime_error', statusText: `Runtime error (${m.signal})` })
      else if (m.code === 139) finish({ status: 'runtime_error', statusText: 'Runtime error (segmentation fault)' })
      else if (m.code !== 0) finish({ status: 'runtime_error', statusText: `Runtime error (exit ${m.code})` })
      else finish({ status: 'success', statusText: 'Accepted' })
    } else if (m.type === 'error') {
      finish({ status: 'internal_error', statusText: m.message ? `Piston: ${m.message}` : 'Piston error' })
    }
  }

  socket.onerror = () => {}
  socket.onclose = (e) => {
    if (stage === 'done') return
    if (stoppedByUser) finish({ status: 'runtime_error', statusText: 'Stopped' })
    else if (stage === 'connecting') finish({ status: 'internal_error', statusText: 'Couldn’t reach Piston — start it with “docker compose up -d”.' })
    else finish({ status: 'internal_error', statusText: `Connection closed${e.reason ? `: ${e.reason}` : ''}` })
  }

  return {
    write(text) {
      if (stage === 'run') socket.send(JSON.stringify({ type: 'data', stream: 'stdin', data: text }))
    },
    stop() {
      if (stage === 'done') return
      stoppedByUser = true
      if (stage === 'run') socket.send(JSON.stringify({ type: 'signal', signal: 'SIGKILL' }))
      // Piston (as of its current image) never passes the signal on to the program, and keeps a program
      // whose socket closed until its time limit. So the run ends here; Piston drops the program later.
      finish({ status: 'runtime_error', statusText: 'Stopped' })
    },
  }
}
