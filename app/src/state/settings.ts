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
  aiOpen: boolean
  notesOpen: boolean
  /** Width in px of the right-hand panel (Claude / Notes). */
  sidePanelWidth: number
  setApiKey(k: string): void
  setTheme(t: ThemePref): void
  setPanelLayout(l: number[]): void
  setRunner(r: RunnerKind): void
  setOutputPosition(p: OutputPosition): void
  setOutputOpen(open: boolean): void
  /** Claude and Notes share the right side: opening one closes the other. */
  setAiOpen(open: boolean): void
  setNotesOpen(open: boolean): void
  setSidePanelWidth(width: number): void
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
      aiOpen: false,
      notesOpen: false,
      sidePanelWidth: 380,
      setApiKey: (apiKey) => set({ apiKey }),
      setTheme: (theme) => set({ theme }),
      setPanelLayout: (panelLayout) => set({ panelLayout }),
      setRunner: (runner) => set({ runner }),
      setOutputPosition: (outputPosition) => set({ outputPosition }),
      setOutputOpen: (outputOpen) => set({ outputOpen }),
      setAiOpen: (aiOpen) => set(aiOpen ? { aiOpen, notesOpen: false } : { aiOpen }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
      setNotesOpen: (notesOpen) => set(notesOpen ? { notesOpen, aiOpen: false } : { notesOpen }),
    }),
    { name: 'dsa-editor:settings' },
  ),
)
