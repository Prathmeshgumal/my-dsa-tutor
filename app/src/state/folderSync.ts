import type { FolderArea, FolderEvent } from '@/lib/folderEvents'
import { flushAutosave } from './autosave'
import { refreshFromDisk } from './hydrate'
import { useNotes } from './notes'
import { usePlayground } from './playground'
import { useProblems } from './problems'

/** What to reload when a data folder changes outside the editor (VS Code, git, a script). */
const RELOAD: Record<FolderArea, () => Promise<void>> = {
  // Save what you're typing first, so the reload compares against what's really on disk.
  files: async () => {
    await flushAutosave()
    await refreshFromDisk()
  },
  // Notes and dry runs load when first opened; until then there's nothing to refresh.
  notes: async () => {
    if (useNotes.getState().status !== 'idle') await useNotes.getState().load()
  },
  playground: async () => {
    if (usePlayground.getState().status !== 'idle') await usePlayground.getState().load()
  },
  problems: () => useProblems.getState().load(),
}

interface SourceLike {
  onmessage: ((e: { data: string }) => void) | null
  onopen: (() => void) | null
  close(): void
}

/**
 * Listens for outside changes to the data folders and reloads what changed. After a dropped connection
 * (server restart, laptop asleep) it reloads everything, since changes may have been missed meanwhile.
 */
export function startFolderSync(open?: () => SourceLike): () => void {
  if (!open && typeof EventSource === 'undefined') return () => {}
  const source = open ? open() : (new EventSource('/api/events') as unknown as SourceLike)
  let connectedBefore = false
  source.onopen = () => {
    if (connectedBefore) for (const reload of Object.values(RELOAD)) void reload()
    connectedBefore = true
  }
  source.onmessage = (e) => {
    try {
      const { area } = JSON.parse(e.data) as FolderEvent
      void RELOAD[area]?.()
    } catch {
      // not an event we know
    }
  }
  return () => source.close()
}
