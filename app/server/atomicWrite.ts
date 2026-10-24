// Saves a file so that a crash or power cut mid-save can never leave it half-written: the content goes to
// a temporary file next to it, is flushed to disk, and then replaces the file in one step (rename).
import { randomBytes } from 'node:crypto'
import { link, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { noteOwnChange } from './ownChanges.ts'

/** Temporary files end in this, so folder listings and watchers can skip them. */
export const TEMP_SUFFIX = '.saving'

export const isTempFile = (name: string) => name.endsWith(TEMP_SUFFIX)

/**
 * Writes `content` to `file` atomically. With `exclusive`, fails with EEXIST (like flag 'wx') instead of
 * replacing a file that is already there.
 */
export async function writeFileAtomic(file: string, content: string, { exclusive = false } = {}): Promise<void> {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}${TEMP_SUFFIX}`)
  noteOwnChange(file, content)
  try {
    const handle = await open(temp, 'wx')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    // link() refuses to replace an existing file, which is what exclusive needs; rename() replaces it.
    if (exclusive) await link(temp, file)
    else await rename(temp, file)
  } finally {
    await rm(temp, { force: true })
  }
}
