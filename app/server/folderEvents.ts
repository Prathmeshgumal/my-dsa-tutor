// Tells the browser when files in the data folders change outside the editor (VS Code, git, a script), so
// it can show the change without a reload.
//   GET /api/events → server-sent events: data: {"area":"files"|"notes"|"playground"|"problems"}
import { watch, type FSWatcher } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { FolderArea } from '../src/lib/folderEvents.ts'
import { isTempFile } from './atomicWrite.ts'
import { isOwnChange } from './ownChanges.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const ROUTE = '/api/events'
/** Changes arrive in bursts (a save, a git checkout); one event per area per burst is enough. */
const SETTLE_MS = 300
const HEARTBEAT_MS = 25_000

interface Options {
  folders: Record<FolderArea, string>
  /** Test seam. */
  watchImpl?: typeof watch
}

export function createFolderEventsMiddleware({ folders, watchImpl = watch }: Options): Middleware {
  const clients = new Set<ServerResponse>()
  let watchers: FSWatcher[] = []
  const timers = new Map<FolderArea, ReturnType<typeof setTimeout>>()

  const broadcast = (area: FolderArea) => {
    for (const res of clients) res.write(`data: ${JSON.stringify({ area })}\n\n`)
  }

  const changed = async (area: FolderArea, dir: string, name: string | null) => {
    if (name && (isTempFile(path.basename(name)) || (await isOwnChange(path.join(dir, name))))) return
    clearTimeout(timers.get(area))
    timers.set(
      area,
      setTimeout(() => {
        timers.delete(area)
        broadcast(area)
      }, SETTLE_MS),
    )
  }

  const start = () => {
    watchers = Object.entries(folders).flatMap(([area, dir]) => {
      try {
        const w = watchImpl(dir, { recursive: true }, (_event, name) => void changed(area as FolderArea, dir, name?.toString() ?? null))
        w.on('error', () => w.close())
        return [w]
      } catch {
        // A missing folder is reported by the setup check; nothing to watch here.
        return []
      }
    })
  }

  const stop = () => {
    for (const w of watchers) w.close()
    watchers = []
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
  }

  return (req, res, next) => {
    if (req.method !== 'GET' || (req.url ?? '').split('?')[0] !== ROUTE) return next()
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write(': connected\n\n')
    if (clients.size === 0) start()
    clients.add(res)
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
    res.on('close', () => {
      clearInterval(heartbeat)
      clients.delete(res)
      if (clients.size === 0) stop()
    })
  }
}
