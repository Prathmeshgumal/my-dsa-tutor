import type { CodeFile } from './storage'

const API = '/api/files'

export interface DiskFile {
  name: string
  content: string
}

const fileUrl = (name: string) => `${API}/${encodeURIComponent(name)}`

async function check(res: Response): Promise<Response> {
  if (res.ok) return res
  let message = `HTTP ${res.status}`
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string') message = body.error
  } catch {
    // keep the status-code message
  }
  throw new Error(message)
}

/** Reads every code file from the solutions folder (via the dev server). Throws if the API is unavailable. */
export async function fetchDiskFiles(fetchImpl: typeof fetch = fetch): Promise<DiskFile[]> {
  const res = await check(await fetchImpl(API))
  const body: unknown = await res.json()
  if (!Array.isArray(body)) throw new Error('Unexpected response from the files API')
  return body as DiskFile[]
}

/** Applies the difference between two snapshots to disk: deletes, then renames, then writes. */
export async function syncToDisk(
  prev: CodeFile[],
  next: CodeFile[],
  fetchImpl: typeof fetch = fetch,
  { keepalive }: { keepalive?: boolean } = {},
): Promise<void> {
  const before = new Map(prev.map((f) => [f.id, f]))
  const after = new Map(next.map((f) => [f.id, f]))
  const send = (url: string, method: string, body?: unknown) =>
    fetchImpl(url, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      ...(keepalive ? { keepalive } : {}),
    }).then(check)

  for (const old of prev) {
    if (!after.has(old.id)) await send(fileUrl(old.name), 'DELETE')
  }
  for (const file of next) {
    const old = before.get(file.id)
    if (old && old.name !== file.name) await send(`${fileUrl(old.name)}/rename`, 'POST', { to: file.name })
  }
  for (const file of next) {
    const old = before.get(file.id)
    if (!old || old.content !== file.content) await send(fileUrl(file.name), 'PUT', { content: file.content })
  }
}
