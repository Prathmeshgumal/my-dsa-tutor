import { fetchDiskFiles } from '@/lib/diskStore'
import { loadWorkspace, type CodeFile } from '@/lib/storage'
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
