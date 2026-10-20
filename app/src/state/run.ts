import { toast } from 'sonner'
import { create } from 'zustand'
import { languageFromFilename } from '@/lib/languages'
import { createJudge0RapidApiRunner } from '@/lib/runner/judge0'
import { startSession, type Session, type SocketLike } from '@/lib/runner/interactive'
import { createPistonRunner } from '@/lib/runner/piston'
import { RunnerError, type CodeRunner, type RunResult } from '@/lib/runner/types'
import { useSettings, type RunnerKind } from './settings'
import { useSettingsDialog } from './settingsDialog'
import { useWorkspace } from './workspace'

export type Connection = 'no_key' | 'connected' | 'failed'

interface RunnerSettings {
  runner: RunnerKind
  apiKey: string
}

export function createRunner({ runner, apiKey }: RunnerSettings): CodeRunner {
  return runner === 'piston' ? createPistonRunner() : createJudge0RapidApiRunner({ apiKey })
}

export function initialConnection({ runner, apiKey }: RunnerSettings): Connection {
  return runner === 'judge0' && !apiKey ? 'no_key' : 'connected'
}

/** One piece of the terminal: what the program printed, or what you typed. */
export interface TerminalChunk {
  kind: 'stdout' | 'stderr' | 'input'
  text: string
}

let deps: { connect?: () => SocketLike } = {}

/** Test seam: the connection interactive runs use. */
export function configureRun(next: typeof deps) {
  deps = next
}

// The program that's running now, if any.
let session: Session | null = null

interface RunState {
  state: 'idle' | 'running' | 'done' | 'error'
  /** While running: compiling first, then the program runs (and may wait for your input). */
  phase: 'compiling' | 'running' | null
  /** The run as a terminal shows it: output and your typed input, in order. */
  terminal: TerminalChunk[]
  result: RunResult | null
  error: RunnerError | null
  connection: Connection
  /** The file the shown result belongs to. */
  lastFile: string | null
  /** The input the shown run was given (what you typed). */
  lastStdin: string
  /**
   * Runs the open file. With Piston it runs like a terminal: output streams in and the program waits
   * for what you type (sendInput). A runner passed in, or Judge0, runs it in one go with no input.
   */
  runActiveFile(runner?: CodeRunner): Promise<void>
  /** Types a line into the running program (Enter included). */
  sendInput(line: string): void
  /** Stops the running program. */
  stop(): void
  /** Shows a run made elsewhere (by Claude) in the output panel. */
  showRun(file: string, result: RunResult, stdin?: string): void
}

export const useRun = create<RunState>()((set, get) => ({
  state: 'idle',
  result: null,
  error: null,
  connection: initialConnection(useSettings.getState()),
  lastFile: null,
  lastStdin: '',
  phase: null,
  terminal: [],

  showRun(file, result, stdin = '') {
    useSettings.getState().setOutputOpen(true)
    set({ state: 'done', result, error: null, lastFile: file, lastStdin: stdin, connection: 'connected', terminal: [], phase: null })
  },

  sendInput(line) {
    if (!session || get().phase !== 'running') return
    session.write(`${line}\n`)
    // Echo it, as a terminal does, so prompts and answers read in order.
    set((s) => ({ terminal: [...s.terminal, { kind: 'input', text: `${line}\n` }], lastStdin: `${s.lastStdin}${line}\n` }))
  },

  stop() {
    session?.stop()
  },

  async runActiveFile(runner) {
    if (get().state === 'running') return
    const file = useWorkspace.getState().activeFile()
    const language = file && languageFromFilename(file.name)
    if (!file || !language) return
    // The result (or error) is about to land in the output panel, so make sure it is visible.
    useSettings.getState().setOutputOpen(true)

    const settings = useSettings.getState()
    if (settings.runner === 'judge0' && !settings.apiKey) {
      const error = new RunnerError('no_key', 'Add your RapidAPI key in Settings to run code.')
      set({ state: 'error', result: null, error, connection: 'no_key' })
      useSettingsDialog.getState().show('no_key')
      return
    }

    set({ state: 'running', error: null, lastFile: file.name, lastStdin: '', terminal: [], phase: 'compiling' })

    if (!runner && settings.runner === 'piston') {
      await new Promise<void>((resolve) => {
        session = startSession({
          language,
          source: file.content,
          fileName: file.name,
          connect: deps.connect,
          onEvent: (event) => {
            if (event.type === 'running') set({ phase: 'running' })
            else if (event.type === 'output') {
              set((s) => {
                const last = s.terminal.at(-1)
                // Join pieces of the same stream so the terminal isn't thousands of tiny spans.
                const terminal =
                  last && last.kind === event.stream
                    ? [...s.terminal.slice(0, -1), { kind: last.kind, text: last.text + event.data }]
                    : [...s.terminal, { kind: event.stream, text: event.data }]
                return { terminal }
              })
            } else if (event.type === 'done') {
              session = null
              const unreachable = event.result.status === 'internal_error' && get().phase === 'compiling'
              if (unreachable) {
                const error = new RunnerError('network', event.result.statusText)
                set({ state: 'error', result: null, error, connection: 'failed', phase: null })
                toast.error(error.message)
              } else set({ state: 'done', result: event.result, connection: 'connected', phase: null })
              resolve()
            }
          },
        })
      })
      return
    }

    try {
      const result = await (runner ?? createRunner(settings)).run({
        language,
        source: file.content,
        stdin: '',
      })
      set({ state: 'done', result, connection: 'connected', phase: null })
    } catch (e) {
      const error = e instanceof RunnerError ? e : new RunnerError('http', `Unexpected error: ${String(e)}`)
      set({ state: 'error', result: null, error, connection: 'failed', phase: null })
      toast.error(error.message)
    }
  },
}))

// A new key or runner means the old connection state no longer applies.
useSettings.subscribe((s, prev) => {
  if (s.apiKey !== prev.apiKey || s.runner !== prev.runner) useRun.setState({ connection: initialConnection(s) })
})
