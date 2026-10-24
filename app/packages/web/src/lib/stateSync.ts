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

const BACKUP = (key: StateKey) => `dsa-editor:backup:${key}`
/** Browsers drop a request that outlives the page if its body is bigger than 64 KB. */
const KEEPALIVE_MAX = 60_000

let deps = {
  fetchImpl: ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch,
  delayMs: 500,
  /** Called when saving to disk starts failing (it keeps retrying). */
  onProblem: () => {},
  /** Called when saving works again after a problem. */
  onRecovered: () => {},
}

/** The latest value of each key not yet confirmed by disk. Only one save per key is on its way at a time. */
interface Entry {
  value: string
  timer: ReturnType<typeof setTimeout> | null
  sending: boolean
  failures: number
}
let waiting = new Map<StateKey, Entry>()
let failing = false

/** Test seam; also resets what's waiting. */
export function configureStateSync(next: Partial<typeof deps>) {
  for (const w of waiting.values()) if (w.timer) clearTimeout(w.timer)
  waiting = new Map()
  failing = false
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

function schedule(key: StateKey, entry: Entry, ms: number) {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    void send(key)
  }, ms)
}

async function send(key: StateKey) {
  const entry = waiting.get(key)
  if (!entry || entry.sending) return
  entry.sending = true
  const { value } = entry
  const ok = await put(key, value).then(
    (res) => res.ok,
    () => false,
  )
  entry.sending = false
  if (waiting.get(key) !== entry) return
  if (ok) {
    entry.failures = 0
    if (failing) {
      failing = false
      deps.onRecovered()
    }
    // Settled, unless it changed while this was on its way: then the newer value goes next.
    if (entry.value === value) {
      waiting.delete(key)
      localStorage.removeItem(UNSAVED(key))
    } else schedule(key, entry, deps.delayMs)
    return
  }
  entry.failures++
  if (!failing) {
    failing = true
    deps.onProblem()
  }
  schedule(key, entry, Math.min(MAX_RETRY_MS, deps.delayMs * 2 ** entry.failures))
}

function save(key: StateKey, value: string) {
  let entry = waiting.get(key)
  if (!entry) {
    entry = { value, timer: null, sending: false, failures: 0 }
    waiting.set(key, entry)
  }
  entry.value = value
  try {
    localStorage.setItem(UNSAVED(key), '1')
  } catch {
    // Only matters if the page closes before disk confirms.
  }
  // While a save is on its way, this one waits for it to finish; it's sent then.
  if (!entry.sending) schedule(key, entry, deps.delayMs)
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
    else if (saved[key] !== null) {
      // This browser's different copy is kept aside in case it held something disk's doesn't.
      if (local !== null && local !== saved[key]) remember(BACKUP(key), local)
      remember(name, saved[key])
    }
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
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    // Too big to outlive the page: still sent, and if it doesn't make it, the unsaved marker covers it.
    void put(key, entry.value, entry.value.length < KEEPALIVE_MAX).catch(() => {})
  }
}

/** The page is back (from the browser's back/forward cache): carry on saving what was still waiting. */
export function resumeState() {
  for (const [key, entry] of waiting) if (!entry.sending) schedule(key, entry, deps.delayMs)
}
