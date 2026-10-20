import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useFilesPanel } from './filesPanel'

export type ThemePref = 'system' | 'light' | 'dark'
export type RunnerKind = 'piston' | 'judge0'
export type OutputPosition = 'right' | 'bottom'
/** The main area: the code editor, a practice problem, or the Playground with dry-run visualizations. */
export type Screen = 'editor' | 'problem' | 'playground'

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
  /** The list of dry runs on the left of the Playground. */
  playgroundListOpen: boolean
  /** The list of problems on the left of the Problems screen. */
  problemListOpen: boolean
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
  /**
   * The left-bar button for a screen: switches to it, or if it's already showing, hides/shows its list
   * (the Editor's list is the files).
   */
  pressScreen(screen: Screen): void
  setPlaygroundListOpen(open: boolean): void
  setProblemListOpen(open: boolean): void
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
      playgroundListOpen: true,
      problemListOpen: true,
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
      pressScreen: (screen) =>
        set((s) => {
          if (s.screen !== screen) return { screen }
          if (screen === 'playground') return { playgroundListOpen: !s.playgroundListOpen }
          if (screen === 'problem') return { problemListOpen: !s.problemListOpen }
          const files = useFilesPanel.getState()
          files.setOpen(!files.open)
          return {}
        }),
      setPlaygroundListOpen: (playgroundListOpen) => set({ playgroundListOpen }),
      setProblemListOpen: (problemListOpen) => set({ problemListOpen }),
      setPlaygroundLayout: (area, layout) => set((s) => ({ playgroundLayout: { ...s.playgroundLayout, [area]: layout } })),
      setNotesOpen: (notesOpen) => set(notesOpen ? { notesOpen, aiOpen: false } : { notesOpen }),
    }),
    { name: 'dsa-editor:settings' },
  ),
)
