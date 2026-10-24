// Remembers the changes the server itself just made to the data folders, so the folder watcher
// (./folderEvents.ts) only tells the browser about changes made outside the editor, e.g. in VS Code.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** How long after the server touches a path its watcher events are still treated as its own. */
const WINDOW_MS = 2000

/** A write is recognised by what it wrote; deletes, renames and new folders by when they happened. */
const recent = new Map<string, { at: number; hash?: string }>()

const hashOf = (content: string) => createHash('sha1').update(content).digest('hex')

/**
 * Call when the server writes (with the content), renames or deletes `file`. Without content, a folder
 * covers everything inside it.
 */
export function noteOwnChange(file: string, content?: string, now = Date.now()): void {
  recent.set(path.resolve(file), { at: now, ...(content !== undefined ? { hash: hashOf(content) } : {}) })
  if (recent.size > 500) {
    for (const [p, e] of recent) if (now - e.at > WINDOW_MS) recent.delete(p)
  }
}

/** Whether a watcher event for `file` is the server's own doing. */
export async function isOwnChange(file: string, now = Date.now()): Promise<boolean> {
  const target = path.resolve(file)
  const written = recent.get(target)
  // A file the server wrote: it's ours only while it still holds exactly what we wrote, however soon
  // after our write someone else changed it.
  if (written?.hash) {
    const current = now - written.at <= WINDOW_MS ? await readFile(target, 'utf8').catch(() => null) : null
    if (current !== null && hashOf(current) === written.hash) return true
    // Changed by someone else (or long ago): from now on the file's changes aren't ours.
    recent.delete(target)
    return false
  }
  for (const [p, e] of recent) {
    if (e.hash || now - e.at > WINDOW_MS) continue
    if (target === p || target.startsWith(p + path.sep)) return true
  }
  return false
}
