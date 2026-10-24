import type { FolderArea, FolderEvent } from '@dsa/core/folderEvents'
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
  onerror: (() => void) | null
  close(): void
}

/**
 * How long to wait before reconnecting, after each failed try in a row. The browser's own retry is every
 * 3 seconds forever, which fills the console while the server is down.
 */
const RETRY_MS = [3000, 6000, 12000, 30000, 60000]

/**
 * Listens for outside changes to the data folders and reloads what changed. After a dropped connection
 * (server restart, laptop asleep) it reloads everything, since changes may have been missed meanwhile.
 */
export function startFolderSync(open?: () => SourceLike): () => void {
  if (!open && typeof EventSource === 'undefined') return () => {}
  const connect = open ?? (() => new EventSource('/api/events') as unknown as SourceLike)
  let connectedBefore = false
  let failures = 0
  let source: SourceLike
  let retry: ReturnType<typeof setTimeout> | undefined

  const listen = () => {
    source = connect()
    source.onopen = () => {
      failures = 0
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
    source.onerror = () => {
      source.close()
      retry = setTimeout(listen, RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)])
    }
  }

  listen()
  return () => {
    clearTimeout(retry)
    source.close()
  }
}
