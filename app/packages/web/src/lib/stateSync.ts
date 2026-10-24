// Keeps what the editor remembers (tabs, chats, settings) on disk via /api/state, so clearing the browser,
// another browser or another port loses nothing. The browser's storage stays as a fast copy: stores read it
// synchronously, and every write to it is also sent to disk shortly after.
import type { StateStorage } from 'zustand/middleware'
import { STATE_KEYS, type SavedState, type StateKey } from '@dsa/core/appState'

const API = '/api/state'
/** Marks a change disk hasn't confirmed yet; such a change wins over disk's copy on the next visit. */
const UNSAVED = (key: StateKey) => `dsa-editor:unsaved:${key}`
const MAX_RETRY_MS = 30_000

const keyByName = new Map(Object.entries(STATE_KEYS).map(([key, name]) => [name as string, key as StateKey]))

let deps = {
  fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch,
  delayMs: 500,
  /** Called once when saving to disk starts failing (it keeps retrying). */
  onProblem: () => {},
}

/** The latest value of each key not yet confirmed by disk, and its timer. */
let waiting = new Map<StateKey, { value: string; timer: ReturnType<typeof setTimeout>; failures: number }>()
let warned = false

/** Test seam; also resets what's waiting. */
export function configureStateSync(next: Partial<typeof deps>) {
  for (const w of waiting.values()) clearTimeout(w.timer)
  waiting = new Map()
  warned = false
  deps = { ...deps, ...next }
}

function remember(name: string, value: string) {
  try {
    localStorage.setItem(name, value)
  } catch {
    // Browser storage full: disk still gets it.
  }
}

const put = (key: StateKey, value: string, keepalive = false) =>
  deps.fetchImpl(`${API}/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: value, keepalive })

async function send(key: StateKey) {
  const entry = waiting.get(key)
  if (!entry) return
  const { value } = entry
  const ok = await put(key, value).then(
    (res) => res.ok,
    () => false,
  )
  const latest = waiting.get(key)
  if (ok) {
    // Settled, unless it changed again while this was on its way.
    if (latest?.value === value) {
      waiting.delete(key)
      localStorage.removeItem(UNSAVED(key))
    }
    return
  }
  if (!latest) return
  latest.failures++
  if (!warned) {
    warned = true
    deps.onProblem()
  }
  latest.timer = setTimeout(() => void send(key), Math.min(MAX_RETRY_MS, deps.delayMs * 2 ** latest.failures))
}

function save(key: StateKey, value: string) {
  const previous = waiting.get(key)
  if (previous) clearTimeout(previous.timer)
  try {
    localStorage.setItem(UNSAVED(key), '1')
  } catch {
    // Only matters if the page closes before disk confirms.
  }
  waiting.set(key, { value, failures: previous?.failures ?? 0, timer: setTimeout(() => void send(key), deps.delayMs) })
}

/**
 * Before the app starts: takes what's saved on disk into the browser's copy. What this browser has that disk
 * doesn't (the first visit after updating, or a change that never reached disk) is sent to disk instead.
 * Returns false if the server couldn't be reached; the browser's copy is used then.
 */
export async function loadSavedState(): Promise<boolean> {
  let saved: SavedState
  try {
    const res = await deps.fetchImpl(API)
    if (!res.ok) return false
    saved = (await res.json()) as SavedState
  } catch {
    return false
  }
  for (const [key, name] of Object.entries(STATE_KEYS) as [StateKey, string][]) {
    const local = localStorage.getItem(name)
    const unsaved = localStorage.getItem(UNSAVED(key)) !== null
    if (local !== null && (unsaved || saved[key] === null)) save(key, local)
    else if (saved[key] !== null) remember(name, saved[key])
  }
  return true
}

/** For stores: reads the browser's copy, and writes to disk and to it. A full browser storage still throws, as before. */
export const stateStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    const key = keyByName.get(name)
    if (key) save(key, value)
    localStorage.setItem(name, value)
  },
  removeItem: (name) => localStorage.removeItem(name),
}

/** The page is closing: send what's still waiting now, in requests that outlive the page. */
export function flushState() {
  for (const [key, entry] of waiting) {
    clearTimeout(entry.timer)
    void put(key, entry.value, true).catch(() => {})
  }
}
