import { toast } from 'sonner'
import { create } from 'zustand'
import { languageFromFilename } from '@/lib/languages'
import { createJudge0RapidApiRunner } from '@/lib/runner/judge0'
import { RunnerError, type CodeRunner, type RunResult } from '@/lib/runner/types'
import { useSettings } from './settings'
import { useSettingsDialog } from './settingsDialog'
import { useWorkspace } from './workspace'

export type Connection = 'no_key' | 'connected' | 'failed'

interface RunState {
  state: 'idle' | 'running' | 'done' | 'error'
  result: RunResult | null
  error: RunnerError | null
  connection: Connection
  runActiveFile(runner?: CodeRunner): Promise<void>
}

export const useRun = create<RunState>()((set, get) => ({
  state: 'idle',
  result: null,
  error: null,
  connection: useSettings.getState().apiKey ? 'connected' : 'no_key',

  async runActiveFile(runner) {
    if (get().state === 'running') return
    const file = useWorkspace.getState().activeFile()
    const language = file && languageFromFilename(file.name)
    if (!file || !language) return

    const { apiKey } = useSettings.getState()
    if (!apiKey) {
      const error = new RunnerError('no_key', 'Add your RapidAPI key in Settings to run code.')
      set({ state: 'error', result: null, error, connection: 'no_key' })
      useSettingsDialog.getState().show('no_key')
      return
    }

    set({ state: 'running', error: null })
    try {
      const result = await (runner ?? createJudge0RapidApiRunner({ apiKey })).run({
        language,
        source: file.content,
        stdin: '',
      })
      set({ state: 'done', result, connection: 'connected' })
    } catch (e) {
      const error = e instanceof RunnerError ? e : new RunnerError('http', `Unexpected error: ${String(e)}`)
      set({ state: 'error', result: null, error, connection: 'failed' })
      toast.error(error.message)
    }
  },
}))

// A new key means the old connection state no longer applies.
useSettings.subscribe((s, prev) => {
  if (s.apiKey !== prev.apiKey) useRun.setState({ connection: s.apiKey ? 'connected' : 'no_key' })
})
