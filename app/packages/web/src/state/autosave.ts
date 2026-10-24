import { syncToDisk } from '@/lib/diskStore'
import { saveWorkspace, type CodeFile } from '@/lib/storage'
import { useWorkspace } from './workspace'

const DEBOUNCE_MS = 500

let flushNow: (() => Promise<void>) | null = null
let adopt: ((files: CodeFile[]) => void) | null = null

/**
 * Tells autosave these files are exactly what's on disk now (just read back from it), so it doesn't
 * write them out again.
 */
export function adoptDiskFiles(files: CodeFile[]): void {
  adopt?.(files)
}

/** Writes any pending change immediately and resolves once it is saved (used before asking Claude). */
export function flushAutosave(): Promise<void> {
  return flushNow?.() ?? Promise.resolve()
}

interface DiskOptions {
  /** Files as they currently are on disk. */
  synced: CodeFile[]
  fetchImpl?: typeof fetch
}

/**
 * Persists the workspace 500 ms after the last change, and immediately when the page is hidden or closed.
 * Always writes to localStorage (tabs + a backup copy); with `disk`, also writes changed files to the solutions folder.
 */
export function startAutosave({ disk }: { disk?: DiskOptions } = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let synced = disk?.synced ?? []
  let queue = Promise.resolve()

  const save = ({ keepalive = false } = {}) => {
    const { version, files, openIds, activeId } = useWorkspace.getState()
    const localOk = saveWorkspace({ version, files, openIds, activeId })
    if (!disk) {
      useWorkspace.setState(localOk ? { saveStatus: 'saved', lastSavedAt: Date.now() } : { saveStatus: 'error' })
      return
    }
    // Serialise disk writes so each sync diffs against what the previous one actually wrote.
    queue = queue.then(async () => {
      try {
        await syncToDisk(synced, files, disk.fetchImpl, { keepalive })
        synced = files
        if (useWorkspace.getState().files === files)
          useWorkspace.setState({ saveStatus: 'saved', lastSavedAt: Date.now() })
      } catch {
        useWorkspace.setState({ saveStatus: 'error' })
      }
    })
  }

  const flush = (opts?: { keepalive?: boolean }) => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    save(opts)
  }

  flushNow = async () => {
    flush()
    await queue
  }
  adopt = (files) => {
    synced = files
  }

  const unsubscribe = useWorkspace.subscribe((s, prev) => {
    if (s.files === prev.files && s.openIds === prev.openIds && s.activeId === prev.activeId) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      save()
    }, DEBOUNCE_MS)
  })

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  const onUnload = () => flush({ keepalive: true })
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', onUnload)

  // Files that exist only in the browser (first run, or migrating older browser-only files) go to disk now.
  if (disk && disk.synced !== useWorkspace.getState().files) save()

  return () => {
    flushNow = null
    adopt = null
    unsubscribe()
    if (timer !== null) clearTimeout(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', onUnload)
  }
}
