import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'light' | 'dark'
export type RunnerKind = 'piston' | 'judge0'
export type OutputPosition = 'right' | 'bottom'
/** The main area: the code editor, or the Playground with dry-run visualizations. */
export type Screen = 'editor' | 'playground'

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
  screen: Screen
  /** Playground panel sizes (percent), per area: list|main, and code|drawing side by side or stacked. */
  playgroundLayout: Record<string, Record<string, number>>
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
  setScreen(screen: Screen): void
  setPlaygroundLayout(area: string, layout: Record<string, number>): void
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
      screen: 'editor',
      playgroundLayout: {},
      setApiKey: (apiKey) => set({ apiKey }),
      setTheme: (theme) => set({ theme }),
      setPanelLayout: (panelLayout) => set({ panelLayout }),
      setRunner: (runner) => set({ runner }),
      setOutputPosition: (outputPosition) => set({ outputPosition }),
      setOutputOpen: (outputOpen) => set({ outputOpen }),
      setAiOpen: (aiOpen) => set(aiOpen ? { aiOpen, notesOpen: false } : { aiOpen }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
      setScreen: (screen) => set({ screen }),
      setPlaygroundLayout: (area, layout) => set((s) => ({ playgroundLayout: { ...s.playgroundLayout, [area]: layout } })),
      setNotesOpen: (notesOpen) => set(notesOpen ? { notesOpen, aiOpen: false } : { notesOpen }),
    }),
    { name: 'dsa-editor:settings' },
  ),
)
