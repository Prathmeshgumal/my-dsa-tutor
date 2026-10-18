import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'light' | 'dark'
export type RunnerKind = 'piston' | 'judge0'
export type OutputPosition = 'right' | 'bottom'

interface SettingsState {
  apiKey: string
  theme: ThemePref
  panelLayout: number[] | null
  runner: RunnerKind
  outputPosition: OutputPosition
  outputOpen: boolean
  setApiKey(k: string): void
  setTheme(t: ThemePref): void
  setPanelLayout(l: number[]): void
  setRunner(r: RunnerKind): void
  setOutputPosition(p: OutputPosition): void
  setOutputOpen(open: boolean): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      theme: 'system',
      panelLayout: null,
      runner: 'piston',
      outputPosition: 'bottom',
      outputOpen: true,
      setApiKey: (apiKey) => set({ apiKey }),
      setTheme: (theme) => set({ theme }),
      setPanelLayout: (panelLayout) => set({ panelLayout }),
      setRunner: (runner) => set({ runner }),
      setOutputPosition: (outputPosition) => set({ outputPosition }),
      setOutputOpen: (outputOpen) => set({ outputOpen }),
    }),
    { name: 'dsa-editor:settings' },
  ),
)
