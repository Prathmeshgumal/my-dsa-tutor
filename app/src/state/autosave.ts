import { syncToDisk } from '@/lib/diskStore'
import { saveWorkspace, type CodeFile } from '@/lib/storage'
import { useWorkspace } from './workspace'

const DEBOUNCE_MS = 500

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
    unsubscribe()
    if (timer !== null) clearTimeout(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', onUnload)
  }
}
