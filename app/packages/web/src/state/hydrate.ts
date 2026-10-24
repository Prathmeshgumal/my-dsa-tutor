import { fetchDiskFiles } from '@/lib/diskStore'
import { loadWorkspace, type CodeFile } from '@/lib/storage'
import { adoptDiskFiles } from './autosave'
import { useWorkspace } from './workspace'

/**
 * Loads files from the solutions folder on disk (the source of truth), keeping the browser's ids,
 * open tabs and active file where names still match. Returns the snapshot that is already on disk.
 * An empty folder keeps the browser's files (first run, or migrating older browser-only files) as unsynced.
 */
export async function hydrateFromDisk(fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; synced: CodeFile[] }> {
  const local = loadWorkspace()
  try {
    const disk = await fetchDiskFiles(fetchImpl)
    if (disk.length === 0) {
      useWorkspace.setState({ ...local, ready: true })
      return { ok: true, synced: [] }
    }
    const idByName = new Map(local.files.map((f) => [f.name, f.id]))
    const files: CodeFile[] = disk.map(({ name, content }) => ({
      id: idByName.get(name) ?? crypto.randomUUID(),
      name,
      content,
    }))
    const ids = new Set(files.map((f) => f.id))
    const openIds = local.openIds.filter((id) => ids.has(id))
    const activeId = local.activeId !== null && openIds.includes(local.activeId) ? local.activeId : null
    useWorkspace.setState({ version: 1, files, openIds, activeId, ready: true })
    return { ok: true, synced: files }
  } catch {
    useWorkspace.setState({ ...local, ready: true })
    return { ok: false, synced: [] }
  }
}

/**
 * Re-reads the solutions folder after Claude, or something outside the editor, changed files: updates edited files, adds new ones and
 * drops deleted ones, keeping ids (and so tabs) by name. Unchanged files keep their object identity.
 */
export async function refreshFromDisk(fetchImpl: typeof fetch = fetch): Promise<void> {
  let disk
  try {
    disk = await fetchDiskFiles(fetchImpl)
  } catch {
    return
  }
  const { files: current, openIds, activeId } = useWorkspace.getState()
  const byName = new Map(current.map((f) => [f.name, f]))
  const files: CodeFile[] = disk.map(({ name, content }) => {
    const existing = byName.get(name)
    if (!existing) return { id: crypto.randomUUID(), name, content }
    return existing.content === content ? existing : { ...existing, content }
  })
  // Nothing changed (often the case: the change was the editor's own save).
  if (files.length === current.length && files.every((f, i) => f === current[i])) return
  const ids = new Set(files.map((f) => f.id))
  const nextOpen = openIds.filter((id) => ids.has(id))
  const nextActive = activeId !== null && ids.has(activeId) ? activeId : (nextOpen[0] ?? null)
  useWorkspace.setState({ files, openIds: nextOpen, activeId: nextActive })
  adoptDiskFiles(files)
}
