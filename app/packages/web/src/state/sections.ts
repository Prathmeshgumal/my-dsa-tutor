import { useSettings } from './settings'

/** The five parts of the editor in the left bar. Each is a list on the left and the picked item beside it. */
export type Section = 'problems' | 'code' | 'notes' | 'dryruns' | 'chats'

export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'code', label: 'Code' },
  { id: 'notes', label: 'Notes' },
  { id: 'dryruns', label: 'Dry runs' },
  { id: 'chats', label: 'Chats' },
]

/** Whether a section's list shows: hidden by you, or folded away while Claude is open. */
export function listVisible(s: { listOpen: Record<Section, boolean>; aiOpen: boolean; foldedForClaude: boolean }, section: Section) {
  return s.listOpen[section] && !(s.aiOpen && s.foldedForClaude)
}

export function useListVisible(section: Section): boolean {
  return useSettings((s) => listVisible(s, section))
}
