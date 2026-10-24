import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { stateStorage } from '@/lib/stateSync'
import { listVisible, type Section } from './sections'

export type ThemePref = 'system' | 'light' | 'dark'
export type OutputPosition = 'right' | 'bottom'

const ALL_LISTS_OPEN: Record<Section, boolean> = { problems: true, code: true, notes: true, dryruns: true, chats: true }

interface SettingsState {
  theme: ThemePref
  panelLayout: number[] | null
  outputPosition: OutputPosition
  outputOpen: boolean
  aiOpen: boolean
  /** Width in px of the right-hand panel (Claude). */
  sidePanelWidth: number
  /** Width in px of the list on the left, the same for every section. */
  listWidth: number
  section: Section
  /** Each section's list, unless you hid it. */
  listOpen: Record<Section, boolean>
  /** Opening Claude folds the lists away to make room; showing a list beside Claude unfolds them. */
  foldedForClaude: boolean
  /** Playground panel sizes (percent), per area: list|main, and code|drawing side by side or stacked. */
  playgroundLayout: Record<string, Record<string, number>>
  setTheme(t: ThemePref): void
  setPanelLayout(l: number[]): void
  setOutputPosition(p: OutputPosition): void
  setOutputOpen(open: boolean): void
  setAiOpen(open: boolean): void
  setSidePanelWidth(width: number): void
  setListWidth(width: number): void
  setSection(section: Section): void
  /** The left-bar button for a section: switches to it, or if it's already showing, hides/shows its list. */
  pressSection(section: Section): void
  setListOpen(section: Section, open: boolean): void
  setPlaygroundLayout(area: string, layout: Record<string, number>): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      panelLayout: null,
      outputPosition: 'bottom',
      outputOpen: true,
      aiOpen: false,
      sidePanelWidth: 380,
      listWidth: 240,
      section: 'code',
      listOpen: ALL_LISTS_OPEN,
      foldedForClaude: false,
      playgroundLayout: {},
      setTheme: (theme) => set({ theme }),
      setPanelLayout: (panelLayout) => set({ panelLayout }),
      setOutputPosition: (outputPosition) => set({ outputPosition }),
      setOutputOpen: (outputOpen) => set({ outputOpen }),
      setAiOpen: (aiOpen) => set(aiOpen ? { aiOpen, foldedForClaude: true } : { aiOpen }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
      setListWidth: (listWidth) => set({ listWidth }),
      setSection: (section) => set({ section }),
      pressSection: (section) =>
        set((s) => {
          if (s.section !== section) return { section }
          return { listOpen: { ...s.listOpen, [section]: !listVisible(s, section) }, foldedForClaude: false }
        }),
      setListOpen: (section, open) =>
        set((s) => ({ listOpen: { ...s.listOpen, [section]: open }, foldedForClaude: false })),
      setPlaygroundLayout: (area, layout) => set((s) => ({ playgroundLayout: { ...s.playgroundLayout, [area]: layout } })),
    }),
    {
      name: 'dsa-editor:settings',
      // Kept on disk too (see lib/stateSync).
      storage: createJSONStorage(() => stateStorage),
      // v1 dropped Judge0: forget the runner choice and wipe any RapidAPI key saved in this browser.
      // v2 turned the three screens and the Notes panel into five sections.
      version: 2,
      migrate: (saved) => {
        const { apiKey: _key, runner: _runner, ...rest } = (saved ?? {}) as Record<string, unknown>
        return toSections(rest) as unknown as SettingsState
      },
    },
  ),
)

const OLD_SCREENS: Record<string, Section> = { editor: 'code', problem: 'problems', playground: 'dryruns' }

/** Settings from before v2: `screen`, `notesOpen` (a panel beside the editor) and two list switches. */
function toSections(saved: Record<string, unknown>): Record<string, unknown> {
  const { screen = 'editor', notesOpen, problemListOpen, playgroundListOpen, playgroundLayout, ...rest } = saved
  const listOpen = { ...ALL_LISTS_OPEN }
  if (problemListOpen === false) listOpen.problems = false
  if (playgroundListOpen === false) listOpen.dryruns = false
  const section = screen === 'editor' && notesOpen === true ? 'notes' : (OLD_SCREENS[String(screen)] ?? 'code')
  // Claude was open: start with the lists folded away, as opening it would.
  return { ...rest, section, listOpen, foldedForClaude: rest.aiOpen === true, playgroundLayout: layoutsWithoutLists(playgroundLayout) }
}

/** The Problems and Playground lists used to sit inside their resizable panels; their sizes are dropped, and the
 * problem's sizes without the list carry on as 'problem-main'. */
function layoutsWithoutLists(saved: unknown): Record<string, Record<string, number>> {
  if (!saved || typeof saved !== 'object') return {}
  const {
    'list-main': _list,
    'problem-outer': _outer,
    'problem-outer-no-list': noList,
    ...rest
  } = saved as Record<string, Record<string, number>>
  return noList && !rest['problem-main'] ? { ...rest, 'problem-main': noList } : rest
}
