import { toast } from 'sonner'
import { create } from 'zustand'
import { languageFromFilename } from '@/lib/languages'
import { createJudge0RapidApiRunner } from '@/lib/runner/judge0'
import { createPistonRunner } from '@/lib/runner/piston'
import { RunnerError, type CodeRunner, type RunResult } from '@/lib/runner/types'
import { useSettings, type RunnerKind } from './settings'
import { useSettingsDialog } from './settingsDialog'
import { useStdin } from './stdin'
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

interface RunState {
  state: 'idle' | 'running' | 'done' | 'error'
  result: RunResult | null
  error: RunnerError | null
  connection: Connection
  /** The file the shown result belongs to. */
  lastFile: string | null
  /** The input the shown run was given. */
  lastStdin: string
  runActiveFile(runner?: CodeRunner): Promise<void>
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

  showRun(file, result, stdin = '') {
    useSettings.getState().setOutputOpen(true)
    set({ state: 'done', result, error: null, lastFile: file, lastStdin: stdin, connection: 'connected' })
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

    const stdin = useStdin.getState().inputs[file.id] ?? ''
    set({ state: 'running', error: null, lastFile: file.name, lastStdin: stdin })
    try {
      const result = await (runner ?? createRunner(settings)).run({
        language,
        source: file.content,
        stdin,
      })
      set({ state: 'done', result, connection: 'connected' })
    } catch (e) {
      const error = e instanceof RunnerError ? e : new RunnerError('http', `Unexpected error: ${String(e)}`)
      set({ state: 'error', result: null, error, connection: 'failed' })
      toast.error(error.message)
    }
  },
}))

// A new key or runner means the old connection state no longer applies.
useSettings.subscribe((s, prev) => {
  if (s.apiKey !== prev.apiKey || s.runner !== prev.runner) useRun.setState({ connection: initialConnection(s) })
})
