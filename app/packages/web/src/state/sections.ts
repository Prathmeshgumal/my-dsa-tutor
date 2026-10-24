import { NARROW_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
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

/** Whether a section's list shows: hidden by you, or folded away while Claude is open. On Chats the chat is the page
 * and the Claude panel isn't shown, so nothing folds there. */
export function listVisible(s: { listOpen: Record<Section, boolean>; aiOpen: boolean; foldedForClaude: boolean }, section: Section) {
  if (section === 'chats') return s.listOpen.chats
  return s.listOpen[section] && !(s.aiOpen && s.foldedForClaude)
}

/** As listVisible, and on a narrow window there's no room for a list beside Claude at all. */
export function useListVisible(section: Section): boolean {
  const narrow = useMediaQuery(NARROW_QUERY)
  return useSettings((s) => listVisible(s, section) && !(narrow && s.aiOpen && section !== 'chats'))
}
